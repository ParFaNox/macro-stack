import fs from 'node:fs';
import path from 'node:path';

import OpenAI from 'openai';
import { z } from 'zod';

import type { ActiveIngredient } from '@/types';
import type { LabelAuditResult } from '@/types/agent';
import SEED_AUDITS from './label-audit-seed.json';
import { findCatalogEntryByLabelUrl } from './catalog';

/**
 * Nutrition-label auditor.
 *
 * Provider-neutral by design: the `openai` SDK talks to whatever
 * VISION_BASE_URL points at. Defaults to OpenAI + gpt-4o (the hackathon
 * supplies OpenAI credits, and there is an award for OpenAI usage). Setting
 * VISION_BASE_URL to Gemini's OpenAI-compatible endpoint, or to Groq or
 * OpenRouter, needs no code change — only env vars.
 *
 * With no VISION_API_KEY the auditor returns deterministic mock audits, so the
 * whole app is runnable with zero setup. The `source` field on every result
 * records which path ran, and it is echoed into the reasoning logs — a demo
 * should never quietly pass mock output off as a live model call.
 */

export const DEFAULT_VISION_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_BASE_URL = DEFAULT_VISION_BASE_URL;
const DEFAULT_MODEL = 'gpt-4o';

/**
 * Free alternative, kept documented because it needs no billing at all.
 * Gemini's free tier is 20 requests/minute and a 5-ingredient stack fires 15
 * audits, so warm the cache (`npm run warm-labels`) before demoing on it.
 *   VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
 *   VISION_MODEL=gemini-3.5-flash
 */

export function hasVisionKey(): boolean {
  return Boolean(process.env.VISION_API_KEY?.trim());
}

export function visionModelId(): string {
  return process.env.VISION_MODEL?.trim() || DEFAULT_MODEL;
}

/** Schema the model is asked to fill. Validated after parsing rather than
 *  enforced via OpenAI's strict `zodTextFormat` helper, which is
 *  OpenAI-specific and unreliable across compatible providers. */
const VisionResponseSchema = z.object({
  activeIngredients: z
    .array(
      z.object({
        name: z.string().min(1),
        amountPerServingGrams: z.number().nonnegative(),
        purityPercentage: z.number().min(0).max(100),
      }),
    )
    .min(1),
  servingsPerContainer: z.number().positive(),
  fillerCallouts: z.array(z.string()).default([]),
  fillerPercentage: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

const SYSTEM_PROMPT = `You are a forensic supplement-label auditor.

Read the nutrition/supplement facts panel in the image and extract ONLY what is
printed on it. Do not infer values that are not shown.

Rules:
- Convert every amount to GRAMS per serving (1000 mg = 1 g, 1000 mcg = 1 mg).
- purityPercentage is the share of that listed amount which is the actual
  active compound, 0-100. A plain single-ingredient powder is typically 97-100.
  A proprietary blend where the amount is not individually disclosed is much
  lower - estimate conservatively and say so in notes.
- fillerCallouts: short strings naming deceptive labelling you can see -
  proprietary blends that hide per-ingredient dosing, amino spiking, fillers or
  sugars listed before the active ingredient, doses below the clinical
  threshold. Empty array if the label is honest.
- fillerPercentage: share of the serving that is NOT active ingredient, 0-100.
- confidence: your own 0-1 confidence in this extraction. Use a low value if
  the image is blurry, cropped, or not a supplement label at all.

Respond with a single JSON object and nothing else, matching exactly:
{"activeIngredients":[{"name":string,"amountPerServingGrams":number,"purityPercentage":number}],
 "servingsPerContainer":number,"fillerCallouts":string[],"fillerPercentage":number,
 "confidence":number,"notes":string}`;

/**
 * App-relative label paths (`/labels/<id>`) have to become absolute before
 * fetch() will touch them — Node's fetch rejects a relative URL outright.
 */
export function absoluteImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('data:') || /^https?:\/\//i.test(imageUrl)) return imageUrl;

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
  return new URL(imageUrl, base).toString();
}

/**
 * Vision APIs are most reliable with inline base64. Remote URLs are fetched and
 * inlined; data: URLs pass straight through.
 */
async function toImagePayload(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) return imageUrl;

  const res = await fetch(absoluteImageUrl(imageUrl));
  if (!res.ok) {
    throw new Error(`Could not fetch label image (HTTP ${res.status}): ${imageUrl}`);
  }
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  return `data:${contentType};base64,${base64}`;
}

