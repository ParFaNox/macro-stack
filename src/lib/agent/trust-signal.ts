import fs from 'node:fs';
import path from 'node:path';

import OpenAI from 'openai';
import { z } from 'zod';

import type { BrandTrust, TrustSource } from '@/types/agent';
import TRUST_SEED from './trust-seed.json';
import { DEFAULT_VISION_BASE_URL, visionModelId } from './vision-auditor';

/**
 * Brand trust signal, backed by Senso.
 *
 * Cost per active gram alone can recommend a brand that is cheap because it is
 * cutting corners. This asks a second question — *can this brand be trusted?* —
 * against a Senso knowledge base of third-party verification records, and
 * returns the cited passage that justifies the answer.
 *
 * Retrieval is genuinely Senso. The corpus is seeded (see trust-corpus.ts: our
 * catalog brands are fictional, so no real NSF or FDA record exists for them),
 * and every result says which it is via `source`. Point the ingest script at
 * real certification feeds and nothing here changes.
 *
 * Without a key, brands come back UNVERIFIED with a neutral score — never a
 * fabricated one.
 */

const DEFAULT_BASE = 'https://apiv2.senso.ai/api/v1';

export function hasSensoKey(): boolean {
  return Boolean(process.env.SENSO_API_KEY?.trim());
}

function sensoBase(): string {
  return process.env.SENSO_API_BASE?.trim() || DEFAULT_BASE;
}

/**
 * Model used to turn Senso's answer into a score. Defaults to the vision model
 * but is separately configurable, because this is a small text-only task and
 * providers meter quota per model — sharing the vision model's bucket means a
 * burst of label audits starves trust scoring, and vice versa.
 */
function trustModelId(): string {
  return process.env.TRUST_MODEL?.trim() || visionModelId();
}

interface SensoSearchResponse {
  query: string;
  answer?: string;
  results?: Array<{
    title?: string;
    /** Senso returns the matched passage as `chunk_text`. */
    chunk_text?: string;
    content?: string;
    text?: string;
    url?: string;
    score?: number;
  }>;
  total_results?: number;
}

const TrustExtractionSchema = z.object({
  score: z.number().min(0).max(1),
  signals: z.array(z.string()).max(6),
});

const SCORING_PROMPT = `You convert a supplement brand's verification summary into a trust score.

Scoring guide:
 0.85-1.00  NSF Certified for Sport or Informed Sport, clean FDA record, full
            per-ingredient disclosure, verified label accuracy.
 0.65-0.84  Some third-party testing, clean record, honest labelling.
 0.45-0.64  No certification but no red flags, or mixed evidence.
 0.25-0.44  Serious concerns: amino spiking, proprietary blends hiding doses,
            or label amounts that don't match independent assays.
 0.00-0.24  FDA warning letter or recall, plus concealed dosing.

Read carefully for NEGATION: "not NSF certified" and "no warning letters" are
the OPPOSITE of "NSF certified" and "warning letter on record".

signals: up to 6 short markers, each prefixed "+ " (good) or "- " (bad), e.g.
"+ NSF Certified for Sport", "- Amino spiking". Only include what the summary
actually supports.

Respond with JSON only: {"score": number, "signals": string[]}`;

/**
 * Turns Senso's synthesised answer into a numeric score.
 *
 * Two earlier attempts failed and are worth recording so nobody reintroduces
 * them: keyword-matching the answer scores "not NSF certified" as certified,
 * and regex over the retrieved record misses fields because Senso chunks
 * documents — one chunk rarely holds every field.
 *
 * A small model pass handles negation natively and reads whatever Senso
 * actually said. It runs once per brand and the result is cached, so the cost is
 * a handful of calls per deployment, not per request.
 *
 * Senso remains the source of truth: it retrieves the records and writes the
 * verdict the user reads. This only derives the sort key.
 */
