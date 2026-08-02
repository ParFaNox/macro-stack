import {
  checkAgentLink,
  signRequest,
  startAgentLink,
  type AgentDescriptor,
  type AgentIdentity,
  type IdentityStore,
} from './identity';
import { MemoryIdentityStore } from './identity';

/**
 * Prava adapter.
 *
 * One class covering the whole agentic-commerce loop: link an agent identity,
 * discover products, create a purchase session, wait for the human to approve,
 * receive a single-use capped card, report the outcome back.
 *
 * Every value that has bitten us in production is configurable and validated,
 * because Prava's failures surface as opaque 400s that point somewhere other
 * than the actual cause. See the README's "Failure modes" section.
 */

export interface PravaAdapterOptions {
  /** Sandbox or production secret key. Omit for discovery-only usage. */
  secretKey?: string;
  /** Where the agent identity is persisted. Defaults to memory. */
  store?: IdentityStore;
  /** How this agent presents itself on the approval screen. */
  agent?: Partial<AgentDescriptor>;
  /**
   * Buyer email sent to Prava. MUST be real and routable — reserved TLDs are
   * rejected by Visa's attestation as `badRequest`, and the failure appears
   * during passkey registration with no hint at the cause.
   */
  userEmail?: string;
  userId?: string;
  apiBase?: string;
  agentApiUrl?: string;
  walletApiUrl?: string;
  dashboardUrl?: string;
}

export interface ProductHit {
  productId?: string;
  title: string;
  merchant: string;
  priceUSD: number;
  imageUrl?: string;
  /** The merchant's own storefront search for this product. */
  url: string;
}

export interface PurchaseSession {
  sessionId: string;
  orderId: string;
  /** Open this in a browser; the human approves and completes the passkey. */
  approvalUrl: string;
  expiresAt?: string;
}

export interface IssuedCard {
  /** Network token — use as the card number at checkout. */
  token: string;
  /** Dynamic cryptogram — use as the CVV. */
  cryptogram: string;
  expiryMonth: string;
  expiryYear: string;
  amountCapUSD: number;
  sessionId: string;
  txnRefId: string;
}

const RESERVED_HOST = /\.(test|example|invalid|localhost)$|(^|\.)example\.(com|org|net)$/i;

export class PravaAdapter {
  private readonly secretKey?: string;
  private readonly store: IdentityStore;
  private readonly descriptor: AgentDescriptor;
  private readonly userEmail: string;
  private readonly userId: string;
  private readonly apiBase: string;
  private readonly agentApiUrl: string;
  private readonly walletApiUrl: string;
  private readonly dashboardUrl: string;

  constructor(options: PravaAdapterOptions = {}) {
    this.secretKey = options.secretKey;
    this.store = options.store ?? new MemoryIdentityStore();
    this.descriptor = {
      name: options.agent?.name ?? 'Agent',
      platform: options.agent?.platform ?? 'node',
      description: options.agent?.description ?? 'Autonomous buying agent',
    };
    this.userEmail = options.userEmail ?? '';
    this.userId = options.userId ?? 'agent_user';
    this.apiBase = options.apiBase ?? 'https://sandbox.api.prava.space/v1';
    this.agentApiUrl = options.agentApiUrl ?? 'https://api.prava.space';
    this.walletApiUrl = options.walletApiUrl ?? 'https://pay-api.prava.space';
    this.dashboardUrl = options.dashboardUrl ?? 'https://pay.prava.space';
  }

  // --- Agent identity --------------------------------------------------------

  /** Returns a URL a human must open and approve. Expires in ~15 minutes. */
  async link(): Promise<{ linkUrl: string; linkId: string }> {
    return startAgentLink(this.store, this.descriptor, this.agentApiUrl, this.dashboardUrl);
  }

  /** Has the human approved yet? Safe to poll. */
  async linkStatus(): Promise<AgentIdentity | null> {
    return checkAgentLink(this.store, this.agentApiUrl);
  }

  async isLinked(): Promise<boolean> {
    const agent = await this.store.load();
    return Boolean(agent?.linked && agent.agentId);
  }

  // --- Product discovery -----------------------------------------------------

  /**
   * Searches real merchants. Requires a linked agent, not a secret key —
   * discovery is authenticated by agent signature.
   */
  async search(query: string, limit = 10): Promise<ProductHit[]> {
    const res = await this.walletPost<{
      data?: {
        results?: Array<{
          product_id?: string;
          merchant?: string;
          title?: string;
          price_estimate?: { amount?: string };
          image_url?: string;
        }>;
      };
    }>('/v1/wallet/shop/search', { query, limit: Math.min(limit, 20) });

    return (res.data?.results ?? [])
      .filter((r) => r.title && r.merchant)
      .map((r) => {
        const domain = (r.merchant ?? '').replace(/\.myshopify\.com$/, '.com');
        return {
          productId: r.product_id,
          title: r.title ?? '',
          merchant: domain,
          priceUSD: Number(r.price_estimate?.amount ?? 0),
          imageUrl: r.image_url,
          url: `https://${domain}/search?q=${encodeURIComponent(r.title ?? '')}`,
        };
      })
      .filter((p) => p.priceUSD > 0);
  }

  /** Variants, images and description for one product. */
  async product(productId: string, merchant: string): Promise<unknown> {
    return this.walletPost('/v1/wallet/shop/product', { product_id: productId, merchant }, 8_000);
  }

