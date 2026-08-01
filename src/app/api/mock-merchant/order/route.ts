import { z } from 'zod';

import { createOrder, getOrder, isCardRevoked } from '@/lib/mock-merchant/store';

/** Mock merchant order API. POST places an order, GET reads one back. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OrderSchema = z.object({
  productName: z.string().min(1),
  unitPriceUSD: z.number().nonnegative(),
  quantity: z.number().positive().default(1),
  subscribeAndSave: z.boolean(),
  discountPct: z.number().min(0).max(100),
  totalChargedUSD: z.number().positive(),
  cardNumber: z.string().min(12),
  email: z.string().email(),
  shippingName: z.string().min(1),
});

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get('orderId');
  if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400 });

  const order = getOrder(orderId);
  if (!order) return Response.json({ error: `No order ${orderId}` }, { status: 404 });

  // Never return the full PAN, even from a simulated store.
  const { cardNumber: _omit, ...safe } = order;
  void _omit;
  return Response.json(safe);
}

export async function POST(request: Request) {
  const parsed = OrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid order', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const d = parsed.data;

  // A retired card must be refused here too, or the "single-use" claim only
  // holds for renewals and not for a replayed checkout.
  if (isCardRevoked(d.cardNumber)) {
    return Response.json(
      { error: 'Card declined — this credential is single-use and has already been spent.' },
      { status: 402 },
    );
  }

  const order = createOrder({
    merchantName: 'NutriMart (demo)',
    productName: d.productName,
    unitPriceUSD: d.unitPriceUSD,
    quantity: d.quantity,
    subscribeAndSave: d.subscribeAndSave,
    discountPct: d.discountPct,
    totalChargedUSD: d.totalChargedUSD,
    cardNumber: d.cardNumber,
    cardLast4: d.cardNumber.slice(-4),
    email: d.email,
    shippingName: d.shippingName,
  });

  return Response.json({ orderId: order.orderId, totalChargedUSD: order.totalChargedUSD });
}
