import OpenAI from 'openai';
import { z } from 'zod';

import type { CatalogEntry } from '@/types/agent';
import { SUPPLEMENT_CATALOG, matchIngredientFamily } from './catalog';
import { agentBaseUrl, agentModelId, nextKey } from './model-backend';
import { isPravaShoppingConnected, pravaShopSearch } from '@/lib/prava/shop-client';

/**
 * Product search.
 *
 * Everything downstream — label audits, cost-per-active-gram, ranking, budget
 * selection — depends only on `CatalogEntry[]`, never on where those entries
 * came from. This module is that seam.
 *
 * Two providers:
 *   - `seed`        the built-in catalog. Offline, deterministic, always works.
 *   - `brightdata`  live retailer listings via Bright Data's SERP API, with
 *                   prices normalised into CatalogEntry shape by the LLM.
 *
 * The live provider falls back to the seed catalog on *any* failure — missing
 * key, network error, quota, unparseable response. A demo should degrade to
 * working-but-synthetic rather than to a blank page, and `sourceMode` on the
 * result records which one actually ran so nothing is passed off as live data
 * that wasn't.
 */

export type ProductSourceMode = 'PRAVA_SHOP_SEARCH' | 'LIVE_RETAIL_SEARCH' | 'SEED_CATALOG';

export interface ProductSearchResult {
  entries: CatalogEntry[];
  sourceMode: ProductSourceMode;
  /** Populated when a live search was attempted but did not supply the results. */
  fallbackReason?: string;
  query: string;
}

export function hasBrightDataCredentials(): boolean {
  return Boolean(
    process.env.BRIGHTDATA_API_KEY?.trim() && process.env.BRIGHTDATA_SERP_ZONE?.trim(),
  );
}

/**
 * Provider precedence: Prava first when connected, because it needs no third
 * party and keeps discovery inside the payments provider we already use.
 * Bright Data is the fallback, and the seed catalog always works offline.
 */
export function productSearchMode(): ProductSourceMode {
  if (process.env.PRODUCT_SEARCH_PROVIDER === 'seed') return 'SEED_CATALOG';
  if (process.env.PRODUCT_SEARCH_PROVIDER === 'brightdata') {
    return hasBrightDataCredentials() || process.env.BRIGHTDATA_FIXTURE?.trim()
      ? 'LIVE_RETAIL_SEARCH'
      : 'SEED_CATALOG';
  }
  if (isPravaShoppingConnected()) return 'PRAVA_SHOP_SEARCH';
  if (process.env.BRIGHTDATA_FIXTURE?.trim()) return 'LIVE_RETAIL_SEARCH';
  return hasBrightDataCredentials() ? 'LIVE_RETAIL_SEARCH' : 'SEED_CATALOG';
}

// --- Seed provider -----------------------------------------------------------

function searchSeedCatalog(query: string): CatalogEntry[] {
  const family = matchIngredientFamily(query);
  if (!family) return [];
  return SUPPLEMENT_CATALOG.filter((e) => e.ingredientFamily === family);
}

// --- Bright Data provider ----------------------------------------------------

/** One unstructured product row, from Google Shopping or from Prava. */
interface ShoppingHit {
  title: string;
  price?: string;
  merchant?: string;
  link?: string;
  image?: string;
  /** Merchant copy, when the source supplies it. This is where the actual
   *  per-serving dosing usually hides, so it is worth passing to the model. */
  description?: string;
  /** Stated by the merchant on the variant. Trusted over any model estimate. */
  servings?: number;
}

/**
 * Google Shopping through Bright Data's SERP API. `brd_json=1` asks Bright Data
 * to return parsed JSON rather than raw HTML, so there is no scraping logic here.
 */
