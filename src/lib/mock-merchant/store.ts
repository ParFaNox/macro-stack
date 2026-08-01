/**
 * Mock merchant order book.
 *
 * The store exists because our catalog products are synthetic — there is no real
 * Shopify listing to check out against. Everything Prava does is real; the shop
 * is the part we simulate, and it is labelled as such on every page.
 *
 * It also lets us demonstrate the claim the whole product rests on: after
 * checkout the card is dead, so when the subscription tries to renew, the charge
 * *fails*. That is testable here and impossible to show against a real merchant
 * inside a hackathon.
 *
 * In-memory and single-process. Fine for a demo; a real deployment needs a
 * database.
 */

export interface MockOrder {
  orderId: string;
  merchantName: string;
  productName: string;
  unitPriceUSD: number;
  quantity: number;
  subscribeAndSave: boolean;
  discountPct: number;
  totalChargedUSD: number;
  /** Last 4 of the card used, so a renewal attempt can be matched to it. */
  cardLast4: string;
  /** Full number kept only to simulate the renewal attempt. Never displayed. */
  cardNumber: string;
  email: string;
  shippingName: string;
  placedAt: string;
  /** Subscription renewal attempts made against this order. */
  renewals: Array<{ attemptedAt: string; success: boolean; reason: string }>;
}

/**
 * Pinned to globalThis, not module scope.
 *
 * Next.js recompiles route modules independently in dev, and each recompile
 * gets a fresh module instance. With plain module-level state the order placed
 * by POST /api/mock-merchant/order was invisible to GET on the confirmation
 * page, and the revoked-card set was empty when the renewal job checked it —
 * so the auto-renewal shield silently did nothing. Both symptoms, one cause.
 */
interface MockMerchantState {
  orders: Map<string, MockOrder>;
  revokedCards: Set<string>;
}

const globalRef = globalThis as typeof globalThis & { __macrostackMerchant?: MockMerchantState };

const state: MockMerchantState = (globalRef.__macrostackMerchant ??= {
  orders: new Map<string, MockOrder>(),
  revokedCards: new Set<string>(),
});

const orders = state.orders;
const revokedCards = state.revokedCards;

export function createOrder(o: Omit<MockOrder, 'orderId' | 'placedAt' | 'renewals'>): MockOrder {
  const orderId = `MS-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  const order: MockOrder = {
    ...o,
    orderId,
    placedAt: new Date().toISOString(),
    renewals: [],
  };
  orders.set(orderId, order);
  return order;
}

export function getOrder(orderId: string): MockOrder | undefined {
  return orders.get(orderId);
}

export function listOrders(): MockOrder[] {
  return [...orders.values()].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

export function revokeCard(cardNumber: string): void {
  revokedCards.add(cardNumber);
}

export function isCardRevoked(cardNumber: string): boolean {
  return revokedCards.has(cardNumber);
}

/**
 * Simulates the merchant's recurring-billing job charging the saved card.
 *
 * This is the proof, not a flourish: a subscribe-and-save order would normally
 * bill again next month. Because the agent retired the credential immediately
 * after checkout, the charge is declined.
 */
export function attemptRenewal(orderId: string): {
  success: boolean;
  reason: string;
  order?: MockOrder;
} {
  const order = orders.get(orderId);
  if (!order) return { success: false, reason: `No order ${orderId}` };

  if (!order.subscribeAndSave) {
    const reason = 'Order is not a subscription — no renewal attempted.';
    order.renewals.push({ attemptedAt: new Date().toISOString(), success: false, reason });
    return { success: false, reason, order };
  }

  const revoked = isCardRevoked(order.cardNumber);
  const reason = revoked
    ? `Declined — card ••••${order.cardLast4} is single-use and was retired after the original purchase.`
    : `Charged $${order.totalChargedUSD.toFixed(2)} to ••••${order.cardLast4} for the next cycle.`;

  order.renewals.push({ attemptedAt: new Date().toISOString(), success: !revoked, reason });
  return { success: !revoked, reason, order };
}

export function resetStore(): void {
  orders.clear();
  revokedCards.clear();
}
