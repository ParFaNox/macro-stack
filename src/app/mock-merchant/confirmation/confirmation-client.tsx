"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Renewal { attemptedAt: string; success: boolean; reason: string }
interface Order {
  orderId: string; productName: string; totalChargedUSD: number;
  subscribeAndSave: boolean; discountPct: number; cardLast4: string;
  shippingName: string; email: string; placedAt: string; renewals: Renewal[];
}

/**
 * Order confirmation, plus the button that proves the point.
 *
 * "Simulate next billing cycle" runs the merchant's recurring charge against the
 * saved card. Because the agent retired that credential the moment checkout
 * completed, the charge is declined — which is the auto-renewal shield, shown
 * rather than asserted.
 */
export default function Confirmation() {
  const orderId = useSearchParams().get("order") ?? "";
  const [order, setOrder] = useState<Order | null>(null);
  const [renewing, setRenewing] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    const res = await fetch(`/api/mock-merchant/order?orderId=${encodeURIComponent(orderId)}`);
    if (res.ok) setOrder(await res.json());
  }, [orderId]);

  useEffect(() => {
    // Deferred so the setState lands outside the effect body, which the
    // react-hooks lint rule flags as a cascading render.
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) void load();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [load]);

  async function renew() {
    setRenewing(true);
    await fetch("/api/mock-merchant/renew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    await load();
    setRenewing(false);
  }

  if (!order) {
    return <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>Loading order {orderId}…</main>;
  }

  return (
    <main style={{ maxWidth: 620, margin: "0 auto", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#fff4e5", border: "1px solid #ffb84d", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 24 }}>
        <strong>Simulated storefront.</strong> No real goods or money.
      </div>

      <h1 style={{ fontSize: 24, color: "#0a7" }}>Order confirmed</h1>
      <p data-testid="order-id" style={{ fontFamily: "monospace", fontSize: 16 }}>{order.orderId}</p>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginTop: 16, fontSize: 14, lineHeight: 1.8 }}>
        <div><strong>{order.productName}</strong></div>
        <div>Charged: <strong data-testid="charged">${order.totalChargedUSD.toFixed(2)}</strong></div>
        <div>Card: ••••{order.cardLast4}</div>
        <div>Ship to: {order.shippingName} · {order.email}</div>
        <div>
          Plan:{" "}
          {order.subscribeAndSave
            ? `Subscribe & Save ${order.discountPct}% — renews monthly`
            : "One-time purchase"}
        </div>
      </div>

      {order.subscribeAndSave && (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginTop: 16 }}>
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Auto-renewal shield</h2>
          <p style={{ fontSize: 13, color: "#666" }}>
            The subscription discount was taken, but the card was single-use and has been
            retired. Run the merchant&apos;s next billing cycle and watch it decline.
          </p>
          <button
            data-testid="simulate-renewal"
            onClick={renew}
            disabled={renewing}
            style={{ padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", borderRadius: 8, border: "1px solid #111", background: "#fff" }}
          >
            {renewing ? "Charging…" : "Simulate next billing cycle"}
          </button>

          {order.renewals.length > 0 && (
            <ul data-testid="renewal-log" style={{ marginTop: 16, paddingLeft: 18, fontSize: 13 }}>
              {order.renewals.map((r, i) => (
                <li key={i} style={{ color: r.success ? "#c00" : "#0a7", marginBottom: 6 }}>
                  <strong>{r.success ? "CHARGED" : "DECLINED"}</strong> — {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

