import OpenAI from 'openai';
import { z } from 'zod';

import type { ActiveIngredient } from '@/types';
import type { LabelAuditResult } from '@/types/agent';
import { findCatalogEntryByLabelUrl } from './catalog';

/**
 * Nutrition-label auditor.
 *
 * The task docs specified GPT-4o Vision, which is paid. This targets Google
 * Gemini through its OpenAI-COMPATIBLE endpoint instead, so the `openai` SDK is
 * reused unchanged and only the base URL / model name differ. Pointing
 * VISION_BASE_URL at Groq, OpenRouter or OpenAI proper needs no code change.
 *
 * With no VISION_API_KEY the auditor returns deterministic mock audits, so the
 * whole app is runnable with zero setup. The `source` field on every result
 * records which path ran, and it is echoed into the reasoning logs — a demo
 * should never quietly pass mock output off as a live model call.
 */

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEFAULT_MODEL = 'gemini-3.6-flash';

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
 * Vision APIs are most reliable with inline base64. Remote URLs are fetched and
 * inlined; data: URLs pass straight through.
 */
async function toImagePayload(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) return imageUrl;

  const res = await fetch(imageUrl);
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

  try {
    return await auditWithVisionModel(imageUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const fallback = mockAuditNutritionLabel(imageUrl);
    return {
      ...fallback,
      notes: `Live vision call failed (${reason}). Fell back to deterministic mock.`,
    };
  }
}
