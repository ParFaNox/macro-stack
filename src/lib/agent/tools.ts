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
  /** Ingredient families already searched this run, so a repeat is caught. */
  searched: Set<string>;
  budgetUSD: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Short label for the UI trace. Gets the context so it can name a product
   *  the user recognises instead of echoing an internal id. */
  summarise: (args: Record<string, never>, ctx: ToolContext) => string;
  run: (args: Record<string, never>, ctx: ToolContext) => Promise<unknown>;
}

/**
 * Ceiling on searches per run. Four covers any realistic stack (the catalog has
 * five families and a user asks for two or three), while making a rephrasing
 * loop terminate instead of eating the whole turn budget.
 */
const MAX_SEARCHES_PER_RUN = 4;

/**
 * Explains an id the agent does not actually have.
 *
 * The old message said "call search_products first", which was wrong whenever a
 * search HAD run — and that is exactly when this fires. Observed: the model
 * batched audits into the same turn as the search, so it had no ids yet and
 * invented plausible-looking ones ("product_id_from_creatine_search"), then
 * looped on the same bad advice for the whole run.
 *
 * So: name the mistake, and hand back the ids that genuinely exist. A model can
 * correct itself from a list; it cannot correct itself from a instruction that
 * does not apply.
 */
function unknownProduct(productId: unknown, ctx: ToolContext): Record<string, unknown> {
  const id = String(productId);
  const available = [...ctx.discovered.keys()];

  if (available.length === 0) {
    return { error: `No products discovered yet. Call search_products before using "${id}".` };
  }

  const invented = /^(product|item)[_-]?id|from[_-]search|placeholder|example/i.test(id);

  return {
    error:
      (invented
        ? `"${id}" is a placeholder, not a real id — you used it before the search results came back. `
        : `Unknown productId "${id}". `) +
      'Use one of the ids below, exactly as written. Do not call audit or cost tools in the ' +
      'same turn as a search: you cannot know the ids until the search result arrives.',
    availableProductIds: available.slice(0, 10),
  };
}

/**
 * Attaches the brand's trust grade to each candidate, server-side.
 *
 * Previously the agent had to call check_brand_trust once per brand to learn
 * this, which is four extra round-trips on a two-ingredient stack — the user
 * watched it discover, one call at a time, that brands it was never going to
 * buy were unverified. The lookups are cached and independent, so doing them
 * here in parallel costs about as much as the slowest one and removes those
 * turns entirely.
 *
 * Grade F is dropped rather than reported. F means Senso holds actual negative
 * evidence — an FDA warning letter, a failed label-accuracy test — so there is
 * no version of "best value" that ends with buying it, and surfacing it only
 * invites the agent to spend a turn rejecting it.
 *
 * UNVERIFIED is NOT dropped. Most real supplement brands have no third-party
 * record at all; filtering them would leave an empty shelf and quietly imply
 * the remaining few were vetted. They are labelled and kept.
 */
async function withTrust(entries: CatalogEntry[]): Promise<unknown[]> {
  const ranked = entries
    .map((e) => ({ e, costPerGramUSD: Number(calculateCostPerGram(e).toFixed(4)) }))
    .sort((a, b) => a.costPerGramUSD - b.costPerGramUSD)
    .slice(0, 6);

  const withGrades = await Promise.all(
    ranked.map(async ({ e, costPerGramUSD }) => {
      const trust = await getBrandTrust(e.brand).catch(() => null);
      return {
        id: e.id,
        brand: e.brand,
        name: e.productName.slice(0, 60),
        priceUSD: e.totalPriceUSD,
        subscribeAndSavePct: e.subscribeAndSaveDiscountPct,
        servings: e.servingsPerContainer,
        vendor: e.vendorName,
        costPerGramUSD,
        trustGrade: trust ? trustGrade(trust.score) : '?',
        trustVerified: trust ? trust.source === 'SENSO_VERIFIED' : false,
      };
    }),
  );

  return withGrades.filter((p) => p.trustGrade !== 'F').slice(0, 5);
}

