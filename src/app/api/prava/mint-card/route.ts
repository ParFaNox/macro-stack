import { z } from 'zod';

import type { PravaCardDetails } from '@/types';
import { waitForCardToken } from '@/lib/prava/sdk-client';

/**
 * POST /api/prava/mint-card
 *
 * Body: { sessionId }  →  Returns: PravaCardDetails
 *
 * Called after the client-side Prava iframe (mounted from the session
 * /api/prava/session returned) reports that card entry + passkey/OTP
 * verification succeeded. Polls Prava for the resulting single-use card
 * token — see waitForCardToken in sdk-client.ts.
 */

export const runtime = 'nodejs';

const RequestSchema = z.object({
  sessionId: z.string().min(1),
});

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

  try {
    const result = await waitForCardToken(parsed.data.sessionId);
    const lineItem = result.transactions
      .flatMap((t) => t.lineItems)
      .find((li) => li.token && li.dynamicCvv);

    if (!lineItem?.token || !lineItem.dynamicCvv) {
      return Response.json(
        { error: `Prava session did not produce a card token (status: ${result.status})` },
        { status: 502 },
      );
    }

    const card: PravaCardDetails = {
      // Prava's disposable single-use tokens have no separate persistent
      // card id — the session id doubles as what we revoke by later
      // (see checkout-runner.ts).
      cardId: parsed.data.sessionId,
      cardNumber: lineItem.token,
      expiryMonth: lineItem.expiryMonth ?? '',
      expiryYear: lineItem.expiryYear ?? '',
      cvv: lineItem.dynamicCvv,
      cardHolderName: 'MacroStack Buyer',
      billingZip: '',
      isSingleUse: true,
      status: 'ACTIVE',
    };

    return Response.json(card);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not mint Prava card' },
      { status: 502 },
    );
  }
}
