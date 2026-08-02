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
}

export function agentModelId(): string {
  return process.env.AGENT_MODEL?.trim() || visionModelId();
}

export function backendKind(): BackendKind {
  const base = process.env.VISION_BASE_URL?.trim() ?? DEFAULT_VISION_BASE_URL;
  if (process.env.AGENT_BACKEND === 'openai' || process.env.AGENT_BACKEND === 'gemini') {
    return process.env.AGENT_BACKEND;
  }
  return /generativelanguage\.googleapis\.com/.test(base) ? 'gemini' : 'openai';
}

// --- OpenAI-style ------------------------------------------------------------

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

function createOpenAIBackend(system: string, goal: string, signal?: AbortSignal): ModelBackend {
  const client = new OpenAI({
    apiKey: process.env.VISION_API_KEY,
    baseURL: process.env.VISION_BASE_URL?.trim() || DEFAULT_VISION_BASE_URL,
  });

  const messages: OpenAIMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: goal },
  ];

  return {
    kind: 'openai',
    model: agentModelId(),

    async next() {
      return withRetry(async () => {
      const completion = await client.chat.completions.create(
        {
          model: agentModelId(),
          messages: messages as never,
          tools: toolSchemas(),
          tool_choice: 'auto',
          temperature: 0.2,
          max_completion_tokens: 4096,
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
          content: JSON.stringify(r.result).slice(0, 12_000),
        });
      }
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
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/429|quota|rate/i.test(message) || i === attempts - 1) throw error;

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
  const key = process.env.VISION_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

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
      const res = await fetch(url, {
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
  };
}

function truncate(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json.length <= 12_000) return value;
  return { truncated: true, preview: json.slice(0, 12_000) };
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