async function fetchShoppingResults(query: string, signal?: AbortSignal): Promise<ShoppingHit[]> {
  // Fixture mode. The rest of this path — LLM normalisation, CatalogEntry
  // mapping, label audit, trust lookup, ranking — is identical to the live
  // path, so this verifies everything except Bright Data's own HTTP call. It
  // exists because the provider was written against docs and never executed;
  // shipping unrun code and calling it "ready" is how demos die.
  const fixture = process.env.BRIGHTDATA_FIXTURE?.trim();
  if (fixture) {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const raw = JSON.parse(readFileSync(join(process.cwd(), fixture), 'utf8'));
    const rows: unknown[] = raw?.shopping ?? raw?.organic ?? [];
    return rows.slice(0, 12).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        title: String(row.title ?? ''),
        price: row.price ? String(row.price) : undefined,
        merchant: row.source ? String(row.source) : undefined,
        link: row.link ? String(row.link) : undefined,
        image: row.image ? String(row.image) : undefined,
      };
    });
  }

  const url =
    'https://www.google.com/search?' +
    new URLSearchParams({
      q: `${query} supplement powder`,
      tbm: 'shop',
      brd_json: '1',
      gl: 'us',
      hl: 'en',
    }).toString();

  const res = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.BRIGHTDATA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      zone: process.env.BRIGHTDATA_SERP_ZONE,
      url,
      format: 'raw',
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Bright Data SERP request failed (HTTP ${res.status})`);
  }

  const payload = await res.json();
  // Bright Data returns shopping rows under `shopping`; some responses put
  // them in `organic` instead, so accept either rather than failing loudly.
  const rows: unknown[] = payload?.shopping ?? payload?.organic ?? [];

  return rows.slice(0, 12).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      title: String(row.title ?? ''),
      price: row.price ? String(row.price) : undefined,
      merchant: row.source ? String(row.source) : row.merchant ? String(row.merchant) : undefined,
      link: row.link ? String(row.link) : undefined,
      image: row.image ? String(row.image) : undefined,
    };
  });
}

/**
 * Tolerant on purpose. The model returns `null` for fields it can't determine
 * (a shopping row rarely states a subscription discount), and a strict schema
 * threw away the entire batch over one null. Missing optional values coerce to
 * a sane default; only genuinely unusable rows are dropped.
 */
const NormalisedProductSchema = z.object({
  products: z.array(
    z.object({
      brand: z.string().min(1),
      productName: z.string().min(1),
      totalPriceUSD: z.coerce.number().positive(),
      servingsPerContainer: z.coerce.number().positive(),
      activeIngredientName: z.string().min(1),
      amountPerServingGrams: z.coerce.number().positive(),
      purityPercentage: z.coerce.number().min(0).max(100).nullish().transform((v) => v ?? 95),
      subscribeAndSaveDiscountPct: z.coerce
        .number()
        .min(0)
        .max(100)
        .nullish()
        .transform((v) => v ?? 0),
      vendorName: z.string().min(1),
    }),
  ),
});

/**
 * Closes JSON the model left unterminated.
 *
 * Observed with `finish_reason: "stop"` — not truncation by token limit, the
 * model simply stopped emitting closing brackets. Rather than discard a
 * complete list of products over a missing `}`, balance the delimiters and
 * retry the parse once.
 */
function repairJson(raw: string): string {
  let text = raw.trim();

  // Strip markdown fences if the model wrapped its output.
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) text = fenced[1].trim();

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    else if (!inString) {
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') stack.pop();
    }
  }

  if (inString) text += '"';
  // Drop a dangling comma before closing what's left open.
  text = text.replace(/,\s*$/, '');
  while (stack.length) text += stack.pop() === '{' ? '}' : ']';

  return text;
}

const NORMALISE_PROMPT = `You turn raw shopping-search rows for sports supplements into
structured product records.

For each row you can confidently interpret, derive:
- brand: the manufacturer, from the title.
- productName: a clean product name including container size if shown.
- totalPriceUSD: the numeric price.
- servingsPerContainer: use the row's \`servings\` field when present — the
  merchant stated it, do not second-guess it. Otherwise take it from the title
  ("60 servings"), and only as a last resort compute it from container size and
  a typical serving (creatine 5 g, beta-alanine 3.2 g, citrulline 6 g, whey 30 g).
