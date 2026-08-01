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
  TrendingDown,
  Layers,
  ArrowUpRight
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
      message: `Auditing ${stackCart.length} stack items across Amazon, iHerb, and Vendor Direct...`,
    };
    setReasoningLogs([log1]);

    setTimeout(() => {
      const log2: AgentReasoningLog = {
        id: "log_2",
        timestamp: new Date().toISOString(),
        step: "COST_CALCULATION",
        status: "INFO",
        message: "Calculated active cost-per-gram. Selected Subscribe & Save 15-20% discount tiers.",
      };
      setReasoningLogs((prev) => [...prev, log2]);
    }, 900);

    setTimeout(() => {
      const mockResults: SupplementProduct[] = stackCart.map((item, idx) => {
        const basePrices = [25.49, 32.99, 42.50, 19.99, 14.99];
        const origPrices = [29.99, 39.99, 49.99, 24.99, 18.99];
        const stores = ["iHerb Direct", "Vendor Direct", "Amazon", "Bodybuilding.com", "iHerb Direct"];

        return {
          id: `prod_${idx}`,
          brand: "Lab-Certified",
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
        message: `Entire ${stackCart.length}-item stack audit complete. Lowest store prices matched.`,
        metadata: {
          originalStackTotal: `$${mockResults.reduce((a, b) => a + b.totalPriceUSD, 0).toFixed(2)}`,
          auditedStackTotal: `$${mockResults.reduce((a, b) => a + b.discountedPriceUSD, 0).toFixed(2)}`,
          netSavings: `$${(mockResults.reduce((a, b) => a + b.totalPriceUSD, 0) - mockResults.reduce((a, b) => a + b.discountedPriceUSD, 0)).toFixed(2)}`,
        },
      };

      setReasoningLogs((prev) => [...prev, log3]);
      setAuditedProducts(mockResults);
      setIsAuditing(false);
    }, 2000);
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
        message: `Playwright Headless browser completed checkouts. Prava card expired safely.`,
        metadata: { orderId: "ORD-STACK-9921", status: "Completed & Card Expired" },
      };
      setReasoningLogs((prev) => [...prev, logPlaywright]);
      setIsCheckoutExecuting(false);
      setCheckoutComplete(true);
    }, 1800);
  };

  const originalTotal = auditedProducts.reduce((acc, p) => acc + p.totalPriceUSD, 0);
  const auditedTotal = auditedProducts.reduce((acc, p) => acc + p.discountedPriceUSD, 0);
  const netSavings = originalTotal - auditedTotal;

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-200 font-sans selection:bg-emerald-400 selection:text-slate-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-10">
        {/* LINEAR-STYLE CLEAN HERO SECTION */}
        <section className="space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono">
            <Layers className="w-3.5 h-3.5 text-emerald-400" /> Multi-Item Stack Audit Platform
          </div>

          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-100 leading-tight">
            Stop overpaying for supplements.
          </h1>

          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Build your supplement stack, audit active ingredient cost-per-gram across stores, and automate checkouts using <strong className="text-slate-200">Prava Virtual Cards</strong> to lock Subscribe & Save discounts safely.
          </p>
        </section>

        {/* BENTO GRID LAYOUT */}
        <div id="stack-builder" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* STACK CART (5 COLS) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl bg-[#0d0e15] border border-slate-800 p-6 space-y-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-slate-100">Stack Cart</h2>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {stackCart.length} Items
                </span>
              </div>

              {/* SEARCH & ADD INPUT */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addItemToCart(searchInput);
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search & add supplement..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-md bg-[#090a0f] border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-slate-600 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </form>

              {/* CART LIST */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {stackCart.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-md bg-[#090a0f] border border-slate-800/60 hover:border-slate-700 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-mono text-slate-500">{idx + 1}.</span>
                      <span className="font-medium text-slate-300">{item}</span>
                    </div>
                    <button
                      onClick={() => removeItemFromCart(idx)}
                      className="text-slate-600 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* AUDIT BUTTON */}
              <button
                onClick={handleAuditEntireStack}
                disabled={isAuditing || stackCart.length === 0}
                className="w-full py-2.5 px-4 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isAuditing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Auditing Stack...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Audit Entire Stack ({stackCart.length} Items)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* LIVE TERMINAL (7 COLS) */}
          <div className="lg:col-span-7">
            <AgentReasoningFeed logs={reasoningLogs} isSearching={isAuditing || isCheckoutExecuting} />
          </div>
        </div>

        {/* AUDITED RESULTS SECTION */}
        {auditedProducts.length > 0 && (
          <section className="space-y-6 pt-4">
            {/* AUDIT SUMMARY METRICS */}
            <div className="rounded-xl bg-[#0d0e15] border border-slate-800 p-6 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-xl">
              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase block">Original Total</span>
                <span className="text-xl font-mono text-slate-500 line-through">${originalTotal.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[11px] font-mono text-emerald-400 uppercase block">Audited Best Total</span>
                <span className="text-2xl font-mono font-bold text-emerald-400">${auditedTotal.toFixed(2)}</span>
              </div>
              <div className="md:text-right">
                <span className="text-[11px] font-mono text-slate-400 uppercase block">Net Savings</span>
                <span className="text-sm font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 inline-block mt-1">
                  Saved ${netSavings.toFixed(2)} Across Stores
                </span>
              </div>
            </div>

            {/* RESULTS LIST */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">Cheapest Store Matches</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {auditedProducts.map((prod) => (
                  <div key={prod.id} className="p-4 rounded-xl bg-[#0d0e15] border border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {prod.vendorName}
                        </span>
                        <h4 className="font-semibold text-slate-200 mt-1">{prod.productName}</h4>
                      </div>
                      <span className="font-mono font-bold text-emerald-400">${prod.discountedPriceUSD.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CHECKOUT ACTION BAR */}
            <div className="p-5 rounded-xl bg-[#0d0e15] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <div className="text-xs">
                  <span className="font-semibold text-slate-200 block">Buy Stack via Prava Virtual Card</span>
                  <span className="text-slate-500">Card hard-capped to ${auditedTotal.toFixed(2)}. Expires post-checkout.</span>
                </div>
              </div>

              {checkoutComplete ? (
                <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-2 rounded border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4" /> All Checkouts Executed & Card Expired
                </span>
              ) : (
                <button
                  onClick={() => setIsPasskeyModalOpen(true)}
                  className="py-2.5 px-4 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  Authorize Passkey & Checkout <ArrowRight className="w-3.5 h-3.5" />
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
