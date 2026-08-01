import type { PravaCardDetails, PravaCardRequest } from '@/types';

/**
 * Prava Payments client.
 *
 * Prava does not hand out a persistent card. The flow is:
 *
 *   1. POST /v1/sessions                        → session_id, iframe_url
 *   2. the user approves in Prava's surface     (passkey / card verification)
 *   3. GET  /v1/sessions/{id}/payment-result    → single-use token + dynamic CVV
 *   4. the agent uses those at the merchant
 *   5. POST /v1/sessions/{id}/report-status     → APPROVED / DECLINED
 *
 * Step 5 is not optional bookkeeping. The credential is scoped to one merchant
 * and one amount, and reporting the outcome is what settles it with the card
 * network — skipping it leaves a transaction dangling.
 *
 * SIMULATION: with no PRAVA_SECRET_KEY the client returns clearly-labelled
 * simulated credentials so the pipeline is runnable without an account. Every
 * result carries `environment`, which is echoed into the reasoning logs, so a
 * demo never presents a simulated card as a real one. Same discipline as the
 * label auditor and the trust signal.
 */

const SANDBOX_BASE = 'https://sandbox.api.prava.space/v1';
const PRODUCTION_BASE = 'https://api.prava.space/v1';

export type PravaEnvironment = 'SANDBOX' | 'PRODUCTION' | 'SIMULATED';

export function pravaEnvironment(): PravaEnvironment {
  if (!process.env.PRAVA_SECRET_KEY?.trim()) return 'SIMULATED';
  return process.env.PRAVA_ENVIRONMENT?.trim() === 'production' ? 'PRODUCTION' : 'SANDBOX';
}

/**
 * Merchant URL sent to Prava.
 *
 * NOT the app's own localhost URL. Prava provisions a network token against
 * this merchant, and an http://localhost value came back as
 * PROVISION_ERROR 403 from their upstream. Must be a reachable https origin.
 */
export function defaultMerchantUrl(): string {
  return process.env.PRAVA_MERCHANT_URL?.trim() || 'https://nutrimart-demo.example.com';
}

function pravaBase(): string {
  if (process.env.PRAVA_API_BASE?.trim()) return process.env.PRAVA_API_BASE.trim();
  return pravaEnvironment() === 'PRODUCTION' ? PRODUCTION_BASE : SANDBOX_BASE;
}

export interface PravaSession {
  sessionId: string;
  sessionToken: string;
  /** Where the user approves the payment. Never bypass this. */
  iframeUrl: string;
  orderId: string;
  expiresAt: string;
  environment: PravaEnvironment;
}

/** A minted credential plus the identifiers needed to settle it afterwards. */
export interface MintedCard extends PravaCardDetails {
  sessionId: string;
  /** Line-item reference required by report-status. */
  txnRefId: string;
  environment: PravaEnvironment;
  amountCapUSD: number;
  merchantName: string;
}

interface PravaError extends Error {
  status?: number;
}