- activeIngredientName, amountPerServingGrams: the main active compound and its
  grams per serving. The \`description\` field, when present, is the merchant's
  own copy — prefer any dosing it states over an assumption.
- purityPercentage: 97-100 for a plain single-ingredient powder; much lower
  (40-70) if the title or description suggests a blend, matrix, proprietary
  formula, or flavoured complex.
- subscribeAndSaveDiscountPct: 0 unless a subscription discount is stated.
- vendorName: the retailer or merchant domain.

Return one record per input row, in the SAME ORDER, so results line up with
their source. Skip a row only if it is not a supplement at all. Do not invent
products. Return ONLY JSON: {"products":[{...}]}`;

/**
 * The shopping rows are unstructured marketing text, so an LLM pass normalises
 * them into the schema. Serving counts in particular are usually implied by the
 * container size rather than stated outright.
 */
async function normaliseHits(
  hits: ShoppingHit[],
  family: string,
): Promise<z.infer<typeof NormalisedProductSchema>['products']> {
  // Runs on the AGENT provider, not the vision one. This is a text task — it
  // reads titles and merchant copy, never an image — and the vision provider's
  // free tier is the scarcest resource in the system. Sharing it meant every
  // search competed with the label audits it was about to trigger, and losing
  // that race silently dropped the whole result set back to the seed catalog.
  const client = new OpenAI({
    apiKey: nextKey() || process.env.VISION_API_KEY,
    baseURL: agentBaseUrl(),
  });

  const completion = await client.chat.completions.create({
    model: agentModelId(),
    response_format: { type: 'json_object' },
    temperature: 0,
    max_completion_tokens: 2048,
    messages: [
      { role: 'system', content: NORMALISE_PROMPT },
      {
        role: 'user',
        content: `Target ingredient: ${family}\n\nRows:\n${JSON.stringify(hits, null, 2)}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Normalisation model returned an empty response');

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    try {
      payload = JSON.parse(repairJson(raw));
    } catch {
      throw new Error(`Normalisation output was not valid JSON: ${raw.slice(-160)}`);
    }
  }

  const parsed = NormalisedProductSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Normalisation output failed validation: ${parsed.error.message}`);
  }
  return parsed.data.products;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
}

async function searchBrightData(query: string, family: string): Promise<CatalogEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const hits = await fetchShoppingResults(query, controller.signal);
    if (hits.length === 0) throw new Error('Bright Data returned no shopping results');

    const normalised = await normaliseHits(hits, family);
    if (normalised.length === 0) throw new Error('No shopping rows could be normalised');

    return normalised.map((p, i) => {
      const hit = hits[i];
      return {
        id: `live_${slugify(p.brand)}_${slugify(p.productName)}_${i}`,
        brand: p.brand,
        productName: p.productName,
        imageUrl: hit?.image ?? '',
        // Live listings have no supplement-facts panel to read. The product
        // photo is the closest thing; the auditor will report low confidence
        // when it isn't a facts panel, which is the honest outcome rather than
        // pretending a label was audited.
        labelImageUrl: hit?.image ?? '',
        totalPriceUSD: p.totalPriceUSD,
        servingsPerContainer: p.servingsPerContainer,
        activeIngredients: [
          {
            name: p.activeIngredientName,
            amountPerServingGrams: p.amountPerServingGrams,
            purityPercentage: p.purityPercentage,
          },
        ],
        subscribeAndSaveDiscountPct: p.subscribeAndSaveDiscountPct,
        checkoutUrl: hit?.link ?? '',
        vendorName: p.vendorName,
        ingredientFamily: family,
      } satisfies CatalogEntry;
    });
  } finally {
    clearTimeout(timeout);
  }
}

// --- Prava shop_search provider ----------------------------------------------

/**
 * Real merchants via Prava's MCP. Shares Bright Data's normalisation and
 * mapping, because the awkward part — turning marketing copy into grams and
 * servings — is identical whoever supplied the row.
 */
