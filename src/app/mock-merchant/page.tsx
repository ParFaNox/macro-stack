import Link from 'next/link';

import { SUPPLEMENT_CATALOG } from '@/lib/agent/catalog';

export default function MockMerchantHome() {
  return (
    <main className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="border-b border-slate-200 px-8 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">MockMart</span>
          <span className="text-xs text-slate-400">Test storefront — not a real merchant</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-1">Shop supplements</h1>
        <p className="text-sm text-slate-500 mb-8">
          Every listing below mirrors MacroStack&apos;s live catalog, so totals here match what{' '}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">/compare</code> quoted.
        </p>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SUPPLEMENT_CATALOG.map((p) => (
            <li key={p.id}>
              <Link
                href={`/mock-merchant/p/${p.id}`}
                className="block border border-slate-200 rounded-lg p-4 hover:border-slate-400 transition-colors"
              >
                <div className="text-xs uppercase tracking-wide text-slate-500">{p.brand}</div>
                <div className="font-semibold">{p.productName}</div>
                <div className="mt-2 font-mono text-sm">${p.totalPriceUSD.toFixed(2)}</div>
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/mock-merchant/checkout"
          className="inline-block mt-8 text-sm text-blue-600 hover:underline"
        >
          View cart &amp; checkout →
        </Link>
      </div>
    </main>
  );
}
