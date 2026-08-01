import { z } from 'zod';

import { createLog } from '@/lib/agent/logger';
import {
  createPaymentSession,
  defaultMerchantUrl,
  getPaymentCredentials,
  pravaEnvironment,
} from '@/lib/prava/sdk-client';
import { verifyPasskeyAuthorization } from '@/lib/prava/passkey-verifier';

/**
 * POST /api/prava/mint-card
 *
 * Verifies the passkey authorization, then mints a Prava single-use credential
 * capped at the approved amount.
 *
 * The verification happens HERE, server-side, before any Prava call. A client
 * that could skip it would make the guardrail decorative.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  amountUSD: z.number().positive(),
  merchantName: z.string().min(1),
  challengeId: z.string().min(1),
  userPasskeySignature: z.string().min(1),
  products: z
    .array(
      z.object({
        description: z.string(),
        unitPrice: z.number().nonnegative(),
        quantity: z.number().positive(),
      }),
    )
    .optional(),
});

/**
 * GET /api/prava/mint-card?sessionId=…
 *
 * Polls for the single-use credential. It only exists once the user has
 * approved at Prava's hosted surface, so this returns `pending` until then
 * rather than blocking the request.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('sessionId');

  if (!sessionId) {
    return Response.json({
      endpoint: '/api/prava/mint-card',
      method: 'POST',
      pravaEnvironment: pravaEnvironment(),
    });
  }

  try {
    const creds = await getPaymentCredentials(sessionId, { timeoutMs: 0, intervalMs: 0 });
    return Response.json({
      ready: true,
      card: {
        cardId: sessionId,
        sessionId,
        txnRefId: creds.txnRefId,
        cardNumber: creds.token,
        expiryMonth: creds.expiryMonth,
        expiryYear: creds.expiryYear,
        cvv: creds.dynamicCvv,
        cardHolderName: 'MacroStack Agent',
        billingZip: '94105',
        isSingleUse: true,
        status: 'ACTIVE' as const,
        environment: pravaEnvironment(),
        amountCapUSD: Number(creds.amount),
        merchantName: creds.merchantName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A timeout here just means the user hasn't finished approving yet.
    if (/Timed out/.test(message)) {
      return Response.json({ ready: false, status: 'awaiting_user_approval' });
    }
    return Response.json({ ready: false, error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid mint request', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { amountUSD, merchantName, challengeId, userPasskeySignature, products } = parsed.data;

  const verification = verifyPasskeyAuthorization(challengeId, userPasskeySignature, {
    amountUSD,
    merchantName,
  });

  if (!verification.valid) {
    return Response.json(
      {
        error: `Passkey authorization rejected: ${verification.reason}`,
        passkeyMode: verification.mode,
      },
      { status: 401 },
    );
  }

  try {
    const session = await createPaymentSession({
      userId: 'macrostack_demo_user',
      userEmail: 'demo@macrostack.test',
      totalAmountUSD: amountUSD,
      merchantName,
      merchantUrl: defaultMerchantUrl(),
      products: products ?? [
        { description: 'MacroStack supplement stack', unitPrice: amountUSD, quantity: 1 },
      ],
    });

    if (session.environment === 'SIMULATED') {
      const { mintPravaCard } = await import('@/lib/prava/sdk-client');
      const card = await mintPravaCard({ amountUSD, merchantName, userPasskeySignature, products });
      return Response.json({
        card,
        needsApproval: false,
        reasoningLogs: [
          createLog(
            'CARD_MINTING',
            'WARNING',
            `SIMULATED card ••••${card.cardNumber.slice(-4)} — no Prava account configured`,
            { environment: 'SIMULATED', passkeyMode: verification.mode, merchant: merchantName },
          ),
        ],
      });
    }

    // The session is capped at this amount by Prava. Credentials are issued
    // only after the user approves at `iframeUrl` — that approval is the whole
    // guardrail, so it is never bypassed here.
    return Response.json({
      session: {
        sessionId: session.sessionId,
        iframeUrl: session.iframeUrl,
        orderId: session.orderId,
        expiresAt: session.expiresAt,
        environment: session.environment,
      },
      needsApproval: true,
      reasoningLogs: [
        createLog(
          'CARD_MINTING',
          'INFO',
          `Prava session created, capped at $${amountUSD.toFixed(2)} — awaiting user approval`,
          {
            environment: session.environment,
            passkeyMode: verification.mode,
            sessionId: session.sessionId,
            merchant: merchantName,
          },
        ),
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Card minting failed';
    return Response.json(
      {
        error: message,
        reasoningLogs: [createLog('CARD_MINTING', 'ERROR', message, { merchant: merchantName })],
      },
      { status: 502 },
    );
  }
}
