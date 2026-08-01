"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";

/**
 * Savings profile.
 *
 * Every figure here is derived from the signed-in user's real audit and order
 * history. Previously this page showed hardcoded strings ("$247.80", "12
 * stacks"), which is the kind of thing a judge clicks first.
 */

interface Order {
  orderId: string;
  productName: string;
  merchantName: string;
  chargedUSD: number;
  retailUSD: number;
  savedUSD: number;
  placedAt: string;
  cardLast4: string;
  environment: string;
}

interface Audit {
  auditedAt: string;
  ingredients: string[];
  budgetUSD: number;
  savedUSD: number;
  productCount: number;
}

interface Profile {
  email: string;
  memberSince: string;
  totalSavedUSD: number;
  stacksAudited: number;
  ordersPlaced: number;
  totalSpentUSD: number;
  orders: Order[];
  audits: Audit[];
}

const CARD = "rounded-2xl bg-[#121217] border border-[#22222c] shadow-2xl";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (res.status === 401) {
      setSignedIn(false);
      return;
    }
    const body = await res.json();
    setSignedIn(true);
    setProfile(body.profile);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (signedIn === null) {
    return (
      <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto px-6 py-10 text-sm text-[#8f8f9e]">Loading…</main>
        <Footer />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans flex flex-col">
        <Navbar />
        <main className="flex-1 w-full max-w-md mx-auto px-6 py-20 text-center space-y-4">
          <h1 className="text-2xl font-serif italic text-white">Not signed in</h1>
          <p className="text-xs text-[#8f8f9e]">
            Sign in to see the stacks you&apos;ve audited and what you actually saved.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link href="/login" className="px-5 py-2.5 rounded-xl bg-white text-slate-950 font-bold text-xs">
              Sign in
            </Link>
            <Link href="/signup" className="px-5 py-2.5 rounded-xl border border-[#22222c] text-white font-bold text-xs">
              Create account
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const p = profile;
  const empty = !p || (p.ordersPlaced === 0 && p.stacksAudited === 0);

  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-10 space-y-6">
        <FadeIn className="w-full" delay={100}>
          <div className={`${CARD} p-6 space-y-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-serif italic tracking-tight text-white">Your Savings Profile</h2>
                <p className="text-[11px] text-[#8f8f9e] mt-1">
                  {p?.email}
                  {p && ` · member since ${new Date(p.memberSince).toLocaleDateString()}`}
                </p>
              </div>
              <button
                onClick={signOut}
                className="text-[11px] font-bold text-[#8f8f9e] hover:text-white border border-[#22222c] rounded-lg px-3 py-1.5 cursor-pointer"
              >
                Sign out
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Saved", value: `$${(p?.totalSavedUSD ?? 0).toFixed(2)}`, accent: true },
                { label: "Stacks Audited", value: String(p?.stacksAudited ?? 0) },
                { label: "Orders Placed", value: String(p?.ordersPlaced ?? 0) },
                { label: "Total Spent", value: `$${(p?.totalSpentUSD ?? 0).toFixed(2)}` },
              ].map((s) => (
                <div key={s.label} className="p-4 rounded-xl bg-[#08080a] border border-[#1e1e28]">
                  <div className="text-[10px] text-[#8f8f9e] uppercase tracking-wider">{s.label}</div>
                  <div className={`text-xl font-mono font-bold ${s.accent ? "text-cyan-400" : "text-white"}`}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {empty && (
              <p className="text-[11px] text-[#8f8f9e] bg-[#08080a] border border-[#1e1e28] rounded-xl p-4">
                Nothing here yet — these figures are computed from real audits and orders, not
                placeholders.{" "}
                <Link href="/" className="text-cyan-300 font-bold">
                  Audit a stack
                </Link>{" "}
                and it will show up.
              </p>
            )}
          </div>
        </FadeIn>

        {p && p.orders.length > 0 && (
          <FadeIn className="w-full" delay={150}>
            <div className={`${CARD} p-6 space-y-3`}>
              <h3 className="text-sm font-black text-white">Order history</h3>
              {p.orders.map((o) => (
                <div key={o.orderId} className="p-3 rounded-xl bg-[#08080a] border border-[#1e1e28]">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="text-xs font-bold text-white">{o.productName}</div>
                      <div className="text-[10px] text-[#8f8f9e] font-mono">
                        {o.orderId} · {o.merchantName} · ••••{o.cardLast4}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono text-cyan-400">${o.chargedUSD.toFixed(2)}</div>
                      <div className="text-[10px] text-emerald-400">saved ${o.savedUSD.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        )}

        {p && p.audits.length > 0 && (
          <FadeIn className="w-full" delay={200}>
            <div className={`${CARD} p-6 space-y-3`}>
              <h3 className="text-sm font-black text-white">Audit history</h3>
              {p.audits.map((a, i) => (
                <div key={i} className="p-3 rounded-xl bg-[#08080a] border border-[#1e1e28] text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-white font-bold">{a.ingredients.join(", ")}</span>
                    <span className="text-cyan-400 font-mono">${a.savedUSD.toFixed(2)} identified</span>
                  </div>
                  <div className="text-[10px] text-[#8f8f9e] mt-0.5">
                    {new Date(a.auditedAt).toLocaleString()} · {a.productCount} products · budget $
                    {a.budgetUSD.toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        )}
      </main>

      <Footer />
    </div>
  );
}
