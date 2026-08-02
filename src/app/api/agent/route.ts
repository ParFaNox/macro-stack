import { z } from 'zod';

import { runAgent, agentModelId, type AgentEvent } from '@/lib/agent/agent-loop';
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

export async function GET() {
  return Response.json({
    endpoint: '/api/agent',
    method: 'POST',
    model: agentModelId(),
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

      try {
        await runAgent({
          goal: parsed.data.goal,
          budgetUSD: parsed.data.budgetUSD,
          onEvent: (e: AgentEvent) => send(e.type, e),
        });
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Agent run failed' });
      } finally {
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
