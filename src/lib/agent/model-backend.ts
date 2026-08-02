import OpenAI from 'openai';

import { AGENT_TOOLS, toolSchemas } from './tools';
import { DEFAULT_VISION_BASE_URL, visionModelId } from './vision-auditor';

/**
 * Model backend for the agent loop.
 *
 * Two implementations, because multi-turn tool calling is NOT portable across
 * these providers:
 *
 *  - `openai`  standard OpenAI tool calling. Works for OpenAI, and for any
 *              provider whose compatibility layer round-trips tool calls.
 *
 *  - `gemini`  Gemini's NATIVE generateContent API. Required, not preferred:
 *              Gemini's OpenAI-compatible endpoint rejects the second turn of
 *              any tool conversation with "Function call is missing a
 *              thought_signature in functionCall parts". That signature is
 *              produced by their thinking models and the compat layer does not
 *              surface it, so there is nothing to send back. Verified against
 *              gemini-3.5-flash, 3.5-flash-lite and 3.1-flash-lite, and with
 *              reasoning_effort none/low — all 400.
 *
 *              The native API returns `thoughtSignature` on the functionCall
 *              part, and accepts it back if the model turn is echoed verbatim.
 *              So that is what we do.
 */

export type BackendKind = 'openai' | 'gemini';

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, never>;
}

export interface ModelTurn {
  /** Free text the model emitted alongside (or instead of) tool calls. */
  text?: string;
  toolCalls: ToolCallRequest[];
}

export interface ModelBackend {
  kind: BackendKind;
  model: string;
  /** Sends the conversation and returns the model's next turn. */
  next(): Promise<ModelTurn>;
  /** Records the model's turn plus the tool results, ready for the next call. */
  addToolResults(results: Array<{ id: string; name: string; result: unknown }>): void;
  /** Appends a plain instruction, for steering a run that has stalled. */
  addUserMessage(text: string): void;
}

/**
 * The agent can run on a different provider from the vision auditor, and
 * usually should. Vision needs a multimodal model; the agent loop needs many
 * cheap turns with reliable tool calling. Gemini's free tier is 20 requests a
 * minute and a single agent run needs 5-10 of them, so keeping both on one key
 * makes the loop unusable.
 *
 * Set AGENT_BASE_URL / AGENT_API_KEY / AGENT_MODEL to split them. Groq is the
 * obvious pairing: free, no card, 30 requests a minute, and real OpenAI-style
 * tool calling rather than Gemini's thought_signature round-trip.
 */
export function agentBaseUrl(): string {
  return (
    process.env.AGENT_BASE_URL?.trim() ||
    process.env.VISION_BASE_URL?.trim() ||
    DEFAULT_VISION_BASE_URL
  );
}

/**
 * Models to try, in order. Comma-separated in AGENT_MODEL.
 *
 * Free tiers meter per MODEL as well as per key, and the limit that actually
 * bites is tokens-per-DAY, not per-minute — llama-3.3-70b allows 100k/day,
 * which a few agent runs exhaust. Waiting does not help; the window is 24
 * hours. So a run that hits a daily wall continues on the next model instead
 * of dying, and the trace says which model produced the turn.
 */
function modelPool(): string[] {
  const raw = process.env.AGENT_MODEL?.trim();
  if (!raw) return [visionModelId()];
  return raw.split(',').map((m) => m.trim()).filter(Boolean);
}

/** The model currently in use — advances only when one is exhausted. */
let modelCursor = 0;

export function agentModelId(): string {
  const pool = modelPool();
  return pool[Math.min(modelCursor, pool.length - 1)];
}

/**
 * Moves to the next model. Returns false when there is nothing left to try,
 * which is the only case where the run genuinely cannot continue.
 */
function advanceModel(): boolean {
  if (modelCursor >= modelPool().length - 1) return false;
  modelCursor++;
  return true;
}

