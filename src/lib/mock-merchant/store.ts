/**
 * In-memory cart/order store for the mock merchant.
 *
 * Deliberately not a database — this project has none, and the guide's own
 * reality check says adding one is out of scope for the hackathon demo. A
 * module-level Map survives fine for a single long-lived dev/demo server
 * process; it resets on restart, which is acceptable for a store nobody is
 * meant to persist across deploys.
 *
 * Only ever import this from Server Components, Server Actions, or Route
 * Handlers — never from client code.
 */

export interface CartLineItem {
  productId: string;
  subscribeAndSave: boolean;
}

export interface ShippingAddress {
  fullName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  email: string;
}

export interface OrderCard {
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

export interface OrderLineItem {
  productId: string;
  productName: string;
  brand: string;
  unitPriceUSD: number;
  subscribeAndSave: boolean;
  lineTotalUSD: number;
}

export interface RenewalAttempt {
  attemptedAt: string;
  outcome: 'APPROVED' | 'DECLINED';
  reason: string;
}

export interface MockOrder {
  id: string;
  createdAt: string;
  items: OrderLineItem[];
  totalUSD: number;
  shippingAddress: ShippingAddress;
  card: OrderCard;
  hasSubscription: boolean;
  renewalAttempts: RenewalAttempt[];
}

const carts = new Map<string, CartLineItem[]>();
const orders = new Map<string, MockOrder>();
/** Every card that has already been charged once. Prava mints these as
 *  single-use tokens, so a real second attempt against the card network
 *  would decline regardless of revocation — this mirrors that honestly. */
const redeemedCardFingerprints = new Set<string>();

function fingerprint(card: OrderCard): string {
  return `${card.cardNumber}|${card.expiryMonth}|${card.expiryYear}|${card.cvv}`;
}

export function getCart(cartId: string): CartLineItem[] {
  return carts.get(cartId) ?? [];
}

export function addToCart(cartId: string, item: CartLineItem): void {
  const existing = carts.get(cartId) ?? [];
  carts.set(cartId, [...existing.filter((i) => i.productId !== item.productId), item]);
}

export function clearCart(cartId: string): void {
  carts.delete(cartId);
}

export function createOrder(params: {
  items: OrderLineItem[];
  shippingAddress: ShippingAddress;
  card: OrderCard;
}): MockOrder {
  const id = `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const order: MockOrder = {
    id,
    createdAt: new Date().toISOString(),
    items: params.items,
    totalUSD: Number(params.items.reduce((s, i) => s + i.lineTotalUSD, 0).toFixed(2)),
    shippingAddress: params.shippingAddress,
    card: params.card,
    hasSubscription: params.items.some((i) => i.subscribeAndSave),
    renewalAttempts: [],
  };
  orders.set(id, order);
  redeemedCardFingerprints.add(fingerprint(params.card));
  return order;
}

export function getOrder(id: string): MockOrder | undefined {
  return orders.get(id);
}

/** Simulates a subscription renewal charge against the card used on the
 *  original order. Always declines once that card has been redeemed once,
 *  which — since checkout redeems it immediately — is every time. This is
 *  the "card dies before the subscription can renew" demo moment. */
export function attemptRenewal(orderId: string): RenewalAttempt {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Unknown order ${orderId}`);

  const attempt: RenewalAttempt = redeemedCardFingerprints.has(fingerprint(order.card))
    ? {
        attemptedAt: new Date().toISOString(),
        outcome: 'DECLINED',
        reason:
          'Card declined: this single-use token was already redeemed for the original order and cannot be charged again.',
      }
    : {
        attemptedAt: new Date().toISOString(),
        outcome: 'APPROVED',
        reason: 'Charged successfully.',
      };

  order.renewalAttempts.push(attempt);
  return attempt;
}