async function scoreFromAnswer(
  brand: string,
  answer: string,
): Promise<{ score: number; signals: string[] }> {
  const client = new OpenAI({
    apiKey: process.env.VISION_API_KEY,
    baseURL: process.env.VISION_BASE_URL?.trim() || DEFAULT_VISION_BASE_URL,
  });

  const completion = await client.chat.completions.create({
    model: trustModelId(),
    response_format: { type: 'json_object' },
    temperature: 0,
    max_completion_tokens: 2048,
    messages: [
      { role: 'system', content: SCORING_PROMPT },
      { role: 'user', content: `Brand: ${brand}\n\nVerification summary:\n${answer}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Trust scoring model returned an empty response');

  const parsed = TrustExtractionSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Trust scoring output failed validation: ${parsed.error.message}`);
  }

  return {
    score: Number(parsed.data.score.toFixed(3)),
    // Normalise the minus sign for display.
    signals: parsed.data.signals.map((s) => s.replace(/^-\s/, '− ')),
  };
}

function neutralTrust(brand: string, source: TrustSource, notes: string): BrandTrust {
  return {
    brand,
    score: 0.5,
    verdict: 'No third-party verification available — ranked on price alone.',
    signals: [],
    citations: [],
    source,
    notes,
  };
}

// --- Cache -------------------------------------------------------------------
// Same two-layer approach as the label auditor: a committed seed so deployments
// start warm on a read-only filesystem, plus a local overlay for iteration.
// Senso's free tier is 100 credits, so re-querying on every request would burn
// them in a single demo.

const trustCache = new Map<string, BrandTrust>();
const CACHE_FILE = path.join(process.cwd(), '.macrostack-cache', 'brand-trust.json');
let loaded = false;

function loadCache(): void {
  if (loaded) return;
  loaded = true;
  for (const [k, v] of Object.entries(TRUST_SEED as Record<string, BrandTrust>)) {
    trustCache.set(k, v);
  }
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, BrandTrust>)) {
      trustCache.set(k, v);
    }
  } catch {
    // No local overlay — expected on a fresh clone and in production.
  }
}

function persist(): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(trustCache), null, 2));
  } catch {
    // Read-only filesystem: in-memory cache still works. Never break a request.
  }
}

export function trustCacheStats(): { cached: number; verified: number } {
  loadCache();
  const values = [...trustCache.values()];
  return {
    cached: values.length,
    verified: values.filter((v) => v.source === 'SENSO_VERIFIED').length,
  };
}

// --- Public API --------------------------------------------------------------

async function querySenso(brand: string): Promise<BrandTrust> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${sensoBase()}/org/search`, {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.SENSO_API_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query:
          `Is ${brand} a trustworthy supplement brand? Report its third-party ` +
          'certifications (NSF Certified for Sport, Informed Sport), FDA ' +
          'enforcement history, label accuracy, and whether it uses proprietary blends.',
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Senso search failed (HTTP ${res.status})`);

    const data = (await res.json()) as SensoSearchResponse;
    const answer = data.answer?.trim() ?? '';
    const results = data.results ?? [];

    // Retrieval returns the top chunks across the whole knowledge base, so other
    // brands' records come back too. Score only the chunk that is actually about
    // this brand — otherwise a neighbouring brand's certifications leak in.
    const own = results.find((r) => (r.title ?? '').toLowerCase().startsWith(brand.toLowerCase()));

    if (!answer || /no results found/i.test(answer) || !own) {
      return neutralTrust(
        brand,
        'UNVERIFIED_NO_RECORD',
        `Senso holds no verification record for "${brand}". Run \`npm run ingest-trust\` ` +
          'to seed the knowledge base, or add this brand to the corpus.',
      );
    }

    const { score, signals } = await scoreFromAnswer(brand, answer);

    return {
      brand,
      score,
      verdict: answer,
      signals,
      // Lead with the brand's own record, then any supporting context.
      citations: [own, ...results.filter((r) => r !== own)].slice(0, 3).map((r) => ({
        title: r.title ?? 'Senso knowledge base',
        excerpt: (r.chunk_text ?? r.content ?? r.text ?? '').slice(0, 220),
        ...(r.url ? { url: r.url } : {}),
      })),
      source: 'SENSO_VERIFIED',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Trust verdict for one brand. Never throws — a trust lookup failing must not
 * take down an optimization, so failures degrade to a neutral, clearly labelled
 * score.
 */
export async function getBrandTrust(brand: string): Promise<BrandTrust> {
  loadCache();

  const cached = trustCache.get(brand);
  if (cached) return cached;

  if (!hasSensoKey()) {
    return neutralTrust(
      brand,
      'UNVERIFIED_NO_KEY',
      'SENSO_API_KEY is not set, so no third-party verification was consulted.',
    );
  }

  try {
    const trust = await querySenso(brand);
    if (trust.source === 'SENSO_VERIFIED') {
      trustCache.set(brand, trust);
      persist();
    }
    return trust;
  } catch (error) {
    return neutralTrust(
      brand,
      'UNVERIFIED_ERROR',
      `Senso lookup failed (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
}

/** Letter grade for the UI. */
export function trustGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 0.85) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.55) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}