/**
 * Typical clinically-used serving, in grams, per family.
 *
 * Used only when neither the title nor the merchant's own copy states a dose.
 * These are the standard doses the labels themselves quote, so they are a
 * defensible floor rather than a guess pulled from nowhere.
 */
const TYPICAL_SERVING_GRAMS: Record<string, number> = {
  Creatine: 5,
  'Whey Protein': 30,
  'L-Citrulline': 6,
  'Beta-Alanine': 3.2,
  Electrolytes: 6,
};

/** Pulls "5g", "5 g", "5000mg" out of a title or description. */
function gramsFromText(text: string): number | undefined {
  const g = text.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b/i);
  if (g) {
    const value = Number(g[1]);
    // A "500g" in a title is the tub, not the serving. Serving sizes are small.
    if (value > 0 && value <= 60) return value;
  }
  const mg = text.match(/(\d[\d,]*)\s*mg\b/i);
  if (mg) {
    const value = Number(mg[1].replace(/,/g, '')) / 1000;
    if (value > 0 && value <= 60) return value;
  }
  return undefined;
}

/** Blend/matrix wording means the individual doses are hidden. */
function purityFromText(text: string): number {
  return /(proprietary|blend|matrix|complex|formula)/i.test(text) ? 60 : 98;
}

/**
 * Merchant domains whose brand name cannot be recovered by splitting the
 * domain. "bareperformancenutrition.com" has no word boundaries to split on,
 * so title-casing it produces "Bareperformancenutrition" — which then shows up
 * in the UI and in trust lookups, where it matches nothing.
 *
 * Only domains actually seen in Prava results are listed; anything else falls
 * through to the generic splitter.
 */
const KNOWN_BRANDS: Record<string, string> = {
  'bareperformancenutrition.com': 'Bare Performance Nutrition',
  'getrawnutrition.com': 'Raw Nutrition',
  'livemomentous.com': 'Momentous',
  'gainsinbulk.com': 'Gains in Bulk',
  'rysesupps.com': 'RYSE',
  'pescience.com': 'PEScience',
  'hugesupplements.com': 'Huge Supplements',
  'nakednutrition.com': 'Naked Nutrition',
  'shop.drberg.com': 'Dr. Berg',
  'drinklmnt.com': 'LMNT',
  'justingredients.com': 'JustIngredients',
  'transparentlabs.com': 'Transparent Labs',
  'legionathletics.com': 'Legion Athletics',
  'thorne.com': 'Thorne',
  'optimumnutrition.com': 'Optimum Nutrition',
};

function brandFromMerchant(merchant: string, title: string): string {
  const host = merchant.replace(/\.myshopify\.com$/, '.com').toLowerCase();
  if (KNOWN_BRANDS[host]) return KNOWN_BRANDS[host];

  const bare = host.replace(/^(shop|store|www)\./, '').replace(/\.[a-z.]{2,}$/, '');

  // Only split on real separators. Squashed domains stay squashed rather than
  // being cut at arbitrary points, and get title-cased as one word.
  const words = bare.split(/[-_.]/).filter(Boolean);
  const pretty = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return pretty || title.split(/[\s-]/)[0];
}

/**
 * Real merchants via Prava.
 *
 * Deliberately does NOT use the LLM normalisation pass that Bright Data needs.
 * Prava returns structured fields — price, merchant, and a variant label that
 * states the serving count — so the only thing left to infer is grams per
 * serving, which a regex over the merchant's own copy handles.
 *
 * That matters beyond tidiness: routing this through a model made product
 * discovery share the agent's token budget, so a run would exhaust the daily
 * quota mid-search and silently fall back to the seed catalog — the exact
 * failure this whole path exists to avoid. Real products now cost zero tokens.
 */