/** True when the error is a daily cap — retrying inside this run is pointless. */
function isDailyQuota(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /per day|TPD|RPD/i.test(msg);
}

export function agentModelPool(): string[] {
  return modelPool();
}

/**
 * Keys may be a comma-separated pool. Free tiers are metered per key, so two
 * keys is two lots of quota — and a 429 fails over to the next one instead of
 * killing the run.
 */
function keyPool(): string[] {
  const raw = process.env.AGENT_API_KEY?.trim() || process.env.VISION_API_KEY?.trim() || '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

let keyCursor = 0;

export function nextKey(): string {
  const keys = keyPool();
  if (keys.length === 0) return '';
  const key = keys[keyCursor % keys.length];
  keyCursor++;
  return key;
}

export function keyCount(): number {
  return keyPool().length;
}

export function backendKind(): BackendKind {
  if (process.env.AGENT_BACKEND === 'openai' || process.env.AGENT_BACKEND === 'gemini') {
    return process.env.AGENT_BACKEND;
  }
  // Only Gemini's own endpoint needs the native path; everything else
  // (OpenAI, Groq, OpenRouter, Together) speaks OpenAI tool calling.
  return /generativelanguage\.googleapis\.com/.test(agentBaseUrl()) ? 'gemini' : 'openai';
}

/**
 * Caps how much of a tool result goes into the transcript.
 *
 * Every turn resends the whole conversation, so a fat tool result is not paid
 * for once — it is paid for on every subsequent turn. Groq's free tier allows
 * 12k tokens a minute; at the previous 12,000-CHARACTER cap a single run could
 * spend that several times over and die mid-reasoning with a 429.
 *
 * 1,800 characters is roughly 450 tokens: enough for a product list or a label
 * audit with its flags, and the truncation is announced so the model knows it
 * is looking at a prefix rather than silently reasoning over half a list.
 */
const MAX_TOOL_RESULT_CHARS = 1_800;

export function compactToolResult(result: unknown): string {
  const json = JSON.stringify(result);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated — ask for fewer items if you need more detail]`;
}

// --- OpenAI-style ------------------------------------------------------------

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

function createOpenAIBackend(system: string, goal: string, signal?: AbortSignal): ModelBackend {
  const clientFor = (key: string) => new OpenAI({ apiKey: key, baseURL: agentBaseUrl() });

  const messages: OpenAIMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: goal },
  ];

  return {
    kind: 'openai',
    model: agentModelId(),

    async next() {
      return withRetry(async () => {
      const completion = await clientFor(nextKey()).chat.completions.create(
        {
          model: agentModelId(),
          messages: messages as never,
          tools: toolSchemas(),
          tool_choice: 'auto',
          temperature: 0.2,
          // Groq counts max_completion_tokens as RESERVED against the
          // tokens-per-minute budget, not as a ceiling that only costs what it
          // uses. At 4096 against a 12k/min free tier, two turns booked the
          // whole minute and the third 429'd mid-reasoning. The agent emits a
          // sentence of reasoning plus tool calls, so 1024 is ample and buys
          // roughly four times as many turns per minute.
          max_completion_tokens: Number(process.env.AGENT_MAX_TOKENS ?? 1024),
        },
        { signal },
      );

      const message = completion.choices[0]?.message;
      if (!message) throw new Error('Model returned no message');

      const calls = (message.tool_calls ?? []).flatMap((c) =>
        'function' in c
          ? [
              {
                id: c.id,
                name: c.function.name,
                args: safeParse(c.function.arguments),
              },
            ]
          : [],
      );

      messages.push({
        role: 'assistant',
        content: message.content ?? null,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      });

      return { text: message.content?.trim() || undefined, toolCalls: calls };
      });
    },

    addToolResults(results) {
      for (const r of results) {
        messages.push({
          role: 'tool',
          tool_call_id: r.id,
          content: compactToolResult(r.result),
        });
      }
    },

    addUserMessage(text) {
      messages.push({ role: 'user', content: text });
    },
  };
}

// --- Gemini native -----------------------------------------------------------

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, never> };
  functionResponse?: { name: string; response: unknown };
  thoughtSignature?: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Gemini wants SCREAMING type names in its schema dialect. */
/**
 * Retries a rate-limited call instead of losing the whole run.
 *
 * The free tier is 20 requests/minute and an agent run is 5-10 calls, so two
 * runs in quick succession will hit it. Honours the API's own suggested delay
 * where it gives one.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/429|quota|rate/i.test(message)) throw error;

      // A daily cap does not reset within any reasonable wait. Switch model
      // and retry immediately; only give up once the pool is exhausted.
      if (isDailyQuota(error)) {
        if (!advanceModel()) throw error;
        continue;
      }

      if (i === attempts - 1) throw error;
      const suggested = message.match(/retry in ([\d.]+)s/i);
      const waitMs = suggested ? Math.ceil(Number(suggested[1]) * 1000) + 500 : (i + 1) * 6000;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 30_000)));
    }
  }
  throw lastError;
}

function toGeminiSchema(schema: Record<string, unknown>): unknown {
  if (Array.isArray(schema)) return schema.map((s) => toGeminiSchema(s as Record<string, unknown>));
  if (!schema || typeof schema !== 'object') return schema;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'type' && typeof v === 'string') out[k] = v.toUpperCase();
    else if (v && typeof v === 'object') out[k] = toGeminiSchema(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

function createGeminiBackend(system: string, goal: string, signal?: AbortSignal): ModelBackend {
  const model = agentModelId();
  const endpoint = () =>
    `${agentBaseUrl().replace(/\/v1beta\/openai\/?$/, '')}/v1beta/models/${model}:generateContent?key=${nextKey()}`
      .replace('//v1beta', '/v1beta');

  const tools = [
    {
      functionDeclarations: AGENT_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.parameters),
      })),
    },
  ];

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: goal }] }];
  /** The model turn exactly as returned, so thoughtSignature survives. */
  let lastModelParts: GeminiPart[] = [];

  return {
    kind: 'gemini',
    model,

    async next() {
      return withRetry(async () => {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          tools,
          systemInstruction: { parts: [{ text: system }] },
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
        signal,
      });

      const body = await res.json();
      if (body.error) {
        throw new Error(`Gemini ${res.status}: ${String(body.error.message).slice(0, 220)}`);
      }

      const parts: GeminiPart[] = body.candidates?.[0]?.content?.parts ?? [];
      lastModelParts = parts;

      const toolCalls: ToolCallRequest[] = parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({
          id: `${p.functionCall!.name}_${contents.length}_${i}`,
          name: p.functionCall!.name,
          args: (p.functionCall!.args ?? {}) as Record<string, never>,
        }));

      const text = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join(' ')
        .trim();

      return { text: text || undefined, toolCalls };
      });
    },

    addToolResults(results) {
      // Echo the model turn verbatim. Rebuilding these parts would drop
      // thoughtSignature and the next request would 400.
      contents.push({ role: 'model', parts: lastModelParts });
      contents.push({
        role: 'user',
        parts: results.map((r) => ({
          functionResponse: {
            name: r.name,
            response: truncate(r.result),
          },
        })),
      });
    },

    addUserMessage(text) {
      contents.push({ role: 'user', parts: [{ text }] });
    },
  };
}

/** Same budget as the OpenAI path, for the same reason — see compactToolResult. */
function truncate(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return value;
  return { truncated: true, preview: json.slice(0, MAX_TOOL_RESULT_CHARS) };
}

function safeParse(text: string): Record<string, never> {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {} as Record<string, never>;
  }
}

export function createBackend(system: string, goal: string, signal?: AbortSignal): ModelBackend {
  return backendKind() === 'gemini'
    ? createGeminiBackend(system, goal, signal)
    : createOpenAIBackend(system, goal, signal);
}
