import { z } from 'zod';

import { createSession } from '@/lib/prava/sdk-client';

/**
 * POST /api/prava/session
 *
 * First half of minting a card: opens a Prava session for the cart total and
 * returns the session token + iframe URL the client mounts via
 * `@prava-sdk/core` for card entry and passkey/OTP verification. The second
 * half, /api/prava/mint-card, polls for the resulting single-use token once
 * that's done — see src/lib/prava/sdk-client.ts for why those are split.
 */

export const runtime = 'nodejs';

const ProductSchema = z.object({
  productName: z.string().min(1),
  vendorName: z.string().min(1),
  discountedPriceUSD: z.number().nonnegative(),
});

const RequestSchema = z.object({
  products: z.array(ProductSchema).min(1),
});

// This app has no accounts — /login and /signup are unwired forms (see the
// reality check in TEAMMATE-3-GUIDE.md). Prava still requires a user_id and
// email per session, so every demo checkout uses a fixed placeholder identity.
const DEMO_USER = { userId: 'macrostack_demo_user', userEmail: 'demo@macrostack.app' };

// Our own mock storefront. Prava requires an https merchant URL (forwarded to
// Visa) even in sandbox, so a resolvable-looking placeholder stands in for
// the real http://localhost:3000/mock-merchant.
const MOCK_MERCHANT = { name: 'MockMart', url: 'https://mockmart.example.com', countryCodeIso2: 'US' };

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
        error: 'Invalid request',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  // Recompute the total server-side from the line items rather than trusting
  // a client-sent aggregate — this is the number that hard-caps the card.
  const totalAmountUSD = parsed.data.products.reduce((s, p) => s + p.discountedPriceUSD, 0);

  try {
    const session = await createSession({
      ...DEMO_USER,
      totalAmountUSD: totalAmountUSD.toFixed(2),
      merchant: MOCK_MERCHANT,
      products: parsed.data.products.map((p) => ({
        description: p.productName,
        unitPriceUSD: p.discountedPriceUSD.toFixed(2),
      })),
    });
    return Response.json(session);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not create Prava session' },
      { status: 502 },
    );
  }
}
