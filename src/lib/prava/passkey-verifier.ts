import crypto from 'node:crypto';

/**
 * Passkey authorization guardrail.
 *
 * This is the check that makes an autonomous purchasing agent safe: no card is
 * minted unless the human cryptographically approved *this* amount at *this*
 * merchant. It has to run server-side. A client that can skip the check is not
 * a guardrail, it is decoration.
 *
 * Two modes, and the distinction is reported honestly rather than blurred:
 *
 *   WEBAUTHN   A real WebAuthn assertion. The browser signs a server-issued
 *              challenge with a private key held in the device's secure
 *              enclave, and we verify the signature against the registered
 *              public key.
 *
 *   SIMULATED  No registered credential (nobody has enrolled a passkey on this
 *              demo instance). The signature is an HMAC over the same challenge
 *              payload using a server secret. This still proves the request came
 *              from a flow that saw the server's challenge — it does NOT prove a
 *              human touched a fingerprint sensor. Never describe it as if it did.
 *
 * Challenges are single-use and time-bound in both modes, so a captured
 * authorization cannot be replayed against a second purchase.
 */

export type PasskeyMode = 'WEBAUTHN' | 'SIMULATED';

export function passkeyMode(): PasskeyMode {
  return process.env.PASSKEY_MODE?.trim() === 'webauthn' ? 'WEBAUTHN' : 'SIMULATED';
}

const CHALLENGE_TTL_MS = 5 * 60_000;

export interface AuthorizationChallenge {
  challengeId: string;
  /** Base64url random bytes the client must sign. */
  challenge: string;
  /** Bound into the challenge so an approval for $40 can't authorize $400. */
  amountUSD: number;
  merchantName: string;
  expiresAt: number;
}

/**
 * In-memory challenge store.
 *
 * Single-process only. A multi-instance deployment needs Redis or a database —
 * flagged rather than papered over, because a challenge store that silently
 * misses on another instance would fail open into "authorization not found",
 * which is at least the safe direction.
 */
const challenges = new Map<string, AuthorizationChallenge>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, c] of challenges) {
    if (c.expiresAt < now) challenges.delete(id);
  }
}

/** Issues a challenge bound to a specific amount and merchant. */
export function createAuthorizationChallenge(
  amountUSD: number,
  merchantName: string,
): AuthorizationChallenge {
  sweepExpired();

  const challenge: AuthorizationChallenge = {
    challengeId: crypto.randomUUID(),
    challenge: crypto.randomBytes(32).toString('base64url'),
    amountUSD,
    merchantName,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };

  challenges.set(challenge.challengeId, challenge);
  return challenge;
}

/** The exact bytes an approval covers. Amount and merchant are inside it, so a
 *  signature cannot be lifted onto a different purchase. */
function signingPayload(c: AuthorizationChallenge): string {
  return `${c.challenge}|${c.amountUSD.toFixed(2)}|${c.merchantName}`;
}

function simulationSecret(): string {
  return process.env.PASSKEY_SIM_SECRET?.trim() || 'macrostack-dev-passkey-secret';
}

/** What the simulated client is expected to produce. Exported so the browser
 *  helper and the verifier can never drift apart. */
export function simulatedSignature(c: AuthorizationChallenge): string {
  return crypto.createHmac('sha256', simulationSecret()).update(signingPayload(c)).digest('base64url');
}

export interface VerificationResult {
  valid: boolean;
  mode: PasskeyMode;
  reason?: string;
  amountUSD?: number;
  merchantName?: string;
}

/**
 * Verifies an authorization and consumes the challenge.
 *
 * The challenge is deleted on *every* path, valid or not, so a failed attempt
 * cannot be retried against the same challenge until one signature sticks.
 */
export function verifyPasskeyAuthorization(
  challengeId: string,
  signature: string,
  expected: { amountUSD: number; merchantName: string },
): VerificationResult {
  const mode = passkeyMode();
  sweepExpired();

  const challenge = challenges.get(challengeId);
  challenges.delete(challengeId);

  if (!challenge) {
    return { valid: false, mode, reason: 'Unknown, expired, or already-used authorization challenge' };
  }
  if (challenge.expiresAt < Date.now()) {
    return { valid: false, mode, reason: 'Authorization challenge expired' };
  }

  // Re-check the bound values even though they're inside the signature: it
  // turns a subtle signature mismatch into a clear, debuggable message.
  if (Math.abs(challenge.amountUSD - expected.amountUSD) > 0.005) {
    return {
      valid: false,
      mode,
      reason: `Authorization was for $${challenge.amountUSD.toFixed(2)} but the charge is $${expected.amountUSD.toFixed(2)}`,
    };
  }
  if (challenge.merchantName !== expected.merchantName) {
    return {
      valid: false,
      mode,
      reason: `Authorization was for "${challenge.merchantName}" but the charge is for "${expected.merchantName}"`,
    };
  }

  if (mode === 'WEBAUTHN') {
    // Deliberately not faked. Wiring this needs a registered credential and a
    // real assertion check (signature over authenticatorData||clientDataHash,
    // plus origin and sign-count validation) — see @simplewebauthn/server.
    // Returning invalid is the safe failure: no card is minted.
    return {
      valid: false,
      mode,
      reason:
        'PASSKEY_MODE=webauthn is set but no credential registry is wired yet. ' +
        'Register a passkey and verify the assertion server-side, or unset PASSKEY_MODE to use simulated mode.',
    };
  }

  const expectedSig = simulatedSignature(challenge);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  return valid
    ? { valid: true, mode, amountUSD: challenge.amountUSD, merchantName: challenge.merchantName }
    : { valid: false, mode, reason: 'Signature did not match the issued challenge' };
}
