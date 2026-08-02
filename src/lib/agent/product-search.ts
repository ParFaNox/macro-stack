import OpenAI from 'openai';
import { z } from 'zod';

import type { CatalogEntry } from '@/types/agent';
import { SUPPLEMENT_CATALOG, matchIngredientFamily } from './catalog';
import { DEFAULT_VISION_BASE_URL, visionModelId } from './vision-auditor';

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

export type ProductSourceMode = 'LIVE_RETAIL_SEARCH' | 'SEED_CATALOG';

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

export function productSearchMode(): ProductSourceMode {
  if (process.env.PRODUCT_SEARCH_PROVIDER === 'seed') return 'SEED_CATALOG';
  // A fixture stands in for credentials so the path can be exercised offline.
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

/** One row as it comes back from Google Shopping via SERP API. */
interface ShoppingHit {
  title: string;
  price?: string;
  merchant?: string;
  link?: string;
  image?: string;
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
- servingsPerContainer: from the title if stated ("60 servings"), otherwise
  compute it from container size and a typical serving for that ingredient
  (creatine 5 g, beta-alanine 3.2 g, citrulline 6 g, whey 30 g).
- activeIngredientName, amountPerServingGrams: the main active compound and
  its grams per serving.
- purityPercentage: 97-100 for a plain single-ingredient powder; much lower
  (40-70) if the title suggests a blend, matrix, or flavoured complex.
- subscribeAndSaveDiscountPct: 0 unless a subscription discount is stated.
- vendorName: the retailer.

Skip any row you cannot interpret — do not invent products. Return ONLY JSON:
{"products":[{...}]}`;

/**
 * The shopping rows are unstructured marketing text, so an LLM pass normalises
 * them into the schema. Serving counts in particular are usually implied by the
 * container size rather than stated outright.
 */
async function normaliseHits(
  hits: ShoppingHit[],
  family: string,
): Promise<z.infer<typeof NormalisedProductSchema>['products']> {
  const client = new OpenAI({
    apiKey: process.env.VISION_API_KEY,
    baseURL: process.env.VISION_BASE_URL?.trim() || DEFAULT_VISION_BASE_URL,
  });

  const completion = await client.chat.completions.create({
    model: visionModelId(),
    response_format: { type: 'json_object' },
    temperature: 0,
    max_completion_tokens: 8192,
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

// --- Public entry point ------------------------------------------------------

/**
 * Finds candidate products for one target ingredient.
 *
 * Never throws: a live-search failure degrades to the seed catalog and reports
 * why, because a broken demo is worse than a synthetic one.
 */
export async function searchProducts(query: string): Promise<ProductSearchResult> {
  const family = matchIngredientFamily(query) ?? query;

  if (productSearchMode() === 'SEED_CATALOG') {
    return { entries: searchSeedCatalog(query), sourceMode: 'SEED_CATALOG', query };
  }

  try {
    const entries = await searchBrightData(query, family);
    return { entries, sourceMode: 'LIVE_RETAIL_SEARCH', query };
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
