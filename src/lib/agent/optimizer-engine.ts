import type {
  ActiveIngredient,
  StackOptimizationRequest,
  StackOptimizationResult,
  SupplementProduct,
} from '@/types';
import type { CatalogEntry, LabelAuditResult, RankedCandidate } from '@/types/agent';

import { matchIngredientFamily } from './catalog';
import { searchProducts } from './product-search';
import { ReasoningLogCollector } from './logger';
import { auditNutritionLabel, hasVisionKey } from './vision-auditor';
import { getBrandTrust, hasSensoKey, trustGrade } from './trust-signal';

/**
 * Folds a brand's trust score into its cost per active gram.
 *
 * A verified brand's price is taken at face value; an untrustworthy one is
 * penalised, because a label you cannot trust makes its own cost-per-gram
 * unreliable. Neutral (0.5) leaves the number unchanged, so a run with no Senso
 * key ranks exactly as it did before — trust can only ever reorder things when
 * there is real evidence behind it.
 *
 * Penalty is capped at 2x so a bad grade demotes a product without making it
 * mathematically unpickable; the reasoning feed still shows the raw price.
 */
export function trustAdjustedCost(costPerGramUSD: number, trustScore: number): number {
  if (!Number.isFinite(costPerGramUSD)) return costPerGramUSD;
  const penalty = 1 + Math.max(0, 0.5 - trustScore) * 2;
  return Number((costPerGramUSD * penalty).toFixed(4));
}

/**
 * Cost-per-active-gram engine and stack selector.
 *
 * The pure functions here have no I/O and no dependency on the vision layer, so
 * the arithmetic can be checked in isolation.
 */

/**
 * Grams of *pure* active compound in one serving.
 *
 * NOTE ON THE FORMULA: the task doc writes cost-per-gram as
 *   totalPriceUSD / (servingsPerContainer * sumOfActiveGrams * purityPercentage)
 * but `purityPercentage` is stored 0-100 (e.g. 99.5), so using it raw makes the
 * result ~100x too small. Purity is divided by 100 here. This number is shown
 * in the UI, so the units matter.
 */
export function activeGramsPerServing(ingredients: ActiveIngredient[]): number {
  return ingredients.reduce(
    (sum, i) => sum + i.amountPerServingGrams * (i.purityPercentage / 100),
    0,
  );
}

/** Total grams of pure active compound in a whole container. */
export function totalActiveGrams(
  ingredients: ActiveIngredient[],
  servingsPerContainer: number,
): number {
  return activeGramsPerServing(ingredients) * servingsPerContainer;
}

/**
 * USD per gram of pure active ingredient — the metric the whole product is
 * built on. Returns Infinity for a container with no active content, so
 * worthless products sort last instead of crashing or ranking best.
 */
export function calculateCostPerGram(
  product: Pick<
    SupplementProduct,
    'totalPriceUSD' | 'servingsPerContainer' | 'activeIngredients'
  >,
): number {
  const grams = totalActiveGrams(product.activeIngredients, product.servingsPerContainer);
  if (grams <= 0) return Infinity;
  return product.totalPriceUSD / grams;
}

export function discountedPrice(totalPriceUSD: number, discountPct: number): number {
  return Number((totalPriceUSD * (1 - discountPct / 100)).toFixed(2));
}

/**
 * Builds the shared `SupplementProduct` shape from a catalog entry plus its
 * label audit. Ingredients and serving count come from the *audit*, not the
 * seed data, so a live vision reading genuinely drives the numbers.
 */
