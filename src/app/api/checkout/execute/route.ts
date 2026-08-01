import { z } from 'zod';

import type { AgentReasoningLog } from '@/types';
import { ReasoningLogCollector } from '@/lib/agent/logger';
import { executePlaywrightCheckout } from '@/lib/automation/checkout-runner';

/**
 * POST /api/checkout/execute
 *
 * Runs the Playwright checkout against the merchant using the minted Prava
 * credential. `?stream=1` returns SSE progress — checkout takes 10-30s, so
 * streaming matters far more here than it did for label auditing.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CardSchema = z.object({
  cardId: z.string(),
  sessionId: z.string(),
  txnRefId: z.string(),
  cardNumber: z.string().min(12),
  expiryMonth: z.string(),
  expiryYear: z.string(),
  cvv: z.string(),
  cardHolderName: z.string(),
  billingZip: z.string(),
  isSingleUse: z.boolean(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'BLOCKED']),
  environment: z.enum(['SANDBOX', 'PRODUCTION', 'SIMULATED']),
  amountCapUSD: z.number(),
  merchantName: z.string(),
});

const Schema = z.object({
  products: z.array(z.any()).min(1),
  shippingAddress: z.object({
    fullName: z.string().min(1),
    streetAddress: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
    email: z.string().email(),
  }),
  cardDetails: CardSchema,
});

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Invalid CheckoutExecutionPayload',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  const payload = {
    ...parsed.data,
    card: parsed.data.cardDetails,
  } as unknown as Parameters<typeof executePlaywrightCheckout>[0];

  const wantsStream = new URL(request.url).searchParams.get('stream') === '1';

  if (!wantsStream) {
    const logs = new ReasoningLogCollector();
    const result = await executePlaywrightCheckout(payload, (step, detail) =>
      logs.push('CHECKOUT_AUTOMATION', 'INFO', step, detail),
    );
    return Response.json({ result, reasoningLogs: logs.all() });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };

      const logs = new ReasoningLogCollector();
      logs.onLog((log: AgentReasoningLog) => send(sse('log', log)));

      try {
        const result = await executePlaywrightCheckout(payload, (step, detail) => {
          const failed = typeof detail?.error === 'string';
          logs.push('CHECKOUT_AUTOMATION', failed ? 'ERROR' : 'INFO', step, detail);
        });
        send(sse('result', result));
      } catch (error) {
        send(
          sse('error', {
            message: error instanceof Error ? error.message : 'Checkout automation failed',
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
      'X-Accel-Buffering': 'no',
    },
  });
}
