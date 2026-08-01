"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { AgentReasoningFeed } from "@/components/agent-reasoning-feed";
import { PasskeyModal } from "@/components/passkey-modal";
import { SupplementProduct, AgentReasoningLog, PravaCardDetails } from "@/types";
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  ShieldCheck
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
      message: `Prava Card Minted: ${card.cardNumber.slice(0, 4)} **** **** ${card.cardNumber.slice(-4)} (Hard-Capped at $${totalCost.toFixed(2)})`,
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
    <div className="min-h-screen bg-[#000000] text-[#f5f5f7] font-sans selection:bg-white selection:text-black antialiased">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 py-20 space-y-24">
        {/* TESLA-STYLE MASSIVE HERO */}
        <section className="text-center space-y-6 max-w-4xl mx-auto py-10">
          <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tight text-white leading-none">
            Stop overpaying <br />
            <span className="text-[#86868b]">for supplements.</span>
          </h1>

          <p className="text-[#86868b] text-lg sm:text-xl font-normal max-w-xl mx-auto leading-relaxed pt-4">
            Audit nutrition labels across stores, find the true lowest cost-per-gram, and execute checkouts with single-use Prava Virtual Cards.
          </p>
        </section>

        {/* STACK BUILDER CARD SECTION */}
        <section id="stack-builder" className="max-w-4xl mx-auto space-y-8">
          <div className="rounded-3xl bg-[#0c0c0e] border border-[#1c1c1e] p-8 space-y-8 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#1c1c1e]">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Stack Builder</h2>
                <p className="text-sm text-[#86868b] mt-1">Add items to audit entire stack across merchants</p>
              </div>
              <span className="text-xs text-[#86868b] bg-[#161618] px-4 py-1.5 rounded-full border border-[#2c2c2e] self-start sm:self-auto font-medium">
                {stackCart.length} Items Selected
              </span>
            </div>

            {/* SEARCH & ADD INPUT */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addItemToCart(searchInput);
              }}
              className="flex gap-3"
            >
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 w-4 h-4 text-[#6e6e73]" />
                <input
                  type="text"
                  placeholder="Search and add custom supplement..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#161618] border border-[#2c2c2e] text-white placeholder-[#6e6e73] text-sm focus:outline-none focus:border-white transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-white hover:bg-[#e8e8ed] text-black font-semibold text-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </form>

            {/* ITEM STACK LIST */}
            <div className="space-y-3">
              {stackCart.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 rounded-xl bg-[#161618] border border-[#2c2c2e] hover:border-[#3c3c3e] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                    <span className="text-sm font-medium text-white">{item}</span>
                  </div>
                  <button
                    onClick={() => removeItemFromCart(idx)}
                    className="text-[#6e6e73] hover:text-white p-1 transition-colors cursor-pointer"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* AUDIT MAIN BUTTON */}
            <button
              onClick={handleAuditEntireStack}
              disabled={isAuditing || stackCart.length === 0}
              className="w-full py-4 rounded-xl bg-white hover:bg-[#e8e8ed] text-black font-bold text-base transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isAuditing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Auditing Entire Stack...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-black" /> Audit Entire Stack ({stackCart.length} Items)
                </>
              )}
            </button>
          </div>
        </section>

        {/* LOG TERMINAL */}
        <section id="audit-terminal" className="max-w-4xl mx-auto">
          <AgentReasoningFeed logs={reasoningLogs} isSearching={isAuditing || isCheckoutExecuting} />
        </section>

        {/* RESULTS & PRAVA CHECKOUT */}
        {auditedProducts.length > 0 && (
          <section className="max-w-4xl mx-auto space-y-8 pt-6">
            <div className="rounded-3xl bg-[#0c0c0e] border border-[#1c1c1e] p-8 space-y-6">
              <div className="flex justify-between items-end border-b border-[#1c1c1e] pb-6">
                <div>
                  <span className="text-xs uppercase tracking-wider text-[#86868b] font-semibold">Audit Result</span>
                  <h3 className="text-3xl font-bold text-white mt-1">Cheapest Match Found</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#86868b] block">Total Stack Price</span>
                  <span className="text-3xl font-mono font-bold text-emerald-400">${auditedTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {auditedProducts.map((prod) => (
                  <div key={prod.id} className="p-4 rounded-xl bg-[#161618] border border-[#2c2c2e] space-y-2">
                    <span className="text-[10px] uppercase font-bold text-[#86868b] px-2 py-0.5 rounded bg-[#000000]">
                      {prod.vendorName}
                    </span>
                    <h4 className="text-sm font-semibold text-white">{prod.productName}</h4>
                    <div className="flex justify-between text-xs font-mono pt-1 text-emerald-400">
                      <span>Subscribe & Save Deals</span>
                      <span>${prod.discountedPriceUSD.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* PRAVA ACTION BAR */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#1c1c1e]">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  <div className="text-xs">
                    <span className="font-semibold text-white block">One-Click Prava Virtual Card</span>
                    <span className="text-[#86868b]">Card hard-capped to ${auditedTotal.toFixed(2)} & auto-expires post-purchase</span>
                  </div>
                </div>

                {checkoutComplete ? (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-4 py-2.5 rounded-xl border border-emerald-500/20 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> All Checkouts Placed & Card Expired
                  </span>
                ) : (
                  <button
                    onClick={() => setIsPasskeyModalOpen(true)}
                    className="py-3 px-6 rounded-xl bg-white hover:bg-[#e8e8ed] text-black font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2"
                  >
                    Authorize Passkey & Buy Stack <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
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
