/**
 * Thin wrapper around Prava's sandbox REST API.
 *
 * Endpoint shapes below are taken from Prava's live OpenAPI spec
 * (docs.prava.space/api-reference/openapi.json), not the original task plan —
 * a couple of field names in that plan (e.g. `PRAVA_API_KEY`) were stale.
 *
 * Important: card capture and passkey/OTP verification happen inside Prava's
 * own hosted iframe (`iframe_url` from `createSession`), not in this module.
 * There is no WebAuthn signature for us to verify server-side — Prava handles
 * device binding and issuer OTP internally and only hands back a single-use
 * card token once that's done. This module only calls the REST side: create a
 * session, poll for the resulting token, report the outcome, revoke.
 */

const DEFAULT_API_BASE = 'https://sandbox.api.prava.space';

function apiBase(): string {
  return process.env.PRAVA_API_BASE?.trim() || DEFAULT_API_BASE;
}

function secretKey(): string {
  const key = process.env.PRAVA_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      'PRAVA_SECRET_KEY is not set. Add it to .env.local (sandbox key from dashboard.prava.space).',
    );
  }
  return key;
}

async function pravaFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey()}`,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Prava API ${init.method ?? 'GET'} ${path} failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

// --- Create session ---------------------------------------------------

export interface PravaMerchantDetails {
  name: string;
  /** Must be https — forwarded to Visa. */
  url: string;
  countryCodeIso2: string;
}

export interface PravaProductDetail {
  description: string;
  /** Decimal string, e.g. "39.99". */
  unitPriceUSD: string;
  productId?: string;
  quantity?: number;
}

export interface CreateSessionParams {
  userId: string;
  userEmail: string;
  /** Decimal string, e.g. "89.97". This is the hard cap on the resulting card. */
  totalAmountUSD: string;
  currency?: string;
  merchant: PravaMerchantDetails;
  products: PravaProductDetail[];
  userPhone?: string;
  userCountryCodeIso2?: string;
  externalOrderRef?: string;
  description?: string;
  /** Minutes the session stays valid for. Defaults to 15 on Prava's side. */
  effectiveUntilMinutes?: number;
}

export interface CreateSessionResult {
  sessionId: string;
  sessionToken: string;
  iframeUrl: string;
  orderId: string;
  expiresAt: string;
}

export async function createSession(params: CreateSessionParams): Promise<CreateSessionResult> {
  const body = {
    user_id: params.userId,
    user_email: params.userEmail,
    total_amount: params.totalAmountUSD,
    currency: params.currency ?? 'USD',
    purchase_context: [
      {
        merchant_details: {
          name: params.merchant.name,
          url: params.merchant.url,
          country_code_iso2: params.merchant.countryCodeIso2,
        },
        product_details: params.products.map((p) => ({
          description: p.description,
          unit_price: p.unitPriceUSD,
          ...(p.productId ? { product_id: p.productId } : {}),
          ...(p.quantity !== undefined ? { quantity: p.quantity } : {}),
        })),
        ...(params.effectiveUntilMinutes !== undefined
          ? { effective_until_minutes: params.effectiveUntilMinutes }
          : {}),
      },
    ],
    ...(params.userPhone ? { user_phone: params.userPhone } : {}),
    ...(params.userCountryCodeIso2 ? { user_country_code_iso2: params.userCountryCodeIso2 } : {}),
    ...(params.externalOrderRef ? { external_order_ref: params.externalOrderRef } : {}),
    ...(params.description ? { description: params.description } : {}),
  };

  const res = await pravaFetch<{
    session_id: string;
    session_token: string;
    iframe_url: string;
    order_id: string;
    expires_at: string;
  }>('/v1/sessions', { method: 'POST', body: JSON.stringify(body) });

  return {
    sessionId: res.session_id,
    sessionToken: res.session_token,
    iframeUrl: res.iframe_url,
    orderId: res.order_id,
    expiresAt: res.expires_at,
  };
}

// --- Payment result -----------------------------------------------------

export type PravaSessionStatus = 'pending' | 'processing' | 'awaiting_result' | 'completed' | 'failed';
export type PravaTxnStatus = 'pending' | 'awaiting_result' | 'completed' | 'failed';

export interface PravaTransactionLineItem {
  txnRefId: string;
  /** Single-use virtual card token. Populated once status is 'awaiting_result'. */
  token: string | null;
  /** Single-use CVV paired with `token`. */
  dynamicCvv: string | null;
  expiryMonth: string | null;
  expiryYear: string | null;
  totalAmountUSD: string;
  merchantName: string;
  merchantUrl: string;
}

export interface PravaTransaction {
  txnId: string;
  status: PravaTxnStatus;
  lineItems: PravaTransactionLineItem[];
}

export interface PaymentResult {
  sessionId: string;
  orderId: string | null;
  status: PravaSessionStatus;
  transactions: PravaTransaction[];
}

export async function getPaymentResult(sessionId: string): Promise<PaymentResult> {
  const res = await pravaFetch<{
    session_id: string;
    order_id: string | null;
    status: PravaSessionStatus;
    transactions: Array<{
      txn_id: string;
      status: PravaTxnStatus;
      line_items: Array<{
        txn_ref_id: string;
        token: string | null;
        dynamic_cvv: string | null;
        expiry_month: string | null;
        expiry_year: string | null;
        total_amount: string;
        merchant_name: string;
        merchant_url: string;
      }>;
    }>;
  }>(`/v1/sessions/${sessionId}/payment-result`);

  return {
    sessionId: res.session_id,
    orderId: res.order_id,
    status: res.status,
    transactions: res.transactions.map((t) => ({
      txnId: t.txn_id,
      status: t.status,
      lineItems: t.line_items.map((li) => ({
        txnRefId: li.txn_ref_id,
        token: li.token,
        dynamicCvv: li.dynamic_cvv,
        expiryMonth: li.expiry_month,
        expiryYear: li.expiry_year,
        totalAmountUSD: li.total_amount,
        merchantName: li.merchant_name,
        merchantUrl: li.merchant_url,
      })),
    })),
  };
}

/**
 * Poll `getPaymentResult` until the card token is ready (status
 * 'awaiting_result' with a populated token) or a terminal/failed state is
 * reached. The user is completing passkey/OTP verification inside Prava's
 * iframe during this window, so this is expected to take several seconds.
 */
export async function waitForCardToken(
  sessionId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<PaymentResult> {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const result = await getPaymentResult(sessionId);
    const hasToken = result.transactions.some((t) => t.lineItems.some((li) => li.token));
    if (hasToken || result.status === 'failed' || result.status === 'completed') {
      return result;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for Prava session ${sessionId} to produce a card token`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// --- Report status --------------------------------------------------------

