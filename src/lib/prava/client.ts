import type { CheckoutExecutionPayload, CheckoutResult, AgentReasoningLog } from '@/types';

/** Browser client for the Prava + checkout endpoints. */

export interface MintedCardClient {
  cardId: string;
  sessionId: string;
  txnRefId: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cardHolderName: string;
  billingZip: string;
  isSingleUse: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'BLOCKED';
  environment: 'SANDBOX' | 'PRODUCTION' | 'SIMULATED';
  amountCapUSD: number;
  merchantName: string;
}

async function readError(res: Response): Promise<string> {
  try {
    const b = await res.json();
    return b?.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Authorizes and mints in one call: fetch a server-issued challenge bound to
 * this amount and merchant, then exchange it for a single-use credential.
 */
export interface AuthorizeResult {
  /** Present immediately in simulated mode. */
  card?: MintedCardClient;
  /** Present when Prava needs the user to approve at their hosted surface. */
  session?: { sessionId: string; iframeUrl: string; environment: string };
  needsApproval: boolean;
  passkeyMode: string;
  simulatedWarning?: string;
}

export async function authorizeAndMintCard(
  amountUSD: number,
  merchantName: string,
  products?: Array<{ description: string; unitPrice: number; quantity: number }>,
): Promise<AuthorizeResult> {
  const chRes = await fetch('/api/prava/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountUSD, merchantName }),
  });
  if (!chRes.ok) throw new Error(await readError(chRes));
  const challenge = await chRes.json();

  if (challenge.mode !== 'SIMULATED' && !challenge.simulatedSignature) {
    throw new Error(
      'PASSKEY_MODE=webauthn requires a registered credential and a real assertion. ' +
        'Unset PASSKEY_MODE to use simulated authorization.',
    );
  }

  const mintRes = await fetch('/api/prava/mint-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amountUSD,
      merchantName,
      challengeId: challenge.challengeId,
      userPasskeySignature: challenge.simulatedSignature,
      products,
    }),
  });
  if (!mintRes.ok) throw new Error(await readError(mintRes));

  const body = await mintRes.json();
  return {
    card: body.card,
    session: body.session,
    needsApproval: Boolean(body.needsApproval),
    passkeyMode: challenge.mode,
    simulatedWarning: challenge.simulatedWarning,
  };
}

/**
 * Waits for the user to finish approving at Prava, then returns the single-use
 * credential. Polls because the credential only materialises after approval.
 */
export async function pollForCard(
  sessionId: string,
  { timeoutMs = 90_000, intervalMs = 3_000, onWait, degradeOnTimeout = true, amountUSD = 0 }: {
    amountUSD?: number;
    timeoutMs?: number;
    intervalMs?: number;
    onWait?: (elapsedMs: number) => void;
    /** After the timeout, continue with a labelled simulated credential rather
     *  than failing. Lets the rest of the pipeline be exercised when Prava's
     *  sandbox is unavailable — which it frequently has been. */
    degradeOnTimeout?: boolean;
  } = {},
): Promise<MintedCardClient> {
  const started = Date.now();

  for (;;) {
    // The server does the waiting (and the degrading), so a suspended tab
    // cannot strand the flow. The client still loops so it can report progress.
    const remaining = Math.max(0, Math.ceil((timeoutMs - (Date.now() - started)) / 1000));
    const wait = degradeOnTimeout ? Math.min(remaining, 25) : 0;

    const res = await fetch(
      `/api/prava/mint-card?sessionId=${encodeURIComponent(sessionId)}` +
        (wait > 0 ? `&wait=${wait}` : '') +
        (amountUSD > 0 ? `&amount=${amountUSD}` : ''),
    );
    const body = await res.json();

    if (body.ready && body.card) return body.card as MintedCardClient;
    if (body.error) throw new Error(body.error);

    if (Date.now() - started > timeoutMs) {
      if (!degradeOnTimeout) {
        throw new Error('Timed out waiting for approval in the Prava window.');
      }
      const degraded = await fetch(
        `/api/prava/mint-card?sessionId=${encodeURIComponent(sessionId)}&degrade=1`,
      );
      const body = await degraded.json();
      if (body?.card) return body.card as MintedCardClient;
      throw new Error('Timed out waiting for approval, and no fallback was available.');
    }
    onWait?.(Date.now() - started);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export interface CheckoutHandlers {
  onLog?: (log: AgentReasoningLog) => void;
  onResult?: (result: CheckoutResult) => void;
  onError?: (message: string) => void;
}

/** Streams the Playwright checkout, emitting progress as it happens. */
export async function executeCheckout(
  payload: CheckoutExecutionPayload,
  handlers: CheckoutHandlers = {},
): Promise<CheckoutResult | undefined> {
  const res = await fetch('/api/checkout/execute?stream=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  if (!res.body) throw new Error('Checkout stream had no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: CheckoutResult | undefined;

  const dispatch = (frame: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (!data.length) return;
    const payloadObj = JSON.parse(data.join('\n'));
    if (event === 'log') handlers.onLog?.(payloadObj as AgentReasoningLog);
    else if (event === 'result') {
      final = payloadObj as CheckoutResult;
      handlers.onResult?.(final);
    } else if (event === 'error') handlers.onError?.(payloadObj?.message ?? 'Checkout failed');
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (frame.trim()) dispatch(frame);
    }
  }
  if (buffer.trim()) dispatch(buffer);
  return final;
}
