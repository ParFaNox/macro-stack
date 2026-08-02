import { cookies } from 'next/headers';

import { findCatalogEntryById } from '@/lib/agent/catalog';
import * as store from '@/lib/mock-merchant/store';
import { submitCheckoutAction } from '../actions';

const inputClass = 'w-full border border-slate-300 rounded-md px-3 py-2 text-sm';

export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const cartId = cookieStore.get('mm_cart_id')?.value;
  const cartItems = cartId ? store.getCart(cartId) : [];

  const lines = cartItems
    .map((line) => {
      const entry = findCatalogEntryById(line.productId);
      if (!entry) return null;
      const lineTotalUSD = line.subscribeAndSave
        ? entry.totalPriceUSD * (1 - entry.subscribeAndSaveDiscountPct / 100)
        : entry.totalPriceUSD;
      return { entry, subscribeAndSave: line.subscribeAndSave, lineTotalUSD };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const total = lines.reduce((s, l) => s + l.lineTotalUSD, 0);

  if (lines.length === 0) {
    return (
      <main className="min-h-screen bg-white text-slate-900 font-sans">
        <div className="max-w-xl mx-auto px-8 py-16 text-center">
          <h1 className="text-xl font-bold mb-2">Your cart is empty</h1>
          <a href="/mock-merchant" className="text-sm text-blue-600 hover:underline">
            ← Continue shopping
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="border-b border-slate-200 px-8 py-5">
        <div className="max-w-xl mx-auto">
          <a href="/mock-merchant" className="text-sm text-blue-600 hover:underline">
            ← MockMart
          </a>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-6">Checkout</h1>

        <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 mb-8">
          {lines.map((l) => (
            <div key={l.entry.id} className="p-4 flex justify-between text-sm">
              <div>
                <div className="font-medium">{l.entry.productName}</div>
                {l.subscribeAndSave && (
                  <div className="text-emerald-600 text-xs mt-0.5">Subscribe &amp; Save</div>
                )}
              </div>
              <div className="font-mono">${l.lineTotalUSD.toFixed(2)}</div>
            </div>
          ))}
          <div className="p-4 flex justify-between font-bold">
            <div>Total</div>
            <div className="font-mono">${total.toFixed(2)}</div>
          </div>
        </div>

        <form action={submitCheckoutAction} className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="font-semibold mb-1">Contact &amp; shipping</legend>
            <input name="fullName" placeholder="Full name" required className={inputClass} />
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className={inputClass}
            />
            <input
              name="streetAddress"
              placeholder="Street address"
              required
              className={inputClass}
            />
            <div className="grid grid-cols-3 gap-3">
              <input name="city" placeholder="City" required className={inputClass} />
              <input name="state" placeholder="State" required className={inputClass} />
              <input name="zipCode" placeholder="ZIP" required className={inputClass} />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-semibold mb-1">Payment</legend>
            <input
              name="cardNumber"
              placeholder="Card number"
              required
              className={`${inputClass} font-mono`}
            />
            <div className="grid grid-cols-3 gap-3">
              <input name="expiryMonth" placeholder="MM" required className={inputClass} />
              <input name="expiryYear" placeholder="YY" required className={inputClass} />
              <input name="cvv" placeholder="CVV" required className={inputClass} />
            </div>
          </fieldset>

          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
          >
            Place order — ${total.toFixed(2)}
          </button>
        </form>
      </div>
    </main>
  );
}
