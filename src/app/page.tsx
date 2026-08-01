"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { AgentReasoningFeed } from "@/components/agent-reasoning-feed";
import { PasskeyModal } from "@/components/passkey-modal";
import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";
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
  const savingsPercent = originalTotal > 0 ? Math.round((netSavings / originalTotal) * 100) : 0;

  const faqs = [
    {
      q: "How does MacroStack AI find the cheapest price?",
      a: "Our AI agent audits nutrition labels across stores (Amazon, iHerb, Vendor Direct), calculates true cost per active gram (ignoring deceptive filler scoops), and selects the lowest price deals.",
    },
    {
      q: "What does Prava Virtual Card do during checkout?",
      a: "The agent selects Subscribe & Save (unlocking 15-20% discounts). Prava issues a single-use card hard-capped to the exact total that expires immediately post-checkout, blocking future monthly auto-renewal charges.",
    },
    {
      q: "Are there any hidden fees or markups?",
      a: "Zero. MacroStack AI is 100% independent. You pay the exact merchant price.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased selection:bg-cyan-400 selection:text-slate-950 flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-16 space-y-20 flex flex-col items-center">
        {/* HERO SECTION */}
        <FadeIn className="w-full flex flex-col items-center text-center space-y-6 max-w-4xl mx-auto pt-4">
          <div className="inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-bold tracking-wide">
            <Zap className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400" /> Autonomous Multi-Item Stack Audit Engine
          </div>

          <h1 className="w-full text-5xl sm:text-7xl md:text-8xl font-serif italic tracking-tight text-white leading-none text-center">
            Stop overpaying <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent not-italic font-sans font-black">
              for supplements.
            </span>
          </h1>

          <p className="text-[#8f8f9e] text-base sm:text-xl font-normal max-w-xl mx-auto text-center leading-relaxed pt-2">
            Audit nutrition labels across stores, calculate true cost-per-gram, and checkout with single-use Prava Virtual Cards.
          </p>
        </FadeIn>

        {/* 3-STEP PIPELINE BAR */}
        <FadeIn className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto" delay={150}>
          <div className="p-4 rounded-2xl bg-[#121217] border border-[#22222c] space-y-1 text-center flex flex-col items-center">
            <div className="flex items-center justify-center gap-2 text-cyan-400 font-bold text-xs">
              <Layers className="w-4 h-4" /> 1. Build Stack Cart
            </div>
            <p className="text-[11px] text-[#8f8f9e] text-center">Add 4–5 supplements to audit all at once</p>
          </div>
          <div className="p-4 rounded-2xl bg-[#121217] border border-[#22222c] space-y-1 text-center flex flex-col items-center">
            <div className="flex items-center justify-center gap-2 text-blue-400 font-bold text-xs">
              <Award className="w-4 h-4" /> 2. True Cost Audit
            </div>
            <p className="text-[11px] text-[#8f8f9e] text-center">GPT-4o Vision scans active cost per gram</p>
          </div>
          <div className="p-4 rounded-2xl bg-[#121217] border border-[#22222c] space-y-1 text-center flex flex-col items-center">
            <div className="flex items-center justify-center gap-2 text-indigo-400 font-bold text-xs">
              <Shield className="w-4 h-4" /> 3. Prava One-Click Card
            </div>
            <p className="text-[11px] text-[#8f8f9e] text-center">Single-use card expires post-checkout</p>
          </div>
        </FadeIn>

        {/* BENTO GRID: STACK BUILDER CART & LIVE TERMINAL */}
        <FadeIn className="w-full" delay={200}>
          <div id="stack-builder" className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* STACK BUILDER CART (5 COLS) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-3xl bg-[#121217] border border-[#22222c] p-7 space-y-6 shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between pb-4 border-b border-[#22222c]">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">Stack Builder</h2>
                    <p className="text-xs text-[#8f8f9e]">Add items to audit entire stack across merchants</p>
                  </div>
                  <span className="text-xs text-cyan-300 font-mono font-bold bg-gradient-to-r from-cyan-500/10 to-blue-500/10 px-3 py-1 rounded-full border border-cyan-400/30">
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
                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#646473]" />
                    <input
                      type="text"
                      placeholder="Search & add custom supplement..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-xs focus:outline-none focus:border-cyan-400 transition-colors font-medium"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs transition-all cursor-pointer flex items-center gap-1 shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </form>

                {/* ITEM STACK LIST */}
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {stackCart.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#08080a] border border-[#1e1e28] hover:border-cyan-500/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
                        <span className="text-xs font-semibold text-white">{item}</span>
                      </div>
                      <button
                        onClick={() => removeItemFromCart(idx)}
                        className="text-[#646473] hover:text-rose-400 p-1 transition-colors cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* BLUE GRADIENT MAIN AUDIT BUTTON */}
                <button
                  onClick={handleAuditEntireStack}
                  disabled={isAuditing || stackCart.length === 0}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/25 hover:scale-[1.02]"
                >
                  {isAuditing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Auditing Entire Stack...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-slate-950 stroke-[2.5]" /> Audit Entire Stack ({stackCart.length} Items)
                    </>
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

        {/* SKELETON LOADING STATE WHILE AUDITING */}
        {isAuditing && (
          <section className="w-full space-y-6 pt-4">
            <div className="rounded-3xl bg-[#121217] border border-[#22222c] p-8 space-y-6 shadow-2xl">
              <div className="flex justify-between items-end pb-6 border-b border-[#22222c]">
                <div className="space-y-2">
                  <div className="skeleton-pulse h-3 w-24"></div>
                  <div className="skeleton-pulse h-7 w-56"></div>
                </div>
                <div className="space-y-2 items-end flex flex-col">
                  <div className="skeleton-pulse h-3 w-32"></div>
                  <div className="skeleton-pulse h-7 w-28"></div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-4 rounded-2xl bg-[#08080a] border border-[#1e1e28] space-y-3">
                    <div className="skeleton-pulse h-4 w-20"></div>
                    <div className="skeleton-pulse h-4 w-40"></div>
                    <div className="skeleton-pulse h-3 w-full"></div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* RESULTS & PRAVA CHECKOUT */}
        {auditedProducts.length > 0 && (
          <FadeIn className="w-full space-y-6 pt-4">
            <div className="rounded-3xl bg-[#121217] border border-[#22222c] p-8 space-y-6 shadow-2xl">
              {/* SAVINGS CALLOUT CHIP */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/15 to-blue-500/15 border border-cyan-400/30">
                  <TrendingDown className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-black text-cyan-300">
                    You save ${netSavings.toFixed(2)} ({savingsPercent}%) on your entire stack
                  </span>
                </div>
                <span className="text-[10px] text-[#646473]">vs. buying each item at full retail price</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#22222c] pb-6">
                <div>
                  <span className="text-xs uppercase tracking-wider text-[#8f8f9e] font-bold font-mono">Audit Complete</span>
                  <h3 className="text-3xl font-black text-white mt-1">Cheapest Store Matches</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#8f8f9e] block font-medium">Total Audited Stack Price</span>
                  <div className="flex items-baseline gap-2 justify-end">
                    <span className="text-lg font-mono text-[#646473] line-through">${originalTotal.toFixed(2)}</span>
                    <span className="text-3xl font-mono font-bold text-cyan-400">${auditedTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {auditedProducts.map((prod) => (
                  <div key={prod.id} className="p-4 rounded-2xl bg-[#08080a] border border-[#1e1e28] space-y-2">
                    <span className="text-[10px] font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30">
                      {prod.vendorName}
                    </span>
                    <h4 className="text-sm font-bold text-white">{prod.productName}</h4>
                    <div className="flex justify-between text-xs font-mono pt-1 text-slate-300">
                      <span>Subscribe & Save</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#646473] line-through">${prod.totalPriceUSD.toFixed(2)}</span>
                        <span className="text-cyan-400 font-bold">${prod.discountedPriceUSD.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* PRAVA ACTION BAR */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#22222c]">
                <div className="flex items-center gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-white block">One-Click Prava Virtual Card</span>
                    <span className="text-[#8f8f9e]">Card hard-capped to ${auditedTotal.toFixed(2)} & auto-expires post-checkout</span>
                  </div>
                </div>

                {checkoutComplete ? (
                  <span className="text-xs font-bold text-cyan-300 bg-cyan-500/10 px-5 py-3 rounded-xl border border-cyan-400/30 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" /> All Checkouts Placed & Card Expired
                  </span>
                ) : (
                  <button
                    onClick={() => setIsPasskeyModalOpen(true)}
                    className="py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-cyan-500/20 hover:scale-105"
                  >
                    Authorize Passkey & Checkout <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </button>
                )}
              </div>
            </div>
          </FadeIn>
        )}

        {/* ACCORDION FAQ SECTION */}
        <FadeIn className="w-full max-w-3xl mx-auto space-y-4 pt-4" delay={100}>
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#8f8f9e] uppercase tracking-wider text-center">
            <Info className="w-4 h-4 text-cyan-400" /> Frequently Asked Questions
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div key={idx} className="rounded-2xl bg-[#121217] border border-[#22222c] overflow-hidden">
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-4 text-left flex justify-between items-center text-xs font-bold text-white hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#8f8f9e] transition-transform duration-200 ${isOpen ? "rotate-180 text-cyan-400" : ""}`}
                    />
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isOpen ? "200px" : "0px", opacity: isOpen ? 1 : 0 }}
                  >
                    <div className="px-4 pb-4 text-xs text-[#8f8f9e] leading-relaxed border-t border-[#1e1e28] pt-3">
                      {faq.a}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </FadeIn>
      </main>

      <Footer />

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
