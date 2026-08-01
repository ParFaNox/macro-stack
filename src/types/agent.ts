/**
 * Teammate 2 (agent layer) local types.
 *
 * These deliberately live OUTSIDE `src/types/index.ts`. That file is the
 * three-way shared contract between all teammates — editing it from a feature
 * branch guarantees a merge conflict. Anything only the agent layer needs
 * belongs here instead.
 */

import type { ActiveIngredient, AgentReasoningLog, SupplementProduct } from '@/types';

/** Which backend produced a label audit. Surfaced in logs so a demo is never
 *  silently passing off mock data as a live model call. */
export type AuditSource = 'LIVE_VISION_MODEL' | 'DETERMINISTIC_MOCK';

/** Structured result of reading one supplement nutrition label. */
export interface LabelAuditResult {
  imageUrl: string;
  source: AuditSource;
  /** Model id used, when `source` is LIVE_VISION_MODEL. */
  modelId?: string;
  activeIngredients: ActiveIngredient[];
  servingsPerContainer: number;
  /** Deceptive-label signals: proprietary blends, unquantified "matrix" callouts,
   *  filler-heavy formulas. Drives WARNING-level reasoning logs. */
  fillerCallouts: string[];
  /** Share of the serving that is NOT active ingredient, 0-100. */
  fillerPercentage: number;
  /** Model/heuristic confidence in the extraction, 0-1. */
  confidence: number;
  notes?: string;
}

/** Request body for POST /api/audit-label (JSON form). */
export interface AuditLabelRequest {
  imageUrl: string;
}

/** Response body for POST /api/audit-label. */
export interface AuditLabelResponse {
  audit: LabelAuditResult;
  reasoningLogs: AgentReasoningLog[];
}

/** A catalog product scored by the optimizer, before stack selection. */
export interface RankedCandidate {
  product: SupplementProduct;
  /** Which requested target ingredient this product was matched to. */
  matchedIngredient: string;
  /** Total grams of active ingredient in the whole container. */
  totalActiveGrams: number;
  /** USD per gram of pure active ingredient — the honest price metric. */
  costPerGramActiveUSD: number;
  /** costPerGramActiveUSD after the brand's trust score is folded in. This is
   *  what the optimizer actually sorts on. */
  effectiveCostPerGramUSD: number;
  audit: LabelAuditResult;
  trust: BrandTrust;
}

/**
 * Catalog seed shape. Holds only what a vendor listing would actually give you;
 * every derived field on `SupplementProduct` (costPerGramActiveUSD,
 * discountedPriceUSD) is computed by the optimizer rather than hand-written,
 * so the seed data can't drift out of sync with the math.
 */
export interface CatalogEntry {
  id: string;
  brand: string;
  productName: string;
  imageUrl: string;
  labelImageUrl: string;
  totalPriceUSD: number;
  servingsPerContainer: number;
  activeIngredients: ActiveIngredient[];
  subscribeAndSaveDiscountPct: number;
  checkoutUrl: string;
  vendorName: string;
  /** Ingredient family used to match against StackOptimizationRequest.targetIngredients. */
  ingredientFamily: string;
  /** Label-quality signals the mock auditor reports; a live model would read
   *  these off the image instead. */
  fillerCallouts?: string[];

  // --- Fields used only to render the supplement-facts panel image ---
  /** Total serving size including inactive excipients. Defaults to the active
   *  total plus a small excipient allowance. */
  servingSizeGrams?: number;
  /** Scoop/capsule wording for the serving line. */
  servingUnit?: string;
  /** "Other Ingredients:" footer line. */
  otherIngredients?: string[];
  /** When set, the panel renders a proprietary blend that hides per-ingredient
   *  dosing — the exact pattern the auditor is meant to catch. */
  proprietaryBlend?: {
    name: string;
    totalMg: number;
    /** Listed in descending order by weight, as regulations require, but with
     *  no individual amounts. */
    components: string[];
  };
}

// --- Brand trust signal (Senso) ---------------------------------------------

/** Where a trust verdict came from. `UNVERIFIED_*` values all carry a neutral
 *  score — the pipeline never invents a trust number it cannot source. */
export type TrustSource =
  | 'SENSO_VERIFIED'
  | 'UNVERIFIED_NO_KEY'
  | 'UNVERIFIED_NO_RECORD'
  | 'UNVERIFIED_ERROR';

export interface TrustCitation {
  title: string;
  excerpt: string;
  url?: string;
}

export interface BrandTrust {
  brand: string;
  /** 0-1. Exactly 0.5 whenever `source` is unverified. */
  score: number;
  /** Verbatim from Senso when verified — this is what the user reads. */
  verdict: string;
  /** Parsed positive/negative markers, for compact UI display. */
  signals: string[];
  citations: TrustCitation[];
  source: TrustSource;
  notes?: string;
}