/** Turns an internal product id into something a person recognises. */
function label(productId: unknown, ctx: ToolContext): string {
  const entry = ctx.discovered.get(String(productId));
  return entry ? `${entry.brand} ${entry.productName}`.slice(0, 52) : String(productId);
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

      // The ceiling is checked BEFORE the search, not after.
      //
      // It used to run the search, add every result to `discovered`, and only
      // then refuse — so a run that asked for eight ingredients still paid for
      // eight merchant round-trips and still grew to 44 candidates, which is
      // what pushed the transcript past the provider's request-size limit. The
      // refusal was honest and completely ineffective.
      if (ctx.searched.size >= MAX_SEARCHES_PER_RUN) {
        return {
          error:
            `Search limit reached (${MAX_SEARCHES_PER_RUN} per run) — this search was not ` +
            `run. You already have ${ctx.discovered.size} candidates across ` +
            `${[...ctx.searched].join(', ')}. Pick from those: audit the cheapest, then ` +
            'call propose_stack.',
          candidateIds: [...ctx.discovered.keys()].slice(0, 12),
        };
      }

      const result = await searchProducts(ingredient);

      for (const entry of result.entries) ctx.discovered.set(entry.id, entry);

      // Searching the same ingredient twice is a loop, not research. Observed:
      // a run spent 11 of its 12 turns rephrasing the same two searches
      // ("electrolyte powder", "electrolyte drink mix", "LMNT Recharge") and
      // never proposed anything.
      const family = result.entries[0]?.ingredientFamily ?? ingredient.toLowerCase();

      if (ctx.searched.has(family)) {
        return {
          alreadySearched: family,
          found: result.entries.length,
          note:
            `You already searched ${family} and have these candidates. Searching again ` +
            'returns the same products. Audit them with audit_supplement_label, price them ' +
            'with calculate_true_cost, then call propose_stack.',
          products: result.entries.slice(0, 6).map((e) => ({
            id: e.id,
            brand: e.brand,
            name: e.productName.slice(0, 60),
            priceUSD: e.totalPriceUSD,
            servings: e.servingsPerContainer,
          })),
        };
      }
      ctx.searched.add(family);

      return {
        source: result.sourceMode,
        ...(result.fallbackReason ? { note: result.fallbackReason } : {}),
        found: result.entries.length,
        // Trimmed deliberately. Image URLs are long, the model never needs one
        // (it audits by id), and on a free-tier token budget those wasted
        // tokens are the difference between finishing a run and a 429.
        // Sorted cheapest-per-gram first, with that figure included.
        //
        // Without it the agent had to audit and price every candidate before it
        // could rank anything, which with 23 real products took more tool calls
        // than a run is allowed. The number comes from the same function
        // calculate_true_cost uses, on merchant-stated price and servings — so
        // it is a real computation, not an estimate the model invented, and an
        // audit can still revise it downward when a label hides filler.
        products: await withTrust(result.entries),
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
    summarise: (a, ctx) => `Reading the label for ${label(a.productId, ctx)}`,
    async run(args, ctx) {
      const { productId } = args as unknown as { productId: string };
      const entry = ctx.discovered.get(productId);
      if (!entry) return unknownProduct(productId, ctx);

      const audit = await auditNutritionLabel(entry.labelImageUrl);
      return {
        productId,
        source: audit.source,
        activeIngredients: audit.activeIngredients.slice(0, 6),
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
        // Trimmed: the model needs the finding, not the essay, and every
        // character here is resent on every later turn.
        verdict: trust.verdict.slice(0, 220),
        citations: trust.citations.slice(0, 3).map((c) => c.title),
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
    summarise: (a, ctx) => `Costing ${label(a.productId, ctx)} per active gram`,
    async run(args, ctx) {
      const { productId } = args as unknown as { productId: string };
      const entry = ctx.discovered.get(productId);
      if (!entry) return unknownProduct(productId, ctx);

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
        return {
          error:
            `Unknown product ids: ${missing.join(', ')}. Propose using ids exactly as ` +
            'search_products returned them — not names, and not ids you constructed.',
          availableProductIds: [...ctx.discovered.keys()].slice(0, 10),
        };
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
        // Resolved to real names here rather than in the UI. "It rejected
        // prava_huge_supplements_creatine_monohydrate_powder_2" is unreadable;
        // "Huge Supplements Creatine Monohydrate Powder" is the same fact in a
        // form a buyer can act on. Ids the agent invented resolve to nothing,
        // so they are dropped rather than shown raw.
        rejected: (rejected ?? [])
          .map((r) => {
            const entry = ctx.discovered.get(r.productId);
            return entry
              ? { productId: `${entry.brand} ${entry.productName}`.slice(0, 60), why: r.why }
              : null;
          })
          .filter((r): r is { productId: string; why: string } => r !== null),
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