export interface ReportStatusParams {
  sessionId: string;
  txnRefId: string;
  outcome: 'APPROVED' | 'DECLINED';
  authorizationCode?: string;
  responseCode?: string;
  amountPaidUSD?: string;
}

export interface ReportStatusResult {
  status: 'confirmed';
  txnRefId: string;
  txnStatus: 'APPROVED' | 'DECLINED';
  visaConfirmation: 'SUCCESS' | 'FAILURE';
}

export async function reportStatus(params: ReportStatusParams): Promise<ReportStatusResult> {
  const body = {
    txn_ref_id: params.txnRefId,
    txn_status: params.outcome,
    txn_type: 'PURCHASE',
    ...(params.authorizationCode ? { authorization_code: params.authorizationCode } : {}),
    ...(params.responseCode ? { response_code: params.responseCode } : {}),
    ...(params.amountPaidUSD ? { amount_paid: params.amountPaidUSD } : {}),
  };

  const res = await pravaFetch<{
    status: 'confirmed';
    txn_ref_id: string;
    txn_status: 'APPROVED' | 'DECLINED';
    visa_confirmation: 'SUCCESS' | 'FAILURE';
  }>(`/v1/sessions/${params.sessionId}/report-status`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    status: res.status,
    txnRefId: res.txn_ref_id,
    txnStatus: res.txn_status,
    visaConfirmation: res.visa_confirmation,
  };
}

// --- Revoke ---------------------------------------------------------------

/** Kills the session/card. Immediate and irreversible — this is "expire the card". */
export async function revokeSession(sessionId: string): Promise<{ success: boolean }> {
  // Prava rejects a POST with Content-Type: application/json and a truly
  // empty body (FST_ERR_CTP_EMPTY_JSON_BODY) — send an empty object instead.
  return pravaFetch<{ success: boolean }>(`/v1/sessions/${sessionId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
