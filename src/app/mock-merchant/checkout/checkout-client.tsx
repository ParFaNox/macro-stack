"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Mock merchant checkout.
 *
 * Field names and data-testids are stable because the Playwright runner types
 * into them. Card details are posted to our own mock order API — they never
 * leave this app.
 */

export default function CheckoutForm() {
  const params = useSearchParams();
  const router = useRouter();

  const product = params.get("product") ?? "Supplement";
  const price = Number(params.get("price") ?? 0);
  const discountPct = Number(params.get("discount") ?? 0);
  const subscribe = params.get("subscribe") === "1";
  const total = subscribe ? price * (1 - discountPct / 100) : price;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/mock-merchant/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: product,
        unitPriceUSD: price,
        quantity: 1,
        subscribeAndSave: subscribe,
        discountPct,
        totalChargedUSD: Number(total.toFixed(2)),
        cardNumber: String(fd.get("cardNumber") ?? "").replace(/\s/g, ""),
        email: String(fd.get("email") ?? ""),
        shippingName: String(fd.get("fullName") ?? ""),
      }),
    });

    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Checkout failed");
      setSubmitting(false);
      return;
    }
    router.push(`/mock-merchant/confirmation?order=${encodeURIComponent(body.orderId)}`);
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc",
    borderRadius: 6, marginBottom: 12, boxSizing: "border-box",
  };

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#fff4e5", border: "1px solid #ffb84d", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 24 }}>
        <strong>Simulated checkout.</strong> No real payment is processed.
      </div>

      <h1 style={{ fontSize: 22 }}>Checkout</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        {product} · {subscribe ? `Subscribe & Save ${discountPct}%` : "One-time purchase"}
      </p>
      <p style={{ fontSize: 20, fontWeight: 700 }} data-testid="checkout-total">${total.toFixed(2)}</p>

      <form onSubmit={onSubmit} style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 15 }}>Contact &amp; shipping</h2>
        <input style={field} id="email" name="email" data-testid="email" type="email" placeholder="Email" required />
        <input style={field} id="fullName" name="fullName" data-testid="full-name" placeholder="Full name" required />
        <input style={field} id="address" name="address" data-testid="address" placeholder="Street address" required />
        <input style={field} id="city" name="city" data-testid="city" placeholder="City" required />
        <input style={field} id="zip" name="zip" data-testid="zip" placeholder="ZIP" required />

        <h2 style={{ fontSize: 15, marginTop: 20 }}>Payment</h2>
        <input style={field} id="cardNumber" name="cardNumber" data-testid="card-number" placeholder="Card number" required />
        <div style={{ display: "flex", gap: 12 }}>
          <input style={field} id="expiry" name="expiry" data-testid="expiry" placeholder="MM/YY" required />
          <input style={field} id="cvv" name="cvv" data-testid="cvv" placeholder="CVV" required />
        </div>

        {error && <p data-testid="checkout-error" style={{ color: "#c00", fontSize: 13 }}>{error}</p>}

        <button
          id="place-order"
          data-testid="place-order"
          type="submit"
          disabled={submitting}
          style={{ width: "100%", marginTop: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", borderRadius: 8, background: "#111", color: "#fff" }}
        >
          {submitting ? "Placing order…" : `Place order · $${total.toFixed(2)}`}
        </button>
      </form>
    </main>
  );
}

