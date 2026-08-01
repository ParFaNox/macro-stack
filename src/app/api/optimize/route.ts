import { z } from 'zod';

import type { AgentReasoningLog, StackOptimizationResult } from '@/types';
import { INGREDIENT_FAMILIES } from '@/lib/agent/catalog';
import { ReasoningLogCollector } from '@/lib/agent/logger';
import { optimizeStack } from '@/lib/agent/optimizer-engine';

/**
 * POST /api/optimize
 *
 * Body: StackOptimizationRequest
 * Returns: StackOptimizationResult
 *
 * With `?stream=1`, returns Server-Sent Events instead: one `log` event per
 * reasoning step as it happens, then a terminal `result` event. Both modes run
 * the same optimizer through the same collector, so they can't diverge.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  targetBudgetUSD: z.number().positive('targetBudgetUSD must be greater than 0'),
  targetIngredients: z
    .array(z.string().min(1))
    .min(1, 'Supply at least one target ingredient'),
  preferredBrands: z.array(z.string().min(1)).optional(),
});

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  // Convenience for the frontend: what can actually be optimized for.
  return Response.json({
    endpoint: '/api/optimize',
    method: 'POST',
    availableIngredients: INGREDIENT_FAMILIES,
    example: {
      targetBudgetUSD: 80,
      targetIngredients: ['Creatine', 'L-Citrulline'],
    },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Invalid StackOptimizationRequest',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
        availableIngredients: INGREDIENT_FAMILIES,
      },
      { status: 400 },
    );
  }

  const wantsStream = new URL(request.url).searchParams.get('stream') === '1';

  if (!wantsStream) {
    try {
      const result = await optimizeStack(parsed.data);
      return Response.json(result);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Stack optimization failed' },
        { status: 500 },
      );
    }
  }

  const encoder = new TextEncoder();
  const collector = new ReasoningLogCollector();

  // Offline mock audits do no I/O, so the whole optimization finishes in under
  // a millisecond and all ~18 logs land in the same frame — the reasoning feed
  // pops instead of animating. AGENT_LOG_DELAY_MS paces the stream for demos.
  // Defaults to 0 (forward immediately), which is the right behaviour once a
  // real vision key makes each audit a network round-trip.
  const logDelayMs = Number(process.env.AGENT_LOG_DELAY_MS ?? 0) || 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };

      try {
        let result: StackOptimizationResult;

        if (logDelayMs <= 0) {
          // Forward every log the moment the optimizer emits it.
          collector.onLog((log: AgentReasoningLog) => send(sse('log', log)));
          result = await optimizeStack(parsed.data, collector);
        } else {
          // Queue logs and drain them on a timer while the optimizer runs.
          const queue: AgentReasoningLog[] = [];
          collector.onLog((log: AgentReasoningLog) => queue.push(log));

          let finished = false;
          const running = optimizeStack(parsed.data, collector).finally(() => {
            finished = true;
          });

          while (!finished || queue.length > 0) {
            const next = queue.shift();
            if (next) {
              send(sse('log', next));
              await sleep(logDelayMs);
            } else {
              await sleep(5);
            }
          }
          result = await running;
        }

        send(sse('result', result));
      } catch (error) {
        send(
          sse('error', {
            message: error instanceof Error ? error.message : 'Stack optimization failed',
          }),
        );
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
      // Stops nginx/proxies buffering the stream into one lump.
      'X-Accel-Buffering': 'no',
    },
  });
}