  private async walletPost<T>(
    path: string,
    body: Record<string, unknown>,
    timeoutMs = 20_000,
  ): Promise<T> {
    const agent = await this.store.load();
    if (!agent?.linked || !agent.agentId) {
      throw new Error('Agent is not linked. Call link(), have a human approve, then retry.');
    }

    // The signature covers the exact bytes sent, so the body is stringified
    // once and reused — re-serialising could reorder keys and invalidate it.
    const payload = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.walletApiUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Skill-Name': 'prava-shopping',
          'X-Agent-Id': agent.agentId,
          'X-Timestamp': timestamp,
          'X-Signature': signRequest(agent.privateKey, timestamp, payload),
        },
        body: payload,
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message ?? `Prava ${path} failed (${res.status})`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Payment ---------------------------------------------------------------

  /**
   * Creates a purchase session for one specific basket.
   *
   * `merchantUrl` must be a real, resolvable https origin: Visa issues a
   * credential scoped to a merchant, so a reserved domain fails at credential
   * issuance with `FETCH_AGENTIC_CREDS_ERROR`, several steps after the input
   * that caused it. We validate rather than let you discover that at 2am.
   */
  async createSession(input: {
    totalUSD: number;
    merchantName: string;
    merchantUrl: string;
    products: Array<{ description: string; unitPriceUSD: number; quantity?: number }>;
    merchantCountry?: string;
  }): Promise<PurchaseSession> {
    this.requireSecret();
    this.assertRoutableEmail();

    const host = new URL(input.merchantUrl).hostname;
    if (!input.merchantUrl.startsWith('https://') || RESERVED_HOST.test(host)) {
      throw new Error(
        `merchantUrl must be a real https origin — "${input.merchantUrl}" is reserved or ` +
          'insecure, and Visa will reject the credential request for it.',
      );
    }

    const res = await fetch(`${this.apiBase}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: this.userId,
        user_email: this.userEmail,
        total_amount: input.totalUSD.toFixed(2),
        currency: 'USD',
        purchase_context: [
          {
            merchant_details: {
              name: input.merchantName,
              url: input.merchantUrl,
              country_code_iso2: input.merchantCountry ?? 'US',
            },
            product_details: input.products.map((p) => ({
              description: p.description,
              unit_price: p.unitPriceUSD.toFixed(2),
              quantity: p.quantity ?? 1,
            })),
          },
        ],
      }),
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Prava session create failed (${res.status}): ${JSON.stringify(body)}`);
    }

    const sessionId = String(body.session_id ?? body.id ?? '');
    return {
      sessionId,
      orderId: String(body.order_id ?? ''),
      approvalUrl: `https://sandbox.collect.prava.space?session=${sessionId}`,
      expiresAt: body.expires_at ? String(body.expires_at) : undefined,
    };
  }

  /** Current state of a session, including any issued credential. */
  async paymentResult(sessionId: string): Promise<Record<string, unknown>> {
    this.requireSecret();
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/payment-result`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }

  /**
   * Polls until the human approves and a card is issued.
   *
   * Resolves to null on timeout rather than throwing, so a caller can degrade
   * to a labelled simulation instead of stranding the purchase — a human who
   * walked away should not hang your agent.
   */
  async waitForCard(
    sessionId: string,
    { timeoutMs = 180_000, intervalMs = 4_000 } = {},
  ): Promise<IssuedCard | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.paymentResult(sessionId);
      const txns = (result.transactions ?? []) as Array<{
        error?: { code?: string; message?: string };
        line_items?: Array<{
          txn_ref_id?: string;
          token?: string | null;
          dynamic_cvv?: string | null;
          expiry_month?: number | string;
          expiry_year?: number | string;
          total_amount?: string;
        }>;
      }>;

      for (const txn of txns) {
        if (txn.error) {
          throw new Error(`${txn.error.code ?? 'PRAVA_ERROR'}: ${txn.error.message ?? ''}`.trim());
        }
        for (const li of txn.line_items ?? []) {
          if (li.token && li.dynamic_cvv) {
            return {
              token: li.token,
              cryptogram: String(li.dynamic_cvv),
              expiryMonth: String(li.expiry_month ?? '').padStart(2, '0'),
              expiryYear: String(li.expiry_year ?? ''),
              amountCapUSD: Number(li.total_amount ?? 0),
              sessionId,
              txnRefId: String(li.txn_ref_id ?? ''),
            };
          }
        }
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  /** Tell Prava how the purchase went. Required to close out a session. */
  async reportStatus(
    sessionId: string,
    txnRefId: string,
    status: 'success' | 'failed',
    detail?: string,
  ): Promise<void> {
    this.requireSecret();
    await fetch(`${this.apiBase}/sessions/${sessionId}/report-status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        line_items: [{ txn_ref_id: txnRefId, status, ...(detail ? { detail } : {}) }],
      }),
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.requireSecret();
    await fetch(`${this.apiBase}/sessions/${sessionId}/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
  }

  // --- Guards ----------------------------------------------------------------

  private requireSecret(): void {
    if (!this.secretKey) {
      throw new Error('secretKey is required for payment operations. Discovery does not need one.');
    }
  }

  /**
   * A reserved-TLD address is rejected by Visa's attestation as `badRequest`,
   * and the failure surfaces during passkey registration — no prompt ever
   * appears, which looks like a browser problem and is not one.
   */
  private assertRoutableEmail(): void {
    const email = this.userEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
      throw new Error('userEmail must be a valid address — Visa attestation rejects malformed ones.');
    }
    if (RESERVED_HOST.test(email.split('@')[1] ?? '')) {
      throw new Error(
        `userEmail "${email}" uses a reserved domain (RFC 2606). It can never resolve, and ` +
          'Visa rejects it during passkey attestation with an opaque 400.',
      );
    }
  }
}