export function toSupplementProduct(
  entry: CatalogEntry,
  audit: LabelAuditResult,
): SupplementProduct {
  const activeIngredients = audit.activeIngredients.length
    ? audit.activeIngredients
    : entry.activeIngredients;
  const servingsPerContainer = audit.servingsPerContainer || entry.servingsPerContainer;

  const costPerGramActiveUSD = calculateCostPerGram({
    totalPriceUSD: entry.totalPriceUSD,
    servingsPerContainer,
    activeIngredients,
  });

  return {
    id: entry.id,
    brand: entry.brand,
    productName: entry.productName,
    imageUrl: entry.imageUrl,
    labelImageUrl: entry.labelImageUrl,
    totalPriceUSD: entry.totalPriceUSD,
    servingsPerContainer,
    activeIngredients,
    costPerGramActiveUSD: Number.isFinite(costPerGramActiveUSD)
      ? Number(costPerGramActiveUSD.toFixed(4))
      : Number.MAX_SAFE_INTEGER,
    subscribeAndSaveDiscountPct: entry.subscribeAndSaveDiscountPct,
    discountedPriceUSD: discountedPrice(entry.totalPriceUSD, entry.subscribeAndSaveDiscountPct),
    checkoutUrl: entry.checkoutUrl,
    vendorName: entry.vendorName,
  };
}

/** Audits every candidate in a family and ranks them best-value first. */
async function rankFamily(
  family: string,
  entries: CatalogEntry[],
  logs: ReasoningLogCollector,
): Promise<RankedCandidate[]> {
  const candidates = await Promise.all(
    entries.map(async (entry) => {
      const [audit, trust] = await Promise.all([
        auditNutritionLabel(entry.labelImageUrl),
        getBrandTrust(entry.brand),
      ]);
      const product = toSupplementProduct(entry, audit);

      // A live audit that quietly degraded to the mock (rate limit, bad image)
      // must say so here, or the feed shows a confident reading that no model
      // actually produced.
      const degraded = hasVisionKey() && audit.source === 'DETERMINISTIC_MOCK';

      logs.push(
        'LABEL_AUDIT',
        degraded || audit.fillerCallouts.length > 0 ? 'WARNING' : 'SUCCESS',
        degraded
          ? `${entry.brand} ${entry.productName} — live audit unavailable, using offline reading`
          : audit.fillerCallouts.length > 0
            ? `${entry.brand} ${entry.productName} — deceptive labelling detected`
            : `${entry.brand} ${entry.productName} — label verified`,
        {
          vendor: entry.vendorName,
          source: audit.source,
          ...(audit.modelId ? { model: audit.modelId } : {}),
          ...(degraded && audit.notes ? { degradedReason: audit.notes } : {}),
          activeGramsPerServing: Number(activeGramsPerServing(product.activeIngredients).toFixed(2)),
          fillerPercentage: audit.fillerPercentage,
          confidence: audit.confidence,
          ...(audit.fillerCallouts.length > 0 ? { flags: audit.fillerCallouts } : {}),
        },
      );

      if (trust.source !== 'SENSO_VERIFIED' && hasSensoKey()) {
        // Same rule as a degraded label audit: a trust lookup that fell back
        // must say so, or the feed implies a brand was checked when it wasn't.
        logs.push(
          'TRUST_VERIFICATION',
          'WARNING',
          `${entry.brand} — no verified trust record, ranking on price alone`,
          { reason: trust.notes ?? trust.source },
        );
      }

      if (trust.source === 'SENSO_VERIFIED') {
        logs.push(
          'TRUST_VERIFICATION',
          trust.score >= 0.7 ? 'SUCCESS' : trust.score >= 0.5 ? 'INFO' : 'WARNING',
          `${entry.brand} — trust grade ${trustGrade(trust.score)} from verified sources`,
          {
            score: trust.score,
            ...(trust.signals.length ? { signals: trust.signals } : {}),
            verdict: trust.verdict.slice(0, 300),
            citations: trust.citations.map((c) => c.title),
            source: 'Senso knowledge base',
          },
        );
      }

      const candidate: RankedCandidate = {
        product,
        matchedIngredient: family,
        totalActiveGrams: Number(
          totalActiveGrams(product.activeIngredients, product.servingsPerContainer).toFixed(2),
        ),
        costPerGramActiveUSD: product.costPerGramActiveUSD,
        effectiveCostPerGramUSD: trustAdjustedCost(product.costPerGramActiveUSD, trust.score),
        audit,
        trust,
      };
      return candidate;
    }),
  );

  // Rank on trust-adjusted cost, not raw price. A brand that is cheap because it
  // is cutting corners should not win on the strength of the corner-cutting.
  candidates.sort((a, b) => a.effectiveCostPerGramUSD - b.effectiveCostPerGramUSD);

  logs.push(
    'COST_CALCULATION',
    'INFO',
    `${family}: ranked ${candidates.length} products by true cost per active gram`,
    {
      best: `${candidates[0].product.brand} @ $${candidates[0].costPerGramActiveUSD.toFixed(4)}/g`,
      worst: `${candidates[candidates.length - 1].product.brand} @ $${candidates[
        candidates.length - 1
      ].costPerGramActiveUSD.toFixed(4)}/g`,
      spread: `${(
        candidates[candidates.length - 1].costPerGramActiveUSD /
        Math.max(candidates[0].costPerGramActiveUSD, 1e-9)
      ).toFixed(1)}x`,
    },
  );

  return candidates;
}

