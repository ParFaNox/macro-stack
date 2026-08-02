import type { SupplementProduct } from '@/types';

/** Browser client for the agent's SSE stream. */

export type AgentEvent =
  | { type: 'start'; model: string; goal: string; budgetUSD: number }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; id: string; name: string; summary: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown; ms: number }
  | {
      type: 'proposal';
      products: SupplementProduct[];
      totalUSD: number;
      retailUSD: number;
      savedUSD: number;
      reasoning: string;
      rejected: Array<{ productId: string; why: string }>;
    }
  | { type: 'error'; message: string }
  | { type: 'done'; iterations: number; toolCalls: number };

export async function runAgentStream(
  goal: string,
  budgetUSD: number,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, budgetUSD }),
    signal,
  });

  if (!res.ok) {
    let message = `Agent request failed (HTTP ${res.status})`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      /* keep the status message */
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error('Agent stream had no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (frame: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (!data.length) return;
    try {
      onEvent({ ...JSON.parse(data.join('\n')), type: event } as AgentEvent);
    } catch {
      /* a malformed frame should not kill the stream */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (frame.trim()) dispatch(frame);
    }
  }
  if (buffer.trim()) dispatch(buffer);
}
