"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";
import { AgentReasoningFeed } from "@/components/agent-reasoning-feed";
import { PasskeyModal } from "@/components/passkey-modal";
import { AnimatedCounter } from "@/components/animated-counter";
import { PriceComparisonChart } from "@/components/price-comparison-chart";
import { SupplementProduct, AgentReasoningLog, CheckoutExecutionPayload } from "@/types";
import { executeCheckout, type MintedCardClient } from "@/lib/prava/client";
import { streamOptimizeStack } from "@/lib/agent/client";
import { DEFAULT_BUDGET_USD, DEFAULT_STACK, STACK_STORAGE_KEY } from "@/lib/stack-store";
import { ShieldCheck, CheckCircle2, ArrowRight, TrendingDown, BarChart3 } from "lucide-react";

export default function ComparePage() {
  const [isAuditing, setIsAuditing] = useState(true);
  const [isCheckoutExecuting, setIsCheckoutExecuting] = useState(false);
  const [reasoningLogs, setReasoningLogs] = useState<AgentReasoningLog[]>([]);
  const [auditedProducts, setAuditedProducts] = useState<SupplementProduct[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [orderIds, setOrderIds] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"chart" | "cards">("chart");

  useEffect(() => {
    // Read the stack the user built on the landing page. Falls back to a
    // default stack so /compare is still meaningful when opened directly.
    let stackCart = DEFAULT_STACK;
    let budget = DEFAULT_BUDGET_USD;
    try {
      const stored = sessionStorage.getItem(STACK_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) stackCart = parsed.items;
        if (typeof parsed.budgetUSD === "number") budget = parsed.budgetUSD;
      }
    } catch {
      // Corrupt or unavailable storage just means we use the defaults.
    }

    // React 18+ runs effects twice in dev StrictMode; this guards against a
    // duplicated audit run and duplicated log entries.
    let cancelled = false;

    (async () => {
      try {
        await streamOptimizeStack(
          { targetBudgetUSD: budget, targetIngredients: stackCart },
          {
            onLog: (log) => {
              if (!cancelled) setReasoningLogs((prev) => [...prev, log]);
            },
            onResult: (result) => {
              if (!cancelled) setAuditedProducts(result.recommendedProducts);
            },
            onError: (message) => {
              if (!cancelled) setAuditError(message);
            },
          },
        );
      } catch (err) {
        if (!cancelled) {
          setAuditError(err instanceof Error ? err.message : "Stack audit failed");
        }
      } finally {
        if (!cancelled) setIsAuditing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Real checkout. The card is a live Prava credential capped at this exact
   * total; Playwright drives the merchant with it, then the credential is
   * retired so the subscription cannot renew.
   */
  const handlePasskeyAuthorized = async (card: MintedCardClient) => {
    setIsPasskeyModalOpen(false);
    setIsCheckoutExecuting(true);

    setReasoningLogs((prev) => [
      ...prev,
      {
        id: `card_${card.sessionId}`,
        timestamp: new Date().toISOString(),
        step: "CARD_MINTING",
        status: "SUCCESS",
        message: `Prava single-use card ••••${card.cardNumber.slice(-4)} minted, capped at $${card.amountCapUSD.toFixed(2)}`,
        metadata: {
          environment: card.environment,
          sessionId: card.sessionId,
          merchant: card.merchantName,
          singleUse: card.isSingleUse,
        },
      },
    ]);

    try {
      const result = await executeCheckout(
        {
          products: auditedProducts,
          shippingAddress: {
            fullName: "Alex Demo",
            streetAddress: "1 Market Street",
            city: "San Francisco",
            state: "CA",
            zipCode: "94105",
            email: "demo@macrostack.test",
          },
          cardDetails: card as unknown as CheckoutExecutionPayload["cardDetails"],
        },
        {
          onLog: (log) => setReasoningLogs((prev) => [...prev, log]),
          onError: (message) => setCheckoutError(message),
        },
      );

      if (result?.success) {
        setOrderIds(result.orderId ?? null);
        setCheckoutComplete(true);
      } else {
        setCheckoutError(
          result ? "Checkout did not complete — see the log above." : "Checkout produced no result.",
        );
      }
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setIsCheckoutExecuting(false);
    }
  };

  const originalTotal = auditedProducts.reduce((acc, p) => acc + p.totalPriceUSD, 0);
  const auditedTotal = auditedProducts.reduce((acc, p) => acc + p.discountedPriceUSD, 0);
  const netSavings = originalTotal - auditedTotal;
  const savingsPercent = originalTotal > 0 ? Math.round((netSavings / originalTotal) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased selection:bg-cyan-400 selection:text-slate-950 flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10 space-y-10 flex flex-col items-center">
        <FadeIn className="w-full" delay={150}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* AUDIT LOG TERMINAL */}
            <div className="lg:col-span-5">
              <AgentReasoningFeed logs={reasoningLogs} isSearching={isAuditing || isCheckoutExecuting} />
            </div>

            {/* RESULTS PANEL */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* SKELETON LOADING */}
              {isAuditing && (
                <div className="rounded-2xl bg-[#121217] border border-[#22222c] p-6 space-y-4 shadow-2xl">
                  <div className="flex justify-between items-end pb-4 border-b border-[#22222c]">
                    <div className="space-y-2">
                      <div className="skeleton-pulse h-3 w-20"></div>
                      <div className="skeleton-pulse h-6 w-48"></div>
                    </div>
                    <div className="space-y-2 flex flex-col items-end">
                      <div className="skeleton-pulse h-3 w-28"></div>
                      <div className="skeleton-pulse h-6 w-24"></div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between">
                          <div className="skeleton-pulse h-3 w-36"></div>
                          <div className="skeleton-pulse h-3 w-10"></div>
                        </div>
                        <div className="skeleton-pulse h-5 w-full"></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AUDIT FAILED / NOTHING MATCHED */}
              {!isAuditing && auditedProducts.length === 0 && (
                <div className="rounded-2xl bg-[#121217] border border-rose-500/30 p-6 space-y-2">
                  <h3 className="text-sm font-black text-white">No stack could be built</h3>
                  <p className="text-[11px] text-[#8f8f9e] leading-relaxed">
                    {auditError
                      ? auditError
                      : "None of your items matched an auditable ingredient, or the budget was too low to cover any of them. Try raising the budget cap, or use names like Creatine, L-Citrulline, Whey Protein, Beta-Alanine or Electrolytes."}
                  </p>
                  <Link
                    href="/"
                    className="inline-block text-[11px] font-bold text-cyan-300 hover:text-cyan-200 pt-1"
                  >
                    ← Edit your stack
                  </Link>
                </div>
              )}

              {/* RESULTS */}
              {auditedProducts.length > 0 && (
                <div className="rounded-2xl bg-[#121217] border border-[#22222c] p-6 space-y-5 shadow-2xl">
                  {/* SAVINGS BANNER */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 border border-cyan-400/30">
                    <div className="flex items-center gap-2.5">
                      <TrendingDown className="w-5 h-5 text-cyan-400" />
                      <div>
                        <span className="text-sm font-black text-white">
                          You save <AnimatedCounter target={netSavings} prefix="$" className="text-cyan-400" /> ({savingsPercent}%)
                        </span>
                        <span className="text-[10px] text-[#8f8f9e] block">vs. full retail across all stores</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#8f8f9e] block">Stack Total</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-mono text-[#646473] line-through">${originalTotal.toFixed(2)}</span>
                        <AnimatedCounter target={auditedTotal} prefix="$" className="text-2xl font-mono font-bold text-cyan-400" />
                      </div>
                    </div>
                  </div>

                  {/* VIEW TOGGLE */}
                  <div className="flex items-center justify-between border-b border-[#22222c] pb-3">
                    <h3 className="text-lg font-black text-white">Cheapest Matches</h3>
                    <div className="flex items-center gap-1 bg-[#08080a] rounded-lg p-0.5 border border-[#22222c]">
                      <button onClick={() => setViewMode("chart")}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${viewMode === "chart" ? "bg-[#22222c] text-white" : "text-[#8f8f9e] hover:text-white"}`}>
                        <BarChart3 className="w-3 h-3 inline mr-1" />Chart
                      </button>
                      <button onClick={() => setViewMode("cards")}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${viewMode === "cards" ? "bg-[#22222c] text-white" : "text-[#8f8f9e] hover:text-white"}`}>
                        Cards
                      </button>
                    </div>
                  </div>

                  {/* CHART VIEW */}
                  {viewMode === "chart" && <PriceComparisonChart products={auditedProducts} />}

                  {/* CARDS VIEW */}
                  {viewMode === "cards" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {auditedProducts.map((prod) => (
                        <div key={prod.id} className="p-3.5 rounded-xl bg-[#08080a] border border-[#1e1e28] space-y-1.5">
                          <span className="text-[10px] font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30">
                            {prod.vendorName}
                          </span>
                          <h4 className="text-xs font-bold text-white">{prod.productName}</h4>
                          <div className="flex justify-between text-[11px] font-mono pt-1 text-slate-300">
                            <span>Subscribe & Save</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#646473] line-through">${prod.totalPriceUSD.toFixed(2)}</span>
                              <span className="text-cyan-400 font-bold">${prod.discountedPriceUSD.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PRAVA BAR */}
                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#22222c]">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="text-[11px]">
                        <span className="font-bold text-white block">Prava Virtual Card</span>
                        <span className="text-[#8f8f9e]">Capped to ${auditedTotal.toFixed(2)} · Auto-expires post-checkout</span>
                      </div>
                    </div>

                    {checkoutComplete ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-[11px] font-bold text-cyan-300 bg-cyan-500/10 px-4 py-2.5 rounded-lg border border-cyan-400/30 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Complete · Card Retired
                        </span>
                        {orderIds && (
                          <span className="text-[10px] text-[#8f8f9e] font-mono">{orderIds}</span>
                        )}
                        {orderIds && (
                          <Link
                            href={`/mock-merchant/confirmation?order=${encodeURIComponent(orderIds.split(",")[0].trim())}`}
                            className="text-[10px] font-bold text-cyan-300 hover:text-cyan-200"
                          >
                            Try the renewal charge →
                          </Link>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => setIsPasskeyModalOpen(true)}
                        className="py-3 px-5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-cyan-500/20 hover:scale-105">
                        Authorize & Checkout <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    )}
                  </div>

                  {checkoutError && (
                    <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                      {checkoutError}
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        </FadeIn>
      </main>

      <Footer />

      <PasskeyModal isOpen={isPasskeyModalOpen} onClose={() => setIsPasskeyModalOpen(false)}
        products={auditedProducts} totalAmountUSD={auditedTotal} onAuthorized={handlePasskeyAuthorized} />
    </div>
  );
}