async function auditWithVisionModel(imageUrl: string): Promise<LabelAuditResult> {
  const client = new OpenAI({
    apiKey: process.env.VISION_API_KEY,
    baseURL: process.env.VISION_BASE_URL?.trim() || DEFAULT_BASE_URL,
  });

  const modelId = visionModelId();
  const imagePayload = await toImagePayload(imageUrl);

  const completion = await client.chat.completions.create({
    model: modelId,
    response_format: { type: 'json_object' },
    // Multi-ingredient panels (electrolyte blends list three or more salts)
    // overrun a small default budget and come back as truncated, unparseable
    // JSON. Give the response room.
    // Gemini flash models spend part of this budget on internal reasoning, so a
    // 2k ceiling still truncated multi-ingredient panels mid-JSON.
    max_completion_tokens: 8192,
    // Label reading should be literal, not creative.
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Audit this supplement label.' },
          { type: 'image_url', image_url: { url: imagePayload } },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Vision model returned an empty response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Vision model returned non-JSON output: ${raw.slice(0, 200)}`);
  }

  const result = VisionResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Vision model output failed schema validation: ${result.error.message}`);
  }

  return {
    imageUrl,
    source: 'LIVE_VISION_MODEL',
    modelId,
    ...result.data,
    fillerCallouts: result.data.fillerCallouts ?? [],
  };
}

/**
 * Audit cache.
 *
 * The catalog's labels are fixed and the panels are deterministic, so the same
 * image always yields the same reading. Caching means only the first optimize
 * run spends quota — every later run, and every repeat of a demo, is free and
 * instant. Uploaded images (data: URIs) are skipped: they're one-shot and the
 * key would be megabytes.
 */
const auditCache = new Map<string, LabelAuditResult>();

/**
 * Cache keys include the model id. Readings differ between models, so a cache
 * warmed on Gemini must not be served as though GPT-4o produced it — switching
 * `VISION_MODEL` should re-audit rather than silently reuse another model's work.
 */
function cacheKey(imageUrl: string): string {
  return `${visionModelId()}::${imageUrl}`;
}

/**
 * Two layers, because a serverless filesystem is read-only.
 *
 * 1. `label-audit-seed.json` is committed and imported, so it is bundled into
 *    the deployment. Without it, a Vercel cold start re-audits every label,
 *    blows the provider rate limit, and quietly degrades the whole demo to mock
 *    readings — the failure is silent, which is what makes it dangerous.
 * 2. `.macrostack-cache/` is a local dev overlay for iterating without burning
 *    quota. Gitignored; writes fail harmlessly on a read-only filesystem.
 *
 * `npm run warm-labels` populates (2); `npm run save-label-cache` promotes it
 * into (1) for committing.
 */
const CACHE_FILE = path.join(process.cwd(), '.macrostack-cache', 'label-audits.json');
let cacheLoaded = false;

function loadCacheFromDisk(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;

  // Committed seed first — always available, including on read-only hosts.
  for (const [key, value] of Object.entries(SEED_AUDITS as Record<string, LabelAuditResult>)) {
    auditCache.set(key, value);
  }

  // Local overlay wins, so a fresh warm run beats a stale committed seed.
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    for (const [key, value] of Object.entries(JSON.parse(raw) as Record<string, LabelAuditResult>)) {
      auditCache.set(key, value);
    }
  } catch {
    // No local cache — expected on a fresh clone and in production.
  }
}

function persistCacheToDisk(): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(auditCache), null, 2));
  } catch {
    // A read-only filesystem just means no persistence; the in-memory cache
    // still works, so this must never break a request.
  }
}