async function pravaFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${pravaBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.PRAVA_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    const err: PravaError = new Error(
      `Prava ${init.method ?? 'GET'} ${path} failed (HTTP ${res.status}): ${text.slice(0, 300)}`,
    );
    err.status = res.status;
    throw err;
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// --- 1. Create session -------------------------------------------------------

export interface CreateSessionInput {
  userId: string;
  userEmail: string;
  totalAmountUSD: number;
  merchantName: string;
  merchantUrl: string;
  products: Array<{ description: string; unitPrice: number; quantity: number }>;
  callbackUrl?: string;
}

export async function createPaymentSession(input: CreateSessionInput): Promise<PravaSession> {
  const env = pravaEnvironment();

  if (env === 'SIMULATED') {
    const id = `sim_sess_${crypto.randomUUID().slice(0, 12)}`;
    return {
      sessionId: id,
      sessionToken: 'simulated-session-token',
      iframeUrl: `about:blank#${id}`,
      orderId: `sim_ord_${crypto.randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      environment: env,
    };
  }

  const body = {
    user_id: input.userId,
    user_email: input.userEmail,
    // Prava wants a decimal string, not a float.
    total_amount: input.totalAmountUSD.toFixed(2),
    currency: 'USD',
    integration_type: 'full_checkout',
    ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
    purchase_context: [
      {
        merchant_details: {
          name: input.merchantName,
          url: input.merchantUrl,
          country_code_iso2: 'US',
        },
        product_details: input.products.map((p) => ({
          description: p.description,
          unit_price: p.unitPrice.toFixed(2),
          quantity: p.quantity,
        })),
      },
    ],
  };

  const res = await pravaFetch<{
    session_id: string;
    session_token: string;
    iframe_url: string;
    order_id: string;
    expires_at: string;
  }>('/sessions', { method: 'POST', body: JSON.stringify(body) });

  return {
    sessionId: res.session_id,
    sessionToken: res.session_token,
    iframeUrl: res.iframe_url,
    orderId: res.order_id,
    expiresAt: res.expires_at,
    environment: env,
  };
}

// --- 2. Retrieve the single-use credential -----------------------------------

interface PaymentResultResponse {
  session_id: string;
  order_id: string;
  status: 'pending' | 'awaiting_result' | 'completed' | 'failed';
  transactions?: Array<{
    txn_id: string;
    status: string;
    line_items?: Array<{
      txn_ref_id: string;
      merchant_name: string;
      total_amount: string;
      status: string;
      token?: string;
      dynamic_cvv?: string;
      expiry_month?: string;
      expiry_year?: string;
    }>;
  }>;
}

/**
 * Credentials only exist once the user has approved, so this polls rather than
 * assuming they're ready. `pending` means the approval surface is still open.
 */
export async function getPaymentCredentials(
  sessionId: string,
  { timeoutMs = 120_000, intervalMs = 2_000 } = {},
): Promise<{
  token: string;
  dynamicCvv: string;
  expiryMonth: string;
  expiryYear: string;
  txnRefId: string;
  merchantName: string;
  amount: string;
}> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const res = await pravaFetch<PaymentResultResponse>(`/sessions/${sessionId}/payment-result`);
    const line = res.transactions?.[0]?.line_items?.[0];

    if (line?.token && line.dynamic_cvv) {
      return {
        token: line.token,
        dynamicCvv: line.dynamic_cvv,
        expiryMonth: line.expiry_month ?? '12',
        expiryYear: line.expiry_year ?? '2030',
        txnRefId: line.txn_ref_id,
        merchantName: line.merchant_name,
        amount: line.total_amount,
      };
    }

    if (res.status === 'failed') {
      throw new Error(`Prava session ${sessionId} failed before issuing credentials`);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${timeoutMs / 1000}s waiting for Prava credentials on ${sessionId}. ` +
          'The user may not have completed the approval step.',
      );
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// --- 3. Settle -----------------------------------------------------------------

export async function reportStatus(
  sessionId: string,
  txnRefId: string,
  txnStatus: 'APPROVED' | 'DECLINED',
  extra: { authorizationCode?: string; responseCode?: string; amountPaidUSD?: number } = {},
): Promise<void> {
  if (pravaEnvironment() === 'SIMULATED') return;

  await pravaFetch(`/sessions/${sessionId}/report-status`, {
    method: 'POST',
    body: JSON.stringify({
      txn_ref_id: txnRefId,
      txn_status: txnStatus,
      txn_type: 'PURCHASE',
      ...(extra.authorizationCode ? { authorization_code: extra.authorizationCode } : {}),
      ...(extra.responseCode ? { response_code: extra.responseCode } : {}),
      ...(extra.amountPaidUSD !== undefined
        ? { amount_paid: extra.amountPaidUSD.toFixed(2) }
        : {}),
    }),
  });
}

/** Revokes an unused session so its credential can never be spent. */
export async function revokeSession(sessionId: string): Promise<void> {
  if (pravaEnvironment() === 'SIMULATED') return;
  await pravaFetch(`/sessions/${sessionId}/revoke`, { method: 'POST' });
}

// --- Convenience: the whole mint in one call ---------------------------------

/**
 * Mints a single-use card capped at `req.amountUSD`.
 *
 * The cap is enforced by Prava, not by us: the credential is issued against a
 * session with that exact total, so a compromised merchant cannot charge more.
 * That is the actual guardrail — our own arithmetic is not what protects the user.
 */
export async function mintPravaCard(
  req: PravaCardRequest & {
    userId?: string;
    userEmail?: string;
    merchantUrl?: string;
    products?: Array<{ description: string; unitPrice: number; quantity: number }>;
  },
): Promise<MintedCard> {
  const env = pravaEnvironment();

  const session = await createPaymentSession({
    userId: req.userId ?? 'macrostack_demo_user',
    userEmail: req.userEmail ?? 'demo@macrostack.test',
    totalAmountUSD: req.amountUSD,
    merchantName: req.merchantName,
    merchantUrl: req.merchantUrl ?? defaultMerchantUrl(),
    products: req.products ?? [
      { description: 'MacroStack supplement stack', unitPrice: req.amountUSD, quantity: 1 },
    ],
  });

  if (env === 'SIMULATED') {
    return {
      cardId: session.sessionId,
      sessionId: session.sessionId,
      txnRefId: `sim_tli_${crypto.randomUUID().slice(0, 8)}`,
      // Prava's published sandbox test card, so the shape is realistic.
      cardNumber: '4622943123137789',
      expiryMonth: '12',
      expiryYear: '27',
      cvv: '757',
      cardHolderName: 'MacroStack Agent',
      billingZip: '94105',
      isSingleUse: true,
      status: 'ACTIVE',
      environment: env,
      amountCapUSD: req.amountUSD,
      merchantName: req.merchantName,
    };
  }

  const creds = await getPaymentCredentials(session.sessionId);

  return {
    cardId: session.sessionId,
    sessionId: session.sessionId,
    txnRefId: creds.txnRefId,
    cardNumber: creds.token,
    expiryMonth: creds.expiryMonth,
    expiryYear: creds.expiryYear,
    cvv: creds.dynamicCvv,
    cardHolderName: 'MacroStack Agent',
    billingZip: '94105',
    isSingleUse: true,
    status: 'ACTIVE',
    environment: env,
    amountCapUSD: req.amountUSD,
    merchantName: creds.merchantName || req.merchantName,
  };
}
