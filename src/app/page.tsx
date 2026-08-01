"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { AgentReasoningFeed } from "@/components/agent-reasoning-feed";
import { PasskeyModal } from "@/components/passkey-modal";
import { SupplementProduct, AgentReasoningLog, PravaCardDetails } from "@/types";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  Zap,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  ExternalLink,
  ShieldCheck,
  PackageCheck,
  TrendingDown
} from "lucide-react";

export default function Dashboard() {
  const [searchInput, setSearchInput] = useState<string>("");
  const [stackCart, setStackCart] = useState<string[]>([
    "Creatine Monohydrate (500g)",
    "L-Citrulline Malate (300g)",
    "Whey Protein Isolate (2lb)",
    "Beta-Alanine (200g)",
    "Electrolytes Complex (30 servings)",
  ]);

  const [isAuditing, setIsAuditing] = useState(false);
  const [isCheckoutExecuting, setIsCheckoutExecuting] = useState(false);
  const [reasoningLogs, setReasoningLogs] = useState<AgentReasoningLog[]>([]);
  const [auditedProducts, setAuditedProducts] = useState<SupplementProduct[]>([]);
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);

  const addItemToCart = (item: string) => {
    if (!item.trim()) return;
    if (!stackCart.includes(item)) {
      setStackCart([...stackCart, item]);
    }
    setSearchInput("");
  };

  const removeItemFromCart = (index: number) => {
    setStackCart(stackCart.filter((_, i) => i !== index));
  };

  const handleAuditEntireStack = async () => {
    if (stackCart.length === 0) return;

    setIsAuditing(true);
    setReasoningLogs([]);
    setAuditedProducts([]);
    setCheckoutComplete(false);

    const log1: AgentReasoningLog = {
      id: "log_1",
      timestamp: new Date().toISOString(),
      step: "LABEL_AUDIT",
      status: "INFO",
      message: `Initiating multi-item OCR audit for ${stackCart.length} supplements in your stack cart...`,
    };
    setReasoningLogs([log1]);

    setTimeout(() => {
      const log2: AgentReasoningLog = {
        id: "log_2",
        timestamp: new Date().toISOString(),
        step: "COST_CALCULATION",
        status: "INFO",
        message: "Cross-checking Amazon, iHerb, Bodybuilding.com & Vendor Direct. Calculating true active cost-per-gram...",
      };
      setReasoningLogs((prev) => [...prev, log2]);
    }, 1000);

    setTimeout(() => {
      const mockResults: SupplementProduct[] = stackCart.map((item, idx) => {
        const basePrices = [25.49, 32.99, 42.50, 19.99, 14.99];
        const origPrices = [29.99, 39.99, 49.99, 24.99, 18.99];
        const stores = ["iHerb Direct", "Vendor Direct", "Amazon Warehouse", "Bodybuilding.com", "iHerb Direct"];

        return {
          id: `prod_${idx}`,
          brand: "Lab-Verified",
          productName: item,
          imageUrl: "/supp.jpg",
          labelImageUrl: "/label.jpg",
          totalPriceUSD: origPrices[idx % origPrices.length],
          servingsPerContainer: 60,
          activeIngredients: [{ name: item.split("(")[0].trim(), amountPerServingGrams: 5.0, purityPercentage: 99.5 }],
          costPerGramActiveUSD: Number((basePrices[idx % basePrices.length] / 60).toFixed(2)),
          subscribeAndSaveDiscountPct: 15 + (idx * 2),
          discountedPriceUSD: basePrices[idx % basePrices.length],
          checkoutUrl: "https://example.com/checkout",
          vendorName: stores[idx % stores.length],
        };
      });

      const log3: AgentReasoningLog = {
        id: "log_3",
        timestamp: new Date().toISOString(),
        step: "STACK_OPTIMIZATION",
        status: "SUCCESS",
        message: `Entire ${stackCart.length}-product stack optimized! Found lowest prices across 3 stores.`,
        metadata: {
          originalStackTotal: `$${mockResults.reduce((a, b) => a + b.totalPriceUSD, 0).toFixed(2)}`,
          auditedStackTotal: `$${mockResults.reduce((a, b) => a + b.discountedPriceUSD, 0).toFixed(2)}`,
          netSavings: `$${(mockResults.reduce((a, b) => a + b.totalPriceUSD, 0) - mockResults.reduce((a, b) => a + b.discountedPriceUSD, 0)).toFixed(2)} (Subscribe & Save Locked)`,
        },
      };

      setReasoningLogs((prev) => [...prev, log3]);
      setAuditedProducts(mockResults);
      setIsAuditing(false);
    }, 2200);
  };

  const handlePasskeyAuthorized = async (card: PravaCardDetails) => {
    setIsPasskeyModalOpen(false);
    setIsCheckoutExecuting(true);

    const totalCost = auditedProducts.reduce((a, b) => a + b.discountedPriceUSD, 0);

    const logCard: AgentReasoningLog = {
      id: "log_4",
      timestamp: new Date().toISOString(),
      step: "CARD_MINTING",
      status: "SUCCESS",
      message: `Prava Single-Use Card Minted: ${card.cardNumber.slice(0, 4)} **** **** ${card.cardNumber.slice(-4)} (Hard-Capped at $${totalCost.toFixed(2)})`,
      metadata: { cardStatus: card.status, isSingleUse: card.isSingleUse },
    };
    setReasoningLogs((prev) => [...prev, logCard]);

    setTimeout(() => {
      const logPlaywright: AgentReasoningLog = {
        id: "log_5",
        timestamp: new Date().toISOString(),
        step: "CHECKOUT_AUTOMATION",
        status: "SUCCESS",
        message: `Playwright Headless browser automated checkouts across stores for all ${auditedProducts.length} items. Prava card expired safely.`,
        metadata: { orderId: "ORD-STACK-9921", status: "All Dispatched & Card Blocked" },
      };
      setReasoningLogs((prev) => [...prev, logPlaywright]);
      setIsCheckoutExecuting(false);
      setCheckoutComplete(true);
    }, 2000);
  };

  const originalTotal = auditedProducts.reduce((acc, p) => acc + p.totalPriceUSD, 0);
  const auditedTotal = auditedProducts.reduce((acc, p) => acc + p.discountedPriceUSD, 0);
  const netSavings = originalTotal - auditedTotal;

  return (
    <div className="min-h-screen bg-[#060812] text-slate-100 font-sans selection:bg-cyan-400 selection:text-slate-950 relative overflow-hidden">
      <div className="absolute top-[-15%] left-[25%] w-[600px] h-[600px] bg-gradient-to-tr from-cyan-500/15 via-indigo-600/20 to-purple-600/15 rounded-full blur-[160px] pointer-events-none"></div>

      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12 relative z-10">
        {/* HEADER */}
        <section className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-purple-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-bold tracking-wide">
            <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400" /> Full Stack Cart Optimizer & Audit Engine
          </div>

          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-tight">
            Stop overpaying for supplements.
          </h1>

          <p className="text-slate-300 text-base md:text-lg leading-relaxed">
            Build your entire 4-5 supplement stack below. Our AI agent audits nutrition labels across all major stores, finds the cheapest deals, and buys them all with a single-use <strong className="text-white">Prava Virtual Card</strong>.
          </p>
        </section>

        {/* STACK BUILDER CART & LIVE AUDIT TERMINAL GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* STACK BUILDER CART (5 COLS) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl bg-slate-900/90 border border-indigo-500/25 p-7 shadow-2xl backdrop-blur-2xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-400">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Stack Builder Cart</h2>
                    <p className="text-[11px] text-slate-400">{stackCart.length} supplements in stack</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-400/30">
                  FULL STACK AUDIT
                </span>
              </div>

              {/* ADD CUSTOM ITEM SEARCH INPUT */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addItemToCart(searchInput);
                }}
                className="relative flex items-center"
              >
                <Search className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search & add supplement to stack..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-11 pr-24 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 transition-all"
                />
                <button
                  type="submit"
                  className="absolute right-2 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </form>

              {/* CART ITEMS LIST */}
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {stackCart.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-indigo-500/40 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-6 w-6 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-xs font-mono font-bold text-indigo-400">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">{item}</span>
                    </div>
                    <button
                      onClick={() => removeItemFromCart(idx)}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition-colors cursor-pointer"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* AUDIT ENTIRE STACK BUTTON */}
              <button
                onClick={handleAuditEntireStack}
                disabled={isAuditing || stackCart.length === 0}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 hover:from-cyan-300 hover:to-purple-400 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl shadow-cyan-500/25 transition-all cursor-pointer disabled:opacity-50 hover:scale-[1.02]"
              >
                {isAuditing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" /> Auditing Entire Stack across Stores...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 fill-slate-950 stroke-[2.5]" /> Audit Entire Stack ({stackCart.length} Items)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* REASONING STREAM (7 COLS) */}
          <div className="lg:col-span-7">
            <AgentReasoningFeed logs={reasoningLogs} isSearching={isAuditing || isCheckoutExecuting} />
          </div>
        </div>

        {/* AUDITED STACK RESULTS */}
        {auditedProducts.length > 0 && (
          <section className="space-y-6 pt-4">
            {/* SAVINGS SUMMARY BANNER */}
            <div className="p-7 rounded-3xl bg-slate-900/90 border border-emerald-500/30 grid grid-cols-1 md:grid-cols-3 gap-6 items-center shadow-2xl">
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider font-bold block">Original Stack Total</span>
                <span className="text-2xl font-black font-mono text-slate-400 line-through">${originalTotal.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-xs text-emerald-400 uppercase tracking-wider font-bold block flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" /> Audited Stack Total
                </span>
                <span className="text-3xl font-black font-mono text-emerald-400">${auditedTotal.toFixed(2)}</span>
              </div>
              <div className="md:text-right">
                <span className="text-xs text-slate-300 font-bold block">Net Stack Savings</span>
                <span className="text-xl font-black font-mono text-cyan-300 bg-cyan-500/10 px-3 py-1 rounded-xl border border-cyan-400/30 inline-block mt-1">
                  Save ${netSavings.toFixed(2)} Across Stores
                </span>
              </div>
            </div>

            {/* AUDITED ITEMS LIST */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-cyan-400" /> Audited Store Matches for All {auditedProducts.length} Items
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {auditedProducts.map((prod, i) => (
                  <div
                    key={prod.id}
                    className="p-5 rounded-2xl bg-slate-900 border border-indigo-500/20 space-y-3 shadow-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-400/30">
                          {prod.vendorName}
                        </span>
                        <h4 className="text-sm font-bold text-white mt-1.5">{prod.productName}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 line-through">${prod.totalPriceUSD.toFixed(2)}</span>
                        <div className="text-base font-black font-mono text-cyan-400">${prod.discountedPriceUSD.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-slate-400 border-t border-slate-800 pt-2 font-mono">
                      <span>Subscribe & Save: <strong className="text-emerald-400">-{prod.subscribeAndSaveDiscountPct}%</strong></span>
                      <span>True Active Cost: <strong className="text-white">${prod.costPerGramActiveUSD}/g</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ONE-CLICK PRAVA CHECKOUT BAR FOR ENTIRE STACK */}
            <div className="p-7 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/30 flex flex-col md:flex-row items-center justify-between gap-5 shadow-2xl">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/40 flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-cyan-400" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Buy Entire Stack ({auditedProducts.length} Items) with Single Prava Card</h4>
                  <p className="text-xs text-slate-400">
                    Prava card hard-capped to exact stack total (${auditedTotal.toFixed(2)}). Card auto-expires post-checkout.
                  </p>
                </div>
              </div>

              {checkoutComplete ? (
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm bg-cyan-500/10 border border-cyan-400/30 px-6 py-3.5 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400" /> All {auditedProducts.length} Items Purchased & Prava Card Expired!
                </div>
              ) : (
                <button
                  onClick={() => setIsPasskeyModalOpen(true)}
                  className="py-4 px-7 rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2.5 shadow-xl shadow-cyan-500/20 transition-all cursor-pointer hover:scale-105"
                >
                  Authorize Passkey & Buy Entire Stack <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              )}
            </div>
          </section>
        )}
      </main>

      <PasskeyModal
        isOpen={isPasskeyModalOpen}
        onClose={() => setIsPasskeyModalOpen(false)}
        products={auditedProducts}
        totalAmountUSD={auditedTotal}
        onAuthorized={handlePasskeyAuthorized}
      />
    </div>
  );
}