async function searchPravaShop(query: string, family: string): Promise<CatalogEntry[]> {
  const hits = await pravaShopSearch(`${query} supplement powder`, 8);
  if (hits.length === 0) throw new Error('Prava shop search returned no products');

  const entries = hits
    .map((hit, i) => {
      const price = Number(hit.price);
      if (!(price > 0)) return null;

      const text = `${hit.title} ${hit.description ?? ''}`;
      const servings = hit.servings ?? 30;
      const grams = gramsFromText(text) ?? TYPICAL_SERVING_GRAMS[family] ?? 5;
      const brand = brandFromMerchant(hit.merchant ?? '', hit.title);

      return {
        id: `prava_${slugify(brand)}_${slugify(hit.title)}_${i}`,
        brand,
        productName: hit.title.slice(0, 80),
        imageUrl: hit.image ?? '',
        // The merchant's own supplement-facts panel when they published one.
        // Falling back to the hero shot is lossy but honest: the auditor
        // reports low confidence rather than inventing a reading.
        labelImageUrl: hit.labelImage ?? hit.image ?? '',
        totalPriceUSD: price,
        servingsPerContainer: servings,
        activeIngredients: [
          {
            name: family,
            amountPerServingGrams: grams,
            purityPercentage: purityFromText(text),
          },
        ],
        subscribeAndSaveDiscountPct: 0,
        checkoutUrl: hit.link ?? '',
        vendorName: hit.merchant ?? 'Unknown merchant',
        ingredientFamily: family,
      } satisfies CatalogEntry;
    })
    .filter((e): e is CatalogEntry => e !== null);

  if (entries.length === 0) throw new Error('No Prava products had a usable price');
  return entries;
}

// --- Public entry point ------------------------------------------------------

/**
 * Search results live for ten minutes.
 *
 * Long enough that a demo, a retry and a follow-up question all reuse one set
 * of merchant calls; short enough that prices are not stale by the time anyone
 * pays. Pinned to globalThis because Next's dev server recompiles this module
 * on edit, which would otherwise silently empty the cache mid-session.
 */
const SEARCH_TTL_MS = 10 * 60_000;

const globalRef = globalThis as typeof globalThis & {
  __macrostackSearchCache?: Map<string, { at: number; result: ProductSearchResult }>;
};
const searchCache = (globalRef.__macrostackSearchCache ??= new Map());

const inFlightSearches = new Map<string, Promise<ProductSearchResult>>();

/**
 * Finds candidate products for one target ingredient.
 *
 * Never throws: a live-search failure degrades to the seed catalog and reports
 * why, because a broken demo is worse than a synthetic one.
 */
export async function searchProducts(query: string): Promise<ProductSearchResult> {
  const family = matchIngredientFamily(query) ?? query;

  const mode = productSearchMode();

  if (mode === 'SEED_CATALOG') {
    return { entries: searchSeedCatalog(query), sourceMode: 'SEED_CATALOG', query };
  }

  // Keyed by FAMILY, not by the raw query. The agent phrases the same want
  // several ways ("creatine", "creatine monohydrate pure", "BulkSupplements
  // creatine") and each phrasing previously paid for a fresh merchant search
  // and a fresh normalisation. Since they resolve to the same family, they get
  // the same answer — which also stops the agent burning its turn budget
  // re-searching what it already has.
  const cached = searchCache.get(family);
  if (cached && Date.now() - cached.at < SEARCH_TTL_MS) {
    return { ...cached.result, query };
  }

  // Join a search already running for this family rather than starting a
  // second one; the agent routinely fires several at once.
  const running = inFlightSearches.get(family);
  if (running) return { ...(await running), query };

  const work = (async () => {
    const entries =
      mode === 'PRAVA_SHOP_SEARCH'
        ? await searchPravaShop(query, family)
        : await searchBrightData(query, family);
    const result: ProductSearchResult = { entries, sourceMode: mode, query };
    searchCache.set(family, { at: Date.now(), result });
    return result;
  })().finally(() => inFlightSearches.delete(family));

  inFlightSearches.set(family, work);

  try {
    return await work;
  } catch (error) {
    return {
      entries: searchSeedCatalog(query),
      sourceMode: 'SEED_CATALOG',
      fallbackReason:
        error instanceof Error ? error.message : 'Live retail search failed for an unknown reason',
      query,
    };
  }
}
