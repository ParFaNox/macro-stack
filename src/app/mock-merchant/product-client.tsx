"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Mock merchant product page.
 *
 * Deliberately plain and Shopify-shaped, with stable ids and data-testids, so
 * the Playwright runner has reliable selectors. Everything is labelled as a
 * simulation — nobody should mistake this for a real store.
 */

export default function ProductPage() {
  const params = useSearchParams();
  const router = useRouter();

  const product = params.get("product") ?? "Creatine Monohydrate Micronized (500g)";
  const price = Number(params.get("price") ?? 24.99);
  const discountPct = Number(params.get("discount") ?? 15);
  const [subscribe, setSubscribe] = useState(true);

  const total = subscribe ? price * (1 - discountPct / 100) : price;

  const goToCheckout = () => {
    const q = new URLSearchParams({
      product,
      price: String(price),
      discount: String(discountPct),
      subscribe: subscribe ? "1" : "0",
    });
    router.push(`/mock-merchant/checkout?${q.toString()}`);
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <div
        data-testid="sim-banner"
        style={{ background: "#fff4e5", border: "1px solid #ffb84d", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 24 }}
      >
        <strong>Simulated storefront.</strong> MacroStack demo merchant — no real goods, no real money.
      </div>

      <h1 style={{ fontSize: 28, marginBottom: 4 }} data-testid="product-name">{product}</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Sold by NutriMart (demo)</p>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginTop: 24 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            id="subscribe-save"
            data-testid="subscribe-save"
            type="checkbox"
            checked={subscribe}
            onChange={(e) => setSubscribe(e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span>
            <strong>Subscribe &amp; Save {discountPct}%</strong>
            <br />
            <span style={{ color: "#666", fontSize: 13 }}>
              Delivered monthly. Cancel anytime. Your card is charged again each cycle.
            </span>
          </span>
        </label>

        <div style={{ marginTop: 20, fontSize: 22 }}>
          {subscribe && (
            <span style={{ color: "#999", textDecoration: "line-through", marginRight: 10 }}>
              ${price.toFixed(2)}
            </span>
          )}
          <strong data-testid="total-price">${total.toFixed(2)}</strong>
        </div>

        <button
          id="buy-now"
          data-testid="buy-now"
          onClick={goToCheckout}
          style={{ marginTop: 20, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", borderRadius: 8, background: "#111", color: "#fff" }}
        >
          Buy now
        </button>
      </div>
    </main>
  );
}

