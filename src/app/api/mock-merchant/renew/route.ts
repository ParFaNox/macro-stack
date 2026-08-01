import { attemptRenewal } from '@/lib/mock-merchant/store';

/**
 * Runs the merchant's recurring-billing job for one order.
 *
 * Exists to demonstrate the auto-renewal shield: after the agent retires the
 * single-use credential, this charge declines.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { orderId } = await request.json().catch(() => ({ orderId: null }));
  if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400 });

  const result = attemptRenewal(orderId);
  return Response.json({
    charged: result.success,
    reason: result.reason,
    orderId,
  });
}
