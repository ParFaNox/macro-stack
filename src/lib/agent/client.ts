import type {
  AgentReasoningLog,
  StackOptimizationRequest,
  StackOptimizationResult,
} from '@/types';
import type { AuditLabelResponse, LabelAuditResult } from '@/types/agent';

/**
 * Browser-side client for the agent endpoints.
 *
 * This is the handoff to Teammate 1: replace the setTimeout mock in
 * compare/page.tsx with one call from here. Nothing else in the UI needs to
 * change — these return the same shared types the components already render.
 *
 *   // one-shot
 *   const result = await optimizeStack({ targetBudgetUSD: 80, targetIngredients: [...] });
 *   setAuditedProducts(result.recommendedProducts);
 *   setReasoningLogs(result.reasoningLogs);
 *
 *   // live-streaming version (logs animate into the feed as they happen)
 *   await streamOptimizeStack(req, {
 *     onLog:    (log)    => setReasoningLogs((prev) => [...prev, log]),
 *     onResult: (result) => setAuditedProducts(result.recommendedProducts),
 *   });
 */

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error ?? `Request failed with HTTP ${res.status}`;
  } catch {
    return `Request failed with HTTP ${res.status}`;
  }
}

/** POST /api/optimize — returns the finished stack in one shot. */
export async function optimizeStack(
  request: StackOptimizationRequest,
): Promise<StackOptimizationResult> {
  const res = await fetch('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export interface StreamHandlers {
  onLog?: (log: AgentReasoningLog) => void;
  onResult?: (result: StackOptimizationResult) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * POST /api/optimize?stream=1 — invokes `onLog` per reasoning step as it
 * happens, then `onResult`. Resolves with the final result.
 *
 * Uses fetch + a manual SSE parse rather than EventSource because EventSource
 * cannot issue POST requests.
 */
export async function streamOptimizeStack(
  request: StackOptimizationRequest,
  handlers: StreamHandlers = {},
): Promise<StackOptimizationResult | undefined> {
  const res = await fetch('/api/optimize?stream=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: handlers.signal,
  });

  if (!res.ok) throw new Error(await readError(res));
  if (!res.body) throw new Error('Streaming response had no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: StackOptimizationResult | undefined;

  const dispatch = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];

    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;

    const payload = JSON.parse(dataLines.join('\n'));
    if (event === 'log') handlers.onLog?.(payload as AgentReasoningLog);
    else if (event === 'result') {
      finalResult = payload as StackOptimizationResult;
      handlers.onResult?.(finalResult);
    } else if (event === 'error') {
      handlers.onError?.(payload?.message ?? 'Stack optimization failed');
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; the trailing partial frame
    // stays in the buffer until its terminator arrives.
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (frame.trim()) dispatch(frame);
    }
  }

  if (buffer.trim()) dispatch(buffer);
  return finalResult;
}

/** POST /api/audit-label with an image URL or data URI. */
export async function auditLabel(imageUrl: string): Promise<AuditLabelResponse> {
  const res = await fetch('/api/audit-label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** POST /api/audit-label with a File from an <input type="file">. */
export async function auditLabelFile(file: File): Promise<AuditLabelResponse> {
  const form = new FormData();
  form.append('image', file);

  const res = await fetch('/api/audit-label', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export type { AuditLabelResponse, LabelAuditResult };