/**
 * Selects a stack.
 *
 * Coverage-first greedy fill: walk each requested ingredient family in
 * ascending order of its best achievable cost-per-gram, and for each family
 * take the best-value product that still fits the remaining budget, stepping
 * down to cheaper options when the best one doesn't fit.
 *
 * A true knapsack would squeeze out marginally more value, but the candidate
 * set is tiny and this ordering is *explainable* — every pick has a one-line
 * reason, which is what the reasoning feed needs to show. Covering more of the
 * requested ingredients is also worth more to a user than shaving a dollar off
 * a stack that skips an ingredient entirely.
 */
export async function optimizeStack(
  request: StackOptimizationRequest,
  collector?: ReasoningLogCollector,
): Promise<StackOptimizationResult> {
  const logs = collector ?? new ReasoningLogCollector();
  const { targetBudgetUSD, targetIngredients, preferredBrands } = request;

  logs.push(
    'TRUST_VERIFICATION',
    hasSensoKey() ? 'INFO' : 'WARNING',
    hasSensoKey()
      ? 'Brand trust will be verified against third-party sources via Senso'
      : 'No Senso key — brands rank on price alone, with a neutral trust score',
    { trustSignal: hasSensoKey() ? 'Senso knowledge base' : 'disabled' },
  );

  logs.push(
    'LABEL_AUDIT',
    'INFO',
    `Auditing supplement labels for ${targetIngredients.length} target ingredient(s)`,
    {
      budget: `$${targetBudgetUSD.toFixed(2)}`,
      targets: targetIngredients,
      ...(preferredBrands?.length ? { preferredBrands } : {}),
    },
  );

  // Resolve free-text targets to catalog families, dropping unknowns loudly.
  const families: string[] = [];
  for (const target of targetIngredients) {
    const family = matchIngredientFamily(target);
    if (!family) {
      logs.push('LABEL_AUDIT', 'WARNING', `No catalog match for "${target}" — skipping`, {
        target,
      });
      continue;
    }
    if (!families.includes(family)) families.push(family);
  }

  if (families.length === 0) {
    logs.push('STACK_OPTIMIZATION', 'ERROR', 'No requested ingredients matched the catalog', {
      requested: targetIngredients,
    });
    return {
      recommendedProducts: [],
      totalOriginalPriceUSD: 0,
      totalDiscountedPriceUSD: 0,
      totalSavingsUSD: 0,
      confidenceScore: 0,
      reasoningLogs: logs.all(),
    };
  }

  // Find candidate products for each family, then audit and rank them.
  const searched = await Promise.all(families.map((family) => searchProducts(family)));

  for (const result of searched) {
    if (result.fallbackReason) {
      logs.push(
        'LABEL_AUDIT',
        'WARNING',
        `Live retail search unavailable for ${result.query} — using seed catalog`,
        { reason: result.fallbackReason },
      );
    } else {
      logs.push(
        'LABEL_AUDIT',
        'INFO',
        `${result.query}: ${result.entries.length} candidate product(s) found`,
        {
          source:
            result.sourceMode === 'PRAVA_SHOP_SEARCH'
              ? 'Live merchants via Prava shop_search'
              : result.sourceMode === 'LIVE_RETAIL_SEARCH'
                ? 'Live retailer listings (Bright Data)'
                : 'Seed catalog',
        },
      );
    }
  }

  const ranked = await Promise.all(
    searched
      .filter((r) => r.entries.length > 0)
      .map(async (result) => ({
        family: result.query,
        candidates: await rankFamily(result.query, result.entries, logs),
      })),
  );

  // Preferred brands win ties without overriding value: a preferred brand is
  // promoted only among products within 15% of the family's best cost-per-gram.
  if (preferredBrands?.length) {
    const wanted = preferredBrands.map((b) => b.toLowerCase());
    for (const group of ranked) {
      const bestCost = group.candidates[0]?.costPerGramActiveUSD ?? Infinity;
      group.candidates.sort((a, b) => {
        const aPref = wanted.includes(a.product.brand.toLowerCase()) &&
          a.costPerGramActiveUSD <= bestCost * 1.15;
        const bPref = wanted.includes(b.product.brand.toLowerCase()) &&
          b.costPerGramActiveUSD <= bestCost * 1.15;
        if (aPref !== bPref) return aPref ? -1 : 1;
        return a.costPerGramActiveUSD - b.costPerGramActiveUSD;
      });
    }
  }

  // Best-value families first, so a tight budget spends on the biggest wins.
  ranked.sort(
    (a, b) =>
      (a.candidates[0]?.costPerGramActiveUSD ?? Infinity) -
      (b.candidates[0]?.costPerGramActiveUSD ?? Infinity),
  );

  // Cheapest way to cover each family at all. Used to reserve budget so an
  // early expensive pick can't starve a later ingredient.
  const cheapestByFamily = new Map<string, number>(
    ranked.map(({ family, candidates }) => [
      family,
      Math.min(...candidates.map((c) => c.product.discountedPriceUSD)),
    ]),
  );

  const selected: RankedCandidate[] = [];
  let spent = 0;

  for (let i = 0; i < ranked.length; i++) {
    const { family, candidates } = ranked[i];
    const remaining = targetBudgetUSD - spent;

    // Hold back enough to still afford the cheapest option for every family we
    // haven't reached yet. Without this the optimizer happily blows the budget
    // on the single best-value product and drops a whole ingredient — worse for
    // the user than buying a slightly pricier-per-gram tub of each.
    const reserved = ranked
      .slice(i + 1)
      .reduce((sum, g) => sum + (cheapestByFamily.get(g.family) ?? 0), 0);

    const affordable = (c: RankedCandidate) =>
      c.product.discountedPriceUSD <= remaining - reserved;

    // If even the cheapest option here can't fit alongside the reservation,
    // coverage is impossible either way — fall back to plain affordability so
    // this family still gets something rather than nothing.
    const pick =
      candidates.find(affordable) ??
      candidates.find((c) => c.product.discountedPriceUSD <= remaining);

    if (!pick) {
      logs.push(
        'STACK_OPTIMIZATION',
        'WARNING',
        `Skipped ${family} — cheapest option exceeds remaining budget`,
        {
          remaining: `$${remaining.toFixed(2)}`,
          cheapest: `$${Math.min(
            ...candidates.map((c) => c.product.discountedPriceUSD),
          ).toFixed(2)}`,
        },
      );
      continue;
    }

    selected.push(pick);
    spent += pick.product.discountedPriceUSD;

    const rejected = candidates.filter((c) => c.product.id !== pick.product.id);
    const isDowngrade = pick.product.id !== candidates[0].product.id;

    // A flagged product can still win on cost-per-active-gram, because purity is
    // already priced into that number. That's the intended behaviour — but the
    // recommendation must carry the flags forward rather than bury them.
    const pickIsFlagged = pick.audit.fillerCallouts.length > 0;

    logs.push(
      'STACK_OPTIMIZATION',
      pickIsFlagged ? 'WARNING' : 'SUCCESS',
      pickIsFlagged
        ? `Selected ${pick.product.brand} for ${family} — best cost per active gram despite label flags`
        : `Selected ${pick.product.brand} for ${family}`,
      {
        product: pick.product.productName,
        vendor: pick.product.vendorName,
        costPerActiveGram: `$${pick.costPerGramActiveUSD.toFixed(4)}`,
        ...(pick.trust.source === 'SENSO_VERIFIED'
          ? {
              trustGrade: trustGrade(pick.trust.score),
              trustAdjustedCostPerGram: `$${pick.effectiveCostPerGramUSD.toFixed(4)}`,
            }
          : {}),
        subscribeAndSave: `${pick.product.subscribeAndSaveDiscountPct}% off → $${pick.product.discountedPriceUSD.toFixed(2)}`,
        totalActiveGrams: pick.totalActiveGrams,
        ...(pickIsFlagged ? { labelFlags: pick.audit.fillerCallouts } : {}),
        ...(isDowngrade
          ? {
              note: 'Stepped down from the best-value option to keep the remaining ingredients affordable',
            }
          : {}),
        ...(rejected.length
          ? {
              rejected: rejected.map(
                (r) =>
                  `${r.product.brand} ($${r.costPerGramActiveUSD.toFixed(4)}/g${
                    r.audit.fillerCallouts.length ? ', flagged' : ''
                  })`,
              ),
            }
          : {}),
        budgetRemaining: `$${(targetBudgetUSD - spent).toFixed(2)}`,
      },
    );
  }

  const recommendedProducts = selected.map((c) => c.product);
  const totalOriginalPriceUSD = Number(
    recommendedProducts.reduce((sum, p) => sum + p.totalPriceUSD, 0).toFixed(2),
  );
  const totalDiscountedPriceUSD = Number(
    recommendedProducts.reduce((sum, p) => sum + p.discountedPriceUSD, 0).toFixed(2),
  );
  const totalSavingsUSD = Number((totalOriginalPriceUSD - totalDiscountedPriceUSD).toFixed(2));

  // Confidence reflects both how well the labels were read and how much of the
  // request could actually be filled.
  const avgAuditConfidence = selected.length
    ? selected.reduce((sum, c) => sum + c.audit.confidence, 0) / selected.length
    : 0;
  const coverage = families.length ? selected.length / families.length : 0;
  const confidenceScore = Number((avgAuditConfidence * coverage).toFixed(3));

  logs.push(
    'STACK_OPTIMIZATION',
    selected.length === families.length ? 'SUCCESS' : 'WARNING',
    `Stack complete — ${selected.length}/${families.length} ingredients covered`,
    {
      original: `$${totalOriginalPriceUSD.toFixed(2)}`,
      afterSubscribeAndSave: `$${totalDiscountedPriceUSD.toFixed(2)}`,
      saved: `$${totalSavingsUSD.toFixed(2)}`,
      budget: `$${targetBudgetUSD.toFixed(2)}`,
      underBudgetBy: `$${(targetBudgetUSD - totalDiscountedPriceUSD).toFixed(2)}`,
      confidence: confidenceScore,
    },
  );

  const brandTrust: Record<string, import('@/types').BrandTrustSummary> = {};
  for (const c of selected) {
    if (c.trust.source !== 'SENSO_VERIFIED') continue;
    brandTrust[c.product.brand] = {
      score: c.trust.score,
      grade: trustGrade(c.trust.score),
      verdict: c.trust.verdict,
      signals: c.trust.signals,
      citations: c.trust.citations.map((x) => x.title),
    };
  }

  return {
    recommendedProducts,
    ...(Object.keys(brandTrust).length ? { brandTrust } : {}),
    totalOriginalPriceUSD,
    totalDiscountedPriceUSD,
    totalSavingsUSD,
    confidenceScore,
    reasoningLogs: logs.all(),
  };
}
