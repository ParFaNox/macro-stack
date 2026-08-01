import { z } from 'zod';

import type { ActiveIngredient } from '@/types';
import type { LabelAuditResult } from '@/types/agent';

import { SUPPLEMENT_CATALOG, findCatalogEntryById } from './catalog';
import { activeGramsPerServing, calculateCostPerGram, totalActiveGrams } from './optimizer-engine';
import { auditNutritionLabel } from './vision-auditor';

/**
 * MCP tool definitions.
 *
 * Schemas and handlers live here rather than inside the server so the HTTP
 * routes can call the exact same logic. One implementation, two transports.
 */

const ActiveIngredientSchema = z.object({
  name: z.string().min(1),
  amountPerServingGrams: z.number().nonnegative(),
  purityPercentage: z.number().min(0).max(100),
});

// --- audit_supplement_label --------------------------------------------------

export const auditSupplementLabelInput = {
  labelImageUrl: z
    .string()
    .min(1)
    .describe('URL or data: URI of the supplement facts panel image to audit'),
};

export async function auditSupplementLabel(args: {
  labelImageUrl: string;
}): Promise<LabelAuditResult> {
  return auditNutritionLabel(args.labelImageUrl);
}

// --- evaluate_ingredient_purity ---------------------------------------------

export const evaluateIngredientPurityInput = {
  activeIngredients: z
    .array(ActiveIngredientSchema)
    .min(1)
    .describe('Active ingredients as printed on the label'),
  servingSizeGrams: z
    .number()
    .positive()
    .optional()
    .describe('Total serving size in grams, including inactive filler. Defaults to the sum of active amounts.'),
};

export interface PurityEvaluation {
  activeGramsPerServing: number;
  declaredGramsPerServing: number;
  servingSizeGrams: number;
  /** Share of the serving that is genuinely active compound, 0-100. */
  effectivePurityPercentage: number;
  fillerPercentage: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  verdict: string;
}

function purityGrade(pct: number): PurityEvaluation['grade'] {
  if (pct >= 95) return 'A';
  if (pct >= 85) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}

export function evaluateIngredientPurity(args: {
  activeIngredients: ActiveIngredient[];
  servingSizeGrams?: number;
}): PurityEvaluation {
  const active = activeGramsPerServing(args.activeIngredients);
  const declared = args.activeIngredients.reduce((s, i) => s + i.amountPerServingGrams, 0);
  const servingSize = args.servingSizeGrams ?? declared;

  const effectivePurityPercentage = servingSize > 0 ? (active / servingSize) * 100 : 0;
  const fillerPercentage = Math.max(0, 100 - effectivePurityPercentage);
  const grade = purityGrade(effectivePurityPercentage);

  return {
    activeGramsPerServing: Number(active.toFixed(3)),
    declaredGramsPerServing: Number(declared.toFixed(3)),
    servingSizeGrams: Number(servingSize.toFixed(3)),
    effectivePurityPercentage: Number(effectivePurityPercentage.toFixed(2)),
    fillerPercentage: Number(fillerPercentage.toFixed(2)),
    grade,
    verdict:
      grade === 'A'
        ? 'Clean single-ingredient formula, negligible filler.'
        : grade === 'B'
          ? 'Mostly active with modest excipient load.'
          : grade === 'C'
            ? 'Noticeable filler content — check for undisclosed blend dosing.'
            : grade === 'D'
              ? 'Filler-heavy. Cost per active gram will be far worse than sticker price implies.'
              : 'Majority filler. Sticker price is not a meaningful comparison.',
  };
}

// --- calculate_true_cost -----------------------------------------------------

export const calculateTrueCostInput = {
  productId: z
    .string()
    .optional()
    .describe('Seed catalog product id. Supply this instead of the explicit fields below.'),
  totalPriceUSD: z.number().positive().optional(),
  servingsPerContainer: z.number().positive().optional(),
  activeIngredients: z.array(ActiveIngredientSchema).optional(),
  subscribeAndSaveDiscountPct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Subscribe & Save percentage, used to also report the discounted cost per gram'),
};

export interface TrueCostResult {
  productId?: string;
  totalPriceUSD: number;
  servingsPerContainer: number;
  totalActiveGrams: number;
  costPerGramActiveUSD: number;
  discountedPriceUSD?: number;
  discountedCostPerGramActiveUSD?: number;
  formula: string;
}

export function calculateTrueCost(args: {
  productId?: string;
  totalPriceUSD?: number;
  servingsPerContainer?: number;
  activeIngredients?: ActiveIngredient[];
  subscribeAndSaveDiscountPct?: number;
}): TrueCostResult {
  let { totalPriceUSD, servingsPerContainer, activeIngredients, subscribeAndSaveDiscountPct } =
    args;

  if (args.productId) {
    const entry = findCatalogEntryById(args.productId);
    if (!entry) {
      throw new Error(
        `Unknown productId "${args.productId}". Known ids: ${SUPPLEMENT_CATALOG.map((e) => e.id).join(', ')}`,
      );
    }
    totalPriceUSD ??= entry.totalPriceUSD;
    servingsPerContainer ??= entry.servingsPerContainer;
    activeIngredients ??= entry.activeIngredients;
    subscribeAndSaveDiscountPct ??= entry.subscribeAndSaveDiscountPct;
  }

  if (totalPriceUSD === undefined || servingsPerContainer === undefined || !activeIngredients) {
    throw new Error(
      'Supply either productId, or all of totalPriceUSD, servingsPerContainer and activeIngredients.',
    );
  }

  const grams = totalActiveGrams(activeIngredients, servingsPerContainer);
  const costPerGram = calculateCostPerGram({
    totalPriceUSD,
    servingsPerContainer,
    activeIngredients,
  });

  const result: TrueCostResult = {
    ...(args.productId ? { productId: args.productId } : {}),
    totalPriceUSD,
    servingsPerContainer,
    totalActiveGrams: Number(grams.toFixed(3)),
    costPerGramActiveUSD: Number.isFinite(costPerGram) ? Number(costPerGram.toFixed(4)) : Infinity,
    formula:
      'totalPriceUSD / (servingsPerContainer * SUM(amountPerServingGrams * purityPercentage/100))',
  };

  if (subscribeAndSaveDiscountPct !== undefined && subscribeAndSaveDiscountPct > 0) {
    const discounted = totalPriceUSD * (1 - subscribeAndSaveDiscountPct / 100);
    result.discountedPriceUSD = Number(discounted.toFixed(2));
    result.discountedCostPerGramActiveUSD =
      grams > 0 ? Number((discounted / grams).toFixed(4)) : Infinity;
  }

  return result;
}
