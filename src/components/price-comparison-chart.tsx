"use client";

import { SupplementProduct } from "@/types";

interface Props {
  products: SupplementProduct[];
}

export function PriceComparisonChart({ products }: Props) {
  if (products.length === 0) return null;

  const maxPrice = Math.max(...products.map((p) => p.totalPriceUSD));

  return (
    <div className="space-y-3">
      {products.map((prod) => {
        const originalWidth = (prod.totalPriceUSD / maxPrice) * 100;
        const discountedWidth = (prod.discountedPriceUSD / maxPrice) * 100;
        const savingsPct = Math.round(((prod.totalPriceUSD - prod.discountedPriceUSD) / prod.totalPriceUSD) * 100);

        return (
          <div key={prod.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-white truncate max-w-[60%]">{prod.productName}</span>
              <span className="text-cyan-300 font-mono font-bold">-{savingsPct}%</span>
            </div>

            {/* Original price bar (dimmed) */}
            <div className="relative h-5 rounded-md bg-[#1a1a22] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-[#2a2a35] transition-all duration-700 ease-out"
                style={{ width: `${originalWidth}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-1000 ease-out"
                style={{ width: `${discountedWidth}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-mono">
                <span className="text-white font-bold z-10">{prod.vendorName}</span>
                <div className="flex items-center gap-2 z-10">
                  <span className="text-[#8f8f9e] line-through">${prod.totalPriceUSD.toFixed(2)}</span>
                  <span className="text-white font-bold">${prod.discountedPriceUSD.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
