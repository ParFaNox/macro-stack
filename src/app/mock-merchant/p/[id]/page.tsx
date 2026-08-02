import { notFound } from 'next/navigation';

import { findCatalogEntryById } from '@/lib/agent/catalog';
import { addToCartAction } from '../../actions';

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { id } = await params;
  const { added } = await searchParams;
  const entry = findCatalogEntryById(id);
  if (!entry) notFound();

  const discountedPriceUSD = entry.totalPriceUSD * (1 - entry.subscribeAndSaveDiscountPct / 100);

  return (
    <main className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="border-b border-slate-200 px-8 py-5">
        <div className="max-w-4xl mx-auto">
          <a href="/mock-merchant" className="text-sm text-blue-600 hover:underline">
            ← MockMart
          </a>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-8 py-10 flex gap-10">
        <div className="w-52 h-52 shrink-0 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">
          Product photo
        </div>

        <div className="flex-1 max-w-md">
          <p className="text-xs uppercase tracking-wide text-slate-500">{entry.brand}</p>
          <h1 className="text-2xl font-bold">{entry.productName}</h1>
          <p className="text-sm text-slate-500 mt-1">Sold by {entry.vendorName}</p>

          <div className="mt-4 text-3xl font-bold">${entry.totalPriceUSD.toFixed(2)}</div>

          {added === '1' && (
            <p className="mt-2 text-sm text-emerald-600 font-medium">Added to cart.</p>
          )}

          <form action={addToCartAction} className="mt-6 space-y-4">
            <input type="hidden" name="productId" value={entry.id} />

            <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer has-checked:border-emerald-400 has-checked:bg-emerald-50">
              <input type="checkbox" name="subscribeAndSave" className="mt-1" />
              <span>
                <span className="block font-medium">
                  Subscribe &amp; Save — {entry.subscribeAndSaveDiscountPct}% off
                </span>
                <span className="block text-sm text-slate-500">
                  ${discountedPriceUSD.toFixed(2)} per delivery. Cancel anytime.
                </span>
              </span>
            </label>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
            >
              Add to Cart
            </button>
          </form>

          <a
            href="/mock-merchant/checkout"
            className="block mt-4 text-sm text-blue-600 hover:underline"
          >
            View cart &amp; checkout →
          </a>
        </div>
      </div>
    </main>
  );
}
