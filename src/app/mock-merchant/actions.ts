'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { findCatalogEntryById } from '@/lib/agent/catalog';
import * as store from '@/lib/mock-merchant/store';

const CART_COOKIE = 'mm_cart_id';

async function getOrCreateCartId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CART_COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  cookieStore.set(CART_COOKIE, id, { path: '/', sameSite: 'lax' });
  return id;
}

export async function addToCartAction(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '');
  const entry = findCatalogEntryById(productId);
  if (!entry) throw new Error(`Unknown product "${productId}"`);

  const cartId = await getOrCreateCartId();
  store.addToCart(cartId, {
    productId,
    subscribeAndSave: formData.get('subscribeAndSave') === 'on',
  });

  redirect(`/mock-merchant/p/${productId}?added=1`);
}

export async function submitCheckoutAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;
  const cartItems = cartId ? store.getCart(cartId) : [];
  if (cartItems.length === 0) throw new Error('Cart is empty');

  const items = cartItems.map((line) => {
    const entry = findCatalogEntryById(line.productId);
    if (!entry) throw new Error(`Unknown product "${line.productId}"`);
    const unitPriceUSD = entry.totalPriceUSD;
    const lineTotalUSD = line.subscribeAndSave
      ? unitPriceUSD * (1 - entry.subscribeAndSaveDiscountPct / 100)
      : unitPriceUSD;
    return {
      productId: entry.id,
      productName: entry.productName,
      brand: entry.brand,
      unitPriceUSD,
      subscribeAndSave: line.subscribeAndSave,
      lineTotalUSD: Number(lineTotalUSD.toFixed(2)),
    };
  });

  const shippingAddress = {
    fullName: String(formData.get('fullName') ?? ''),
    streetAddress: String(formData.get('streetAddress') ?? ''),
    city: String(formData.get('city') ?? ''),
    state: String(formData.get('state') ?? ''),
    zipCode: String(formData.get('zipCode') ?? ''),
    email: String(formData.get('email') ?? ''),
  };
  const card = {
    cardNumber: String(formData.get('cardNumber') ?? ''),
    expiryMonth: String(formData.get('expiryMonth') ?? ''),
    expiryYear: String(formData.get('expiryYear') ?? ''),
    cvv: String(formData.get('cvv') ?? ''),
  };

  if (!shippingAddress.fullName || !shippingAddress.streetAddress || !card.cardNumber || !card.cvv) {
    throw new Error('Missing required checkout fields');
  }

  const order = store.createOrder({ items, shippingAddress, card });
  if (cartId) store.clearCart(cartId);

  redirect(`/mock-merchant/order/${order.id}`);
}

export async function attemptRenewalAction(orderId: string): Promise<void> {
  store.attemptRenewal(orderId);
  redirect(`/mock-merchant/order/${orderId}`);
}
