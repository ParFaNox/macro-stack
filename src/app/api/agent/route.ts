import { z } from 'zod';

import { runAgent, type AgentEvent } from '@/lib/agent/agent-loop';
import { agentBaseUrl, agentModelId, backendKind, keyCount } from '@/lib/agent/model-backend';
import { AGENT_TOOLS } from '@/lib/agent/tools';

/**
 * POST /api/agent — give the agent a goal, watch it work.
 *
 * Streams Server-Sent Events: the agent's reasoning, every tool it decides to
 * call, every result, and finally a proposed stack for the human to approve.
 *
 * Distinct from /api/optimize, which runs a fixed pipeline. That endpoint stays
 * as the deterministic fallback — if the model is rate-limited or wanders, the
 * pipeline still produces a stack.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Schema = z.object({
  goal: z.string().min(3, 'Tell the agent what you want'),
  budgetUSD: z.number().positive('Budget must be greater than 0'),
});

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * One agent run at a time.
 *
 * Free-tier quota is per minute, shared across every concurrent run, so runs
 * launched together do not slow each other down — they starve each other.
 * Observed with three at once: one finished, one crawled to four minutes, and
 * one died at 0s with a 429 before discovering a single product, which left
 * nothing even to salvage.
 *
 * Queueing means the second person to click waits, and then succeeds. That is
 * strictly better than two people failing simultaneously, which is the version
 * that happens on a stage.
 *
 * No wait cap is needed: maxDuration already bounds each run at 300s, so the
 * queue cannot grow unboundedly for any one client.
 *
 * Pinned to globalThis so Next's dev recompiles cannot quietly reset it.
 */
const globalRef = globalThis as typeof globalThis & { __macrostackAgentQueue?: Promise<unknown> };

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = (globalRef.__macrostackAgentQueue ?? Promise.resolve())
    .catch(() => undefined)
    .then(job);
  // The chain tracks completion only; a rejected job must not poison the queue.
  globalRef.__macrostackAgentQueue = run.catch(() => undefined);
  return run;
}

export async function GET() {
  return Response.json({
    endpoint: '/api/agent',
    method: 'POST',
    model: agentModelId(),
    provider: new URL(agentBaseUrl()).host,
    toolCallingStyle: backendKind(),
    apiKeysInPool: keyCount(),
    tools: AGENT_TOOLS.map((t) => ({ name: t.name, description: t.description.slice(0, 110) })),
    example: { goal: 'Build me a strength stack — creatine and whey', budgetUSD: 120 },
  });
}

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Invalid agent request',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(sse(event, data)));
      };

      send('start', { model: agentModelId(), goal: parsed.data.goal, budgetUSD: parsed.data.budgetUSD });

      // Tell a queued caller why nothing is happening yet, rather than leaving
      // them watching an idle trace.
      const queued = setTimeout(
        () => send('thinking', { text: 'Another run is in progress — starting as soon as it finishes.' }),
        1500,
      );

      try {
        await enqueue(() => {
          clearTimeout(queued);
          return runAgent({
            goal: parsed.data.goal,
            budgetUSD: parsed.data.budgetUSD,
            onEvent: (e: AgentEvent) => send(e.type, e),
          });
        });
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Agent run failed' });
      } finally {
        clearTimeout(queued);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
