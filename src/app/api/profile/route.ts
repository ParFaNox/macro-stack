import { cookies } from 'next/headers';
import { z } from 'zod';

import {
  SESSION_COOKIE,
  getProfileSummary,
  recordAudit,
  recordOrders,
  verifySessionToken,
} from '@/lib/auth/session';

/**
 * GET  → the signed-in user's real savings history
 * POST → records an audit or a set of orders against them
 *
 * Everything the profile shows is derived from these records. Nothing on that
 * page is hardcoded any more.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ signedIn: false }, { status: 401 });

  return Response.json({ signedIn: true, profile: getProfileSummary(userId) });
}

const AuditSchema = z.object({
  kind: z.literal('audit'),
  ingredients: z.array(z.string()),
  budgetUSD: z.number(),
  retailUSD: z.number(),
  discountedUSD: z.number(),
  savedUSD: z.number(),
  productCount: z.number(),
});

const OrdersSchema = z.object({
  kind: z.literal('orders'),
  orders: z.array(
    z.object({
      orderId: z.string(),
      productName: z.string(),
      merchantName: z.string(),
      chargedUSD: z.number(),
      retailUSD: z.number(),
      savedUSD: z.number(),
      cardLast4: z.string(),
      environment: z.string(),
    }),
  ),
});

export async function POST(request: Request) {
  const userId = await currentUserId();
  // Silently ignored when signed out — history is a bonus, not a gate on
  // being able to use the product.
  if (!userId) return Response.json({ recorded: false, reason: 'not signed in' });

  const body = await request.json().catch(() => null);

  const audit = AuditSchema.safeParse(body);
  if (audit.success) {
    recordAudit(userId, { ...audit.data, auditedAt: new Date().toISOString() });
    return Response.json({ recorded: true });
  }

  const orders = OrdersSchema.safeParse(body);
  if (orders.success) {
    recordOrders(
      userId,
      orders.data.orders.map((o) => ({ ...o, placedAt: new Date().toISOString() })),
    );
    return Response.json({ recorded: true });
  }

  return Response.json({ recorded: false, reason: 'unrecognised payload' }, { status: 400 });
}
