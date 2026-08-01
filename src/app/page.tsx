"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { AgentReasoningFeed } from "@/components/agent-reasoning-feed";
import { PasskeyModal } from "@/components/passkey-modal";
import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";
import { AnimatedCounter } from "@/components/animated-counter";
import { PriceComparisonChart } from "@/components/price-comparison-chart";
import { SupplementProduct, AgentReasoningLog, PravaCardDetails } from "@/types";
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  ShieldCheck,
  Zap,
  ChevronDown,
  Info,
  Layers,
  Award,
  Shield,
  TrendingDown,
  BarChart3,
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

  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isCheckoutExecuting, setIsCheckoutExecuting] = useState(false);
  const [reasoningLogs, setReasoningLogs] = useState<AgentReasoningLog[]>([]);
  const [auditedProducts, setAuditedProducts] = useState<SupplementProduct[]>([]);
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [viewMode, setViewMode] = useState<"chart" | "cards">("chart");

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
      id: "log_1", timestamp: new Date().toISOString(),
      step: "LABEL_AUDIT", status: "INFO",
      message: `Scanning ${stackCart.length} items across Amazon, iHerb, Bodybuilding.com...`,
    };
    setReasoningLogs([log1]);

    setTimeout(() => {
      setReasoningLogs((prev) => [...prev, {
        id: "log_2", timestamp: new Date().toISOString(),
        step: "COST_CALCULATION", status: "INFO",
        message: "Active cost-per-gram calculated. Subscribe & Save tiers matched.",
      }]);
    }, 800);

    setTimeout(() => {
      const mockResults: SupplementProduct[] = stackCart.map((item, idx) => {
        const basePrices = [25.49, 32.99, 42.50, 19.99, 14.99];
        const origPrices = [29.99, 39.99, 49.99, 24.99, 18.99];
        const stores = ["iHerb Direct", "Vendor Direct", "Amazon", "Bodybuilding.com", "iHerb Direct"];
        return {
          id: `prod_${idx}`, brand: "Lab-Certified", productName: item,
          imageUrl: "/supp.jpg", labelImageUrl: "/label.jpg",
          totalPriceUSD: origPrices[idx % origPrices.length], servingsPerContainer: 60,
          activeIngredients: [{ name: item.split("(")[0].trim(), amountPerServingGrams: 5.0, purityPercentage: 99.5 }],
          costPerGramActiveUSD: Number((basePrices[idx % basePrices.length] / 60).toFixed(2)),
          subscribeAndSaveDiscountPct: 15 + (idx * 2),
          discountedPriceUSD: basePrices[idx % basePrices.length],
          checkoutUrl: "https://example.com/checkout",
          vendorName: stores[idx % stores.length],
        };
      });

      setReasoningLogs((prev) => [...prev, {
        id: "log_3", timestamp: new Date().toISOString(),
        step: "STACK_OPTIMIZATION", status: "SUCCESS",
        message: `${stackCart.length}-item stack audit complete.`,
        metadata: {
          original: `$${mockResults.reduce((a, b) => a + b.totalPriceUSD, 0).toFixed(2)}`,
          audited: `$${mockResults.reduce((a, b) => a + b.discountedPriceUSD, 0).toFixed(2)}`,
          saved: `$${(mockResults.reduce((a, b) => a + b.totalPriceUSD, 0) - mockResults.reduce((a, b) => a + b.discountedPriceUSD, 0)).toFixed(2)}`,
        },
      }]);
      setAuditedProducts(mockResults);
      setIsAuditing(false);
    }, 1800);
  };

  const handlePasskeyAuthorized = async (card: PravaCardDetails) => {
    setIsPasskeyModalOpen(false);
    setIsCheckoutExecuting(true);
    const totalCost = auditedProducts.reduce((a, b) => a + b.discountedPriceUSD, 0);
    setReasoningLogs((prev) => [...prev, {
      id: "log_4", timestamp: new Date().toISOString(),
      step: "CARD_MINTING", status: "SUCCESS",
      message: `Prava card ****${card.cardNumber.slice(-4)} minted. Cap: $${totalCost.toFixed(2)}`,
      metadata: { status: card.status, singleUse: card.isSingleUse },
    }]);

    setTimeout(() => {
      setReasoningLogs((prev) => [...prev, {
        id: "log_5", timestamp: new Date().toISOString(),
        step: "CHECKOUT_AUTOMATION", status: "SUCCESS",
        message: `All checkouts placed. Card expired.`,
        metadata: { orderId: "ORD-9921", status: "Complete" },
      }]);
      setIsCheckoutExecuting(false);
      setCheckoutComplete(true);
    }, 1600);
  };

  const originalTotal = auditedProducts.reduce((acc, p) => acc + p.totalPriceUSD, 0);
  const auditedTotal = auditedProducts.reduce((acc, p) => acc + p.discountedPriceUSD, 0);
  const netSavings = originalTotal - auditedTotal;
  const savingsPercent = originalTotal > 0 ? Math.round((netSavings / originalTotal) * 100) : 0;

  const faqs = [
    { q: "How does MacroStack find the cheapest price?", a: "Our AI audits nutrition labels across stores, calculates true cost per active gram (ignoring filler), and selects the lowest real price." },
    { q: "What does the Prava Virtual Card do?", a: "It selects Subscribe & Save to unlock 15-20% discounts, then issues a single-use card that auto-expires post-checkout — blocking future auto-renewals." },
    { q: "Any hidden fees?", a: "Zero. You pay the exact merchant price. MacroStack is 100% independent." },
  ];

  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased selection:bg-cyan-400 selection:text-slate-950 flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10 space-y-10 flex flex-col items-center">
        {/* COMPACT HERO */}
        <FadeIn className="w-full flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 border border-cyan-400/30 text-cyan-300 text-[11px] font-bold tracking-wide">
            <Zap className="w-3 h-3 fill-cyan-400 text-cyan-400" /> Autonomous Stack Audit Engine
          </div>

          <h1 className="w-full text-4xl sm:text-6xl md:text-7xl font-serif italic tracking-tight text-white leading-none text-center">
            Stop overpaying <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent not-italic font-sans font-black">
              for supplements.
            </span>
          </h1>

          <p className="text-[#8f8f9e] text-sm sm:text-base font-normal max-w-md mx-auto text-center leading-relaxed">
            Audit labels across stores. True cost-per-gram. One-click checkout with Prava Virtual Cards.
          </p>
        </FadeIn>

        {/* 3-STEP PIPELINE — COMPACT */}
        <FadeIn className="w-full grid grid-cols-3 gap-3 max-w-4xl mx-auto" delay={100}>
          {[
            { icon: Layers, color: "text-cyan-400", label: "Build Stack", desc: "Add 4-5 supplements" },
            { icon: Award, color: "text-blue-400", label: "Cost Audit", desc: "GPT-4o scans labels" },
            { icon: Shield, color: "text-indigo-400", label: "Prava Card", desc: "Auto-expires after use" },
          ].map(({ icon: Icon, color, label, desc }, i) => (
            <div key={i} className="p-3 rounded-xl bg-[#121217] border border-[#22222c] flex items-center gap-3">
              <Icon className={`w-4 h-4 ${color} shrink-0`} />
              <div>
                <span className={`text-[11px] font-bold ${color}`}>{label}</span>
                <p className="text-[10px] text-[#8f8f9e]">{desc}</p>
              </div>
            </div>
          ))}
        </FadeIn>

        {/* BENTO GRID */}
        <FadeIn className="w-full" delay={150}>
          <div id="stack-builder" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* STACK BUILDER (5 COLS) */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl bg-[#121217] border border-[#22222c] p-5 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-[#22222c]">
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Stack Builder</h2>
                    <p className="text-[11px] text-[#8f8f9e]">Add supplements to audit across merchants</p>
                  </div>
                  <span className="text-[11px] text-cyan-300 font-mono font-bold bg-gradient-to-r from-cyan-500/10 to-blue-500/10 px-2.5 py-0.5 rounded-full border border-cyan-400/30">
                    {stackCart.length}
                  </span>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); addItemToCart(searchInput); }} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#646473]" />
                    <input type="text" placeholder="Add supplement..." value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-xs focus:outline-none focus:border-cyan-400 transition-colors font-medium" />
                  </div>
                  <button type="submit" className="px-3 py-2 rounded-lg bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs transition-all cursor-pointer flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </form>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {stackCart.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-[#08080a] border border-[#1e1e28] hover:border-cyan-500/40 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
                        <span className="text-[11px] font-semibold text-white">{item}</span>
                      </div>
                      <button onClick={() => removeItemFromCart(idx)} className="text-[#646473] hover:text-rose-400 p-0.5 transition-colors cursor-pointer">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <button onClick={handleAuditEntireStack} disabled={isAuditing || stackCart.length === 0}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-[11px] uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/25 hover:scale-[1.02]">
                  {isAuditing ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Auditing...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5 fill-slate-950 stroke-[2.5]" /> Audit Stack ({stackCart.length})</>
                  )}
                </button>
              </div>
            </div>

            {/* LOG TERMINAL (7 COLS) */}
            <div id="audit-log" className="lg:col-span-7">
              <AgentReasoningFeed logs={reasoningLogs} isSearching={isAuditing || isCheckoutExecuting} />
            </div>
          </div>
        </FadeIn>

        {/* SKELETON LOADING */}
        {isAuditing && (
          <section className="w-full">
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
          </section>
        )}

        {/* RESULTS */}
        {auditedProducts.length > 0 && (
          <FadeIn className="w-full space-y-4">
            <div className="rounded-2xl bg-[#121217] border border-[#22222c] p-6 space-y-5 shadow-2xl">
              {/* SAVINGS BANNER */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-cyan-500/8 via-blue-500/8 to-indigo-500/8 border border-cyan-400/20">
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
                  <span className="text-[11px] font-bold text-cyan-300 bg-cyan-500/10 px-4 py-2.5 rounded-lg border border-cyan-400/30 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Complete · Card Expired
                  </span>
                ) : (
                  <button onClick={() => setIsPasskeyModalOpen(true)}
                    className="py-3 px-5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-cyan-500/20 hover:scale-105">
                    Authorize & Checkout <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                )}
              </div>
            </div>
          </FadeIn>
        )}

        {/* FAQ */}
        <FadeIn className="w-full max-w-3xl mx-auto space-y-3" delay={100}>
          <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">
            <Info className="w-3.5 h-3.5 text-cyan-400" /> FAQ
          </div>
          <div className="space-y-2">
            {faqs.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div key={idx} className="rounded-xl bg-[#121217] border border-[#22222c] overflow-hidden">
                  <button onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-3.5 text-left flex justify-between items-center text-xs font-bold text-white hover:text-cyan-300 transition-colors cursor-pointer">
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-[#8f8f9e] transition-transform duration-200 ${isOpen ? "rotate-180 text-cyan-400" : ""}`} />
                  </button>
                  <div className="overflow-hidden transition-all duration-300 ease-in-out" style={{ maxHeight: isOpen ? "200px" : "0px", opacity: isOpen ? 1 : 0 }}>
                    <div className="px-3.5 pb-3.5 text-[11px] text-[#8f8f9e] leading-relaxed border-t border-[#1e1e28] pt-2.5">{faq.a}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </FadeIn>
      </main>

      <Footer />

      <PasskeyModal isOpen={isPasskeyModalOpen} onClose={() => setIsPasskeyModalOpen(false)}
        products={auditedProducts} totalAmountUSD={auditedTotal} onAuthorized={handlePasskeyAuthorized} />
    </div>
  );
}
