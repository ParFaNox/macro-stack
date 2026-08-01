import { z } from 'zod';

import {
  createAuthorizationChallenge,
  passkeyMode,
  simulatedSignature,
} from '@/lib/prava/passkey-verifier';

/**
 * POST /api/prava/challenge
 *
 * Issues the challenge the user must sign to authorize a purchase. The amount
 * and merchant are bound into it server-side, so an approval for one basket can
 * never be replayed against another.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  amountUSD: z.number().positive(),
  merchantName: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid challenge request', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const c = createAuthorizationChallenge(parsed.data.amountUSD, parsed.data.merchantName);
  const mode = passkeyMode();

  return Response.json({
    challengeId: c.challengeId,
    challenge: c.challenge,
    amountUSD: c.amountUSD,
    merchantName: c.merchantName,
    expiresAt: new Date(c.expiresAt).toISOString(),
    mode,
    // In simulated mode the server hands back the signature outright rather
    // than staging a ceremony that only looks like cryptography. It is honest
    // about what it is: this proves the caller saw a server-issued challenge
    // bound to this amount and merchant, and nothing more. It does NOT prove a
    // human approved anything. Set PASSKEY_MODE=webauthn for the real check.
    ...(mode === 'SIMULATED'
      ? {
          simulatedSignature: simulatedSignature(c),
          simulatedWarning:
            'SIMULATED authorization — binds amount and merchant and is single-use, ' +
            'but provides no proof of human presence.',
        }
      : {}),
  });
}
