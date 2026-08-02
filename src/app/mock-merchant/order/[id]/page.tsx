import { notFound } from 'next/navigation';

import * as store from '@/lib/mock-merchant/store';
import { attemptRenewalAction } from '../../actions';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = store.getOrder(id);
  if (!order) notFound();

  const boundRenewal = attemptRenewalAction.bind(null, order.id);
  const lastAttempt = order.renewalAttempts[order.renewalAttempts.length - 1];

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
        <div className="text-emerald-600 text-sm font-semibold mb-2">✓ Order confirmed</div>
        <h1 className="text-2xl font-bold mb-1">Order {order.id}</h1>
        <p className="text-sm text-slate-500 mb-6">
          Placed {new Date(order.createdAt).toLocaleString()}
        </p>

        <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 mb-6">
          {order.items.map((item) => (
            <div key={item.productId} className="p-4 flex justify-between text-sm">
              <div>
                <div className="font-medium">{item.productName}</div>
                {item.subscribeAndSave && (
                  <div className="text-emerald-600 text-xs mt-0.5">
                    Subscribe &amp; Save — recurring
                  </div>
                )}
              </div>
              <div className="font-mono">${item.lineTotalUSD.toFixed(2)}</div>
            </div>
          ))}
          <div className="p-4 flex justify-between font-bold">
            <div>Total charged</div>
            <div className="font-mono">${order.totalUSD.toFixed(2)}</div>
          </div>
        </div>

        <div className="text-sm text-slate-600 mb-8 space-y-1">
          <div>
            Shipping to {order.shippingAddress.fullName}, {order.shippingAddress.streetAddress},{' '}
            {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
            {order.shippingAddress.zipCode}
          </div>
          <div className="font-mono">Card ····{order.card.cardNumber.slice(-4)}</div>
        </div>

        {order.hasSubscription && (
          <div className="border border-slate-200 rounded-lg p-5">
            <h2 className="font-semibold mb-1">Subscription active</h2>
            <p className="text-sm text-slate-500 mb-4">
              This order includes a recurring Subscribe &amp; Save item. Simulate next month&apos;s
              automatic renewal charge against the same card used for this order.
            </p>

            {lastAttempt ? (
              <div
                className={`text-sm font-semibold ${lastAttempt.outcome === 'DECLINED' ? 'text-rose-600' : 'text-emerald-600'}`}
              >
                {lastAttempt.outcome === 'DECLINED' ? '✗ Renewal declined' : '✓ Renewal approved'}
                <div className="text-slate-500 font-normal mt-1">{lastAttempt.reason}</div>
              </div>
            ) : (
              <form action={boundRenewal}>
                <button
                  type="submit"
                  className="py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Simulate renewal charge
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
