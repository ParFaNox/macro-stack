import type { SupplementProduct } from '@/types';
import type { CatalogEntry } from '@/types/agent';

import { INGREDIENT_FAMILIES } from './catalog';
import { suggestIngredients } from './ingredient-index';
import { calculateCostPerGram, toSupplementProduct, totalActiveGrams } from './optimizer-engine';
import { searchProducts } from './product-search';
import { getBrandTrust, trustGrade } from './trust-signal';
import { auditNutritionLabel } from './vision-auditor';

/**
 * Tools the agent can choose to call.
 *
 * These wrap functions that already existed and were previously invoked in a
 * fixed order by `optimizeStack`. Nothing here reimplements logic — the point
 * is that a model now decides *which* to call and *when*, instead of a
 * hardcoded sequence.
 *
 * Two deliberate constraints:
 *
 * 1. No tool spends money. The agent researches and proposes; minting a card
 *    and running checkout stay behind the human approval gate. An agent that
 *    can buy without asking is the thing this product exists to prevent.
 * 2. Arithmetic is a tool, not a model output. `calculate_true_cost` runs the
 *    real function, so the numbers a user sees are computed, never generated.
 */

export interface ToolContext {
  /** Products the agent has discovered, keyed by id, so later tools can refer
   *  to them without the model having to echo whole objects back. */
  discovered: Map<string, CatalogEntry>;
  budgetUSD: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Short label for the UI trace. */
  summarise: (args: Record<string, never>) => string;
  run: (args: Record<string, never>, ctx: ToolContext) => Promise<unknown>;
}

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'search_products',
    description:
      'Find supplement products for one ingredient (e.g. "creatine", "whey protein"). ' +
      'Returns candidates with brand, price, servings and a label image to audit. ' +
      'Call this once per ingredient you want to buy.',
    parameters: {
      type: 'object',
      properties: {
        ingredient: str('The supplement to search for, e.g. "creatine" or "whey protein"'),
      },
      required: ['ingredient'],
    },
    summarise: (a) => `Searching for ${a.ingredient}`,
    async run(args, ctx) {
      const { ingredient } = args as unknown as { ingredient: string };
      const result = await searchProducts(ingredient);

      for (const entry of result.entries) ctx.discovered.set(entry.id, entry);

      return {
        source: result.sourceMode,
        ...(result.fallbackReason ? { note: result.fallbackReason } : {}),
        found: result.entries.length,
        products: result.entries.map((e) => ({
          id: e.id,
          brand: e.brand,
          name: e.productName,
          priceUSD: e.totalPriceUSD,
          subscribeAndSavePct: e.subscribeAndSaveDiscountPct,
          servings: e.servingsPerContainer,
          vendor: e.vendorName,
          labelImageUrl: e.labelImageUrl,
        })),
        ...(result.entries.length === 0
          ? {
              hint:
                `No products for "${ingredient}". Auditable ingredients are: ` +
                `${INGREDIENT_FAMILIES.join(', ')}. Suggestions: ` +
                suggestIngredients(ingredient, 3)
                  .map((s) => `${s.label}${s.auditable ? '' : ' (no pricing data)'}`)
                  .join(', '),
            }
          : {}),
      };
    },
  },

  {
    name: 'audit_supplement_label',
    description:
      "Read a product's supplement facts panel with a vision model. Returns the real " +
      'active ingredients, grams per serving, purity, and any deceptive-labelling flags ' +
      '(proprietary blends, amino spiking, underdosing). Use this before trusting a price — ' +
      'a cheap product with 40% filler is not cheap.',
    parameters: {
      type: 'object',
      properties: { productId: str('The product id returned by search_products') },
      required: ['productId'],
    },
    summarise: (a) => `Reading the label for ${a.productId}`,
    async run(args, ctx) {
      const { productId } = args as unknown as { productId: string };
      const entry = ctx.discovered.get(productId);
      if (!entry) return { error: `Unknown productId "${productId}". Call search_products first.` };

      const audit = await auditNutritionLabel(entry.labelImageUrl);
      return {
        productId,
        source: audit.source,
        activeIngredients: audit.activeIngredients,
        servingsPerContainer: audit.servingsPerContainer,
        fillerPercentage: audit.fillerPercentage,
        deceptiveLabellingFlags: audit.fillerCallouts,
        confidence: audit.confidence,
      };
    },
  },

  {
    name: 'check_brand_trust',
    description:
      'Look up a brand against third-party verification records (NSF Certified for Sport, ' +
      'Informed Sport, FDA enforcement history, label-accuracy findings). Returns a 0-1 ' +
      'score, a letter grade and the evidence. Use it when a price looks too good.',
    parameters: {
      type: 'object',
      properties: { brand: str('Brand name, exactly as returned by search_products') },
      required: ['brand'],
    },
    summarise: (a) => `Checking third-party record for ${a.brand}`,
    async run(args) {
      const { brand } = args as unknown as { brand: string };
      const trust = await getBrandTrust(brand);
      return {
        brand,
        score: trust.score,
        grade: trustGrade(trust.score),
        verified: trust.source === 'SENSO_VERIFIED',
        signals: trust.signals,
        verdict: trust.verdict.slice(0, 400),
        citations: trust.citations.map((c) => c.title),
      };
    },
  },

  {
    name: 'calculate_true_cost',
    description:
      'Compute USD per gram of ACTUAL active ingredient for a product, using the audited ' +
      'label. This is the only honest way to compare prices, because sticker price ignores ' +
      'filler and serving count. Always call this before deciding — do not estimate it yourself.',
    parameters: {
      type: 'object',
      properties: { productId: str('The product id returned by search_products') },
      required: ['productId'],
    },
    summarise: (a) => `Computing true cost per active gram for ${a.productId}`,
    async run(args, ctx) {
      const { productId } = args as unknown as { productId: string };
      const entry = ctx.discovered.get(productId);
      if (!entry) return { error: `Unknown productId "${productId}". Call search_products first.` };

      const audit = await auditNutritionLabel(entry.labelImageUrl);
      const product = toSupplementProduct(entry, audit);

      return {
        productId,
        brand: product.brand,
        name: product.productName,
        listPriceUSD: product.totalPriceUSD,
        subscribeAndSavePriceUSD: product.discountedPriceUSD,
        totalActiveGrams: Number(
          totalActiveGrams(product.activeIngredients, product.servingsPerContainer).toFixed(2),
        ),
        costPerActiveGramUSD: product.costPerGramActiveUSD,
        subscribeAndSaveCostPerActiveGramUSD: Number(
          (
            calculateCostPerGram({
              totalPriceUSD: product.discountedPriceUSD,
              servingsPerContainer: product.servingsPerContainer,
              activeIngredients: product.activeIngredients,
            }) || 0
          ).toFixed(4),
        ),
        formula: 'price / (servings x grams-per-serving x purity)',
      };
    },
  },

  {
    name: 'propose_stack',
    description:
      'FINAL STEP. Propose the stack you have decided on, for the user to approve and buy. ' +
      'Only call this once, after you have audited labels and computed true costs. The total ' +
      'must be within budget. Explain each pick and what it beat.',
    parameters: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Product ids to buy, one per ingredient',
        },
        reasoning: str('Why these, in 2-4 sentences a shopper would understand'),
        rejected: {
          type: 'array',
          items: {
            type: 'object',
            properties: { productId: str('id'), why: str('why it lost') },
            required: ['productId', 'why'],
          },
          description: 'Notable products you considered and rejected, with the reason',
        },
      },
      required: ['productIds', 'reasoning'],
    },
    summarise: (a) =>
      `Proposing a stack of ${(a.productIds as unknown as string[])?.length ?? 0} products`,
    async run(args, ctx) {
      const { productIds, reasoning, rejected } = args as unknown as {
        productIds: string[];
        reasoning: string;
        rejected?: Array<{ productId: string; why: string }>;
      };

      const products: SupplementProduct[] = [];
      const missing: string[] = [];

      for (const id of productIds ?? []) {
        const entry = ctx.discovered.get(id);
        if (!entry) {
          missing.push(id);
          continue;
        }
        products.push(toSupplementProduct(entry, await auditNutritionLabel(entry.labelImageUrl)));
      }

      if (missing.length) {
        return { error: `Unknown product ids: ${missing.join(', ')}. Use ids from search_products.` };
      }

      const total = Number(products.reduce((s, p) => s + p.discountedPriceUSD, 0).toFixed(2));
      const retail = Number(products.reduce((s, p) => s + p.totalPriceUSD, 0).toFixed(2));

      // The budget is enforced here, not trusted to the model. A proposal over
      // budget is rejected and the agent is told to try again.
      if (total > ctx.budgetUSD) {
        return {
          error:
            `Proposed total $${total.toFixed(2)} exceeds the $${ctx.budgetUSD.toFixed(2)} budget. ` +
            'Choose cheaper options or drop an ingredient, then call propose_stack again.',
        };
      }

      return {
        accepted: true,
        products,
        totalUSD: total,
        retailUSD: retail,
        savedUSD: Number((retail - total).toFixed(2)),
        reasoning,
        rejected: rejected ?? [],
      };
    },
  },
];

export const TOOLS_BY_NAME = new Map(AGENT_TOOLS.map((t) => [t.name, t]));

/** OpenAI-compatible tool schema, which Gemini's compat endpoint also accepts. */
export function toolSchemas() {
  return AGENT_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export { num };