export function clearAuditCache(): void {
  auditCache.clear();
  try {
    fs.rmSync(CACHE_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

/** How many labels already have a cached live reading. */
export function auditCacheStats(): { cached: number; live: number } {
  loadCacheFromDisk();
  const values = [...auditCache.values()];
  return {
    cached: values.length,
    live: values.filter((v) => v.source === 'LIVE_VISION_MODEL').length,
  };
}

/**
 * Free-tier quota is per-minute, and a 5-ingredient stack fires 15 audits at
 * once. Unbounded parallelism trips the limit and silently degrades most of
 * them to mock, which makes the demo look fake for no reason. Cap in-flight
 * calls and retry the ones that do get throttled.
 */
const MAX_CONCURRENT_VISION_CALLS = 4;
let inFlight = 0;
const waiting: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT_VISION_CALLS) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
}

function releaseSlot(): void {
  inFlight--;
  waiting.shift()?.();
}

/**
 * Out of credits / billing exhausted. Distinct from a per-minute rate limit:
 * retrying and waiting will never help, so don't burn attempts on it.
 */
function isOutOfCredits(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /insufficient_quota|credit_balance_exhausted|no credits remaining|billing/i.test(msg);
}

/** Throttled — retrying after a wait can succeed. */
function isRateLimited(error: unknown): boolean {
  if (isOutOfCredits(error)) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return /429|rate limit|RESOURCE_EXHAUSTED|quota/i.test(msg);
}

/**
 * Gemini's 429 body carries "Please retry in 47.87s". Honour it — guessing a
 * backoff just burns more of the very quota we're waiting on. Returns null when
 * the wait is longer than we're willing to block a request for.
 */
function suggestedRetryDelayMs(error: unknown, capMs: number): number | null {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.match(/retry in ([\d.]+)s/i);
  if (!m) return null;
  const ms = Math.ceil(Number(m[1]) * 1000) + 250;
  return ms <= capMs ? ms : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stable 32-bit hash so unknown images produce the same mock audit every run. */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Deterministic offline audit. Known catalog labels report their real seed
 * values so the mock stays coherent with the rest of the pipeline; anything
 * else gets plausible hash-derived values.
 */
export function mockAuditNutritionLabel(imageUrl: string): LabelAuditResult {
  const entry = findCatalogEntryByLabelUrl(imageUrl);

  if (entry) {
    const activeGrams = entry.activeIngredients.reduce(
      (sum, i) => sum + i.amountPerServingGrams * (i.purityPercentage / 100),
      0,
    );
    const totalGrams = entry.activeIngredients.reduce(
      (sum, i) => sum + i.amountPerServingGrams,
      0,
    );
    const fillerCallouts = entry.fillerCallouts ?? [];

    return {
      imageUrl,
      source: 'DETERMINISTIC_MOCK',
      activeIngredients: entry.activeIngredients,
      servingsPerContainer: entry.servingsPerContainer,
      fillerCallouts,
      fillerPercentage: totalGrams > 0
        ? Number((100 - (activeGrams / totalGrams) * 100).toFixed(2))
        : 0,
      // Blend products are genuinely harder to read, so confidence is lower.
      confidence: fillerCallouts.length > 0 ? 0.74 : 0.95,
      notes: `Offline audit resolved from seed catalog entry "${entry.id}".`,
    };
  }

  const h = hashString(imageUrl);
  const purity = 90 + (h % 10);
  const amount = 2 + (h % 4);
  const ingredient: ActiveIngredient = {
    name: 'Unidentified Active Compound',
    amountPerServingGrams: amount,
    purityPercentage: purity,
  };

  return {
    imageUrl,
    source: 'DETERMINISTIC_MOCK',
    activeIngredients: [ingredient],
    servingsPerContainer: 30 + (h % 40),
    fillerCallouts: [],
    fillerPercentage: Number((100 - purity).toFixed(2)),
    confidence: 0.4,
    notes:
      'Offline audit: label image is not in the seed catalog, so values are ' +
      'synthesised deterministically. Set VISION_API_KEY for a real reading.',
  };
}

/**
 * Audit one supplement label.
 *
 * Uses the live vision model when VISION_API_KEY is set, otherwise the
 * deterministic mock. If a live call fails it degrades to the mock rather than
 * breaking the request — a rate limit mid-demo should not take the app down —
 * and records why in `notes` so the failure stays visible.
 */
export async function auditNutritionLabel(imageUrl: string): Promise<LabelAuditResult> {
  if (!hasVisionKey()) return mockAuditNutritionLabel(imageUrl);

  loadCacheFromDisk();

  const cacheable = !imageUrl.startsWith('data:');
  const cached = cacheable ? auditCache.get(cacheKey(imageUrl)) : undefined;
  if (cached) return cached;

  // Retrying a rate-limited call spends the very quota it is waiting on: at 15
  // labels x 3 attempts you issue 45 requests against a 20/min cap and every
  // one fails. So retry at most once, and only when the API's own suggested
  // delay is short enough to wait out. VISION_MAX_ATTEMPTS=1 disables it
  // entirely, which is what the prewarm script wants.
  const maxAttempts = Math.max(1, Number(process.env.VISION_MAX_ATTEMPTS ?? 2) || 1);
  const RETRY_WAIT_CAP_MS = 15_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await acquireSlot();
    try {
      const result = await auditWithVisionModel(imageUrl);
      if (cacheable) {
        auditCache.set(cacheKey(imageUrl), result);
        persistCacheToDisk();
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRateLimited(error)) break;

      const wait = suggestedRetryDelayMs(error, RETRY_WAIT_CAP_MS);
      if (wait === null) break; // Longer than we'll block for — fall back now.
      await sleep(wait);
    } finally {
      releaseSlot();
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  const fallback = mockAuditNutritionLabel(imageUrl);
  return {
    ...fallback,
    notes: isOutOfCredits(lastError)
      ? `The ${visionModelId()} account has no credits left, so this reading is the ` +
        'deterministic mock. Waiting will not help — add credits, or switch ' +
        'VISION_BASE_URL/VISION_MODEL to a provider that has quota.'
      : isRateLimited(lastError)
        ? `Live vision call to ${visionModelId()} was rate-limited, so this reading is the ` +
          'deterministic mock. Run `npm run warm-labels` once to cache a real reading ' +
          'for every label, then `npm run save-label-cache` to commit them.'
        : `Live vision call failed (${reason}). Fell back to deterministic mock.`,
  };
}
