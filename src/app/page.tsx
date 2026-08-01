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
  ShieldAlert,
  CheckCircle2,
  ArrowRight,
  Zap,
  RefreshCw,
  Check,
  TrendingUp,
  ShieldCheck,
  Star,
  Lock,
  ExternalLink,
  Store,
  ShoppingCart,
  Scale
} from "lucide-react";

export default function Dashboard() {
  const [budgetUSD, setBudgetUSD] = useState<number>(85);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([
    "Creatine Monohydrate",
    "L-Citrulline",
    "Beta-Alanine",
  ]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isCheckoutExecuting, setIsCheckoutExecuting] = useState(false);
  const [reasoningLogs, setReasoningLogs] = useState<AgentReasoningLog[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<SupplementProduct[]>([]);
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);

  const availableIngredients = [
    "Creatine Monohydrate",
    "L-Citrulline",
    "Beta-Alanine",
    "Whey Protein Isolate",
    "Electrolytes",
    "Ashwagandha KSM-66",
  ];

  const toggleIngredient = (ingredient: string) => {
    if (selectedIngredients.includes(ingredient)) {
      setSelectedIngredients(selectedIngredients.filter((i) => i !== ingredient));
    } else {
      setSelectedIngredients([...selectedIngredients, ingredient]);
    }
  };

  const handleRunOptimization = async () => {
    setIsOptimizing(true);
    setReasoningLogs([]);
    setRecommendedProducts([]);
    setCheckoutComplete(false);

    const log1: AgentReasoningLog = {
      id: "log_1",
      timestamp: new Date().toISOString(),
      step: "LABEL_AUDIT",
      status: "INFO",
      message: "Scanning stores (Amazon, iHerb, Bodybuilding.com, Vendor Direct)...",
    };
    setReasoningLogs([log1]);

    setTimeout(() => {
      const log2: AgentReasoningLog = {
        id: "log_2",
        timestamp: new Date().toISOString(),
        step: "COST_CALCULATION",
        status: "INFO",
        message: "Audited true cost-per-gram: Creatine ($0.04/g), L-Citrulline ($0.07/g). Ranked lowest price across 4 stores.",
      };
      setReasoningLogs((prev) => [...prev, log2]);
    }, 900);

    setTimeout(() => {
      const mockProducts: SupplementProduct[] = [
        {
          id: "prod_1",
          brand: "NutraPure",
          productName: "Unflavored Creatine Monohydrate (500g)",
          imageUrl: "/creatine.jpg",
          labelImageUrl: "/creatine_label.jpg",
          totalPriceUSD: 29.99,
          servingsPerContainer: 100,
          activeIngredients: [{ name: "Creatine Monohydrate", amountPerServingGrams: 5.0, purityPercentage: 99.8 }],
          costPerGramActiveUSD: 0.06,
          subscribeAndSaveDiscountPct: 15,
          discountedPriceUSD: 25.49,
          checkoutUrl: "https://iherb.com/creatine-500g",
          vendorName: "iHerb (Cheapest Store)",
        },
        {
          id: "prod_2",
          brand: "Apex Performance",
          productName: "Pure L-Citrulline + Beta-Alanine Power Stack",
          imageUrl: "/citrulline.jpg",
          labelImageUrl: "/citrulline_label.jpg",
          totalPriceUSD: 44.99,
          servingsPerContainer: 60,
          activeIngredients: [
            { name: "L-Citrulline", amountPerServingGrams: 6.0, purityPercentage: 99.2 },
            { name: "Beta-Alanine", amountPerServingGrams: 3.2, purityPercentage: 98.9 },
          ],
          costPerGramActiveUSD: 0.08,
          subscribeAndSaveDiscountPct: 20,
          discountedPriceUSD: 35.99,
          checkoutUrl: "https://vendor-direct.com/citrulline",
          vendorName: "Vendor Direct (Cheapest Store)",
        },
      ];

      const log3: AgentReasoningLog = {
        id: "log_3",
        timestamp: new Date().toISOString(),
        step: "STACK_OPTIMIZATION",
        status: "SUCCESS",
        message: "Optimal stack resolved! Cheapest store prices selected across stores.",
        metadata: { originalStoreTotal: "$74.98", discountedStoreTotal: "$61.48", netSavings: "$13.50 (18% off)" },
      };

      setReasoningLogs((prev) => [...prev, log3]);
      setRecommendedProducts(mockProducts);
      setIsOptimizing(false);
    }, 2000);
  };

  const handlePasskeyAuthorized = async (card: PravaCardDetails) => {
    setIsPasskeyModalOpen(false);
    setIsCheckoutExecuting(true);

    const logCard: AgentReasoningLog = {
      id: "log_4",
      timestamp: new Date().toISOString(),
      step: "CARD_MINTING",
      status: "SUCCESS",
      message: `Prava Single-Use Card Issued: ${card.cardNumber.slice(0, 4)} **** **** ${card.cardNumber.slice(-4)} (Hard-Capped at $61.48)`,
      metadata: { cardStatus: card.status, isSingleUse: card.isSingleUse },
    };
    setReasoningLogs((prev) => [...prev, logCard]);

    setTimeout(() => {
      const logPlaywright: AgentReasoningLog = {
        id: "log_5",
        timestamp: new Date().toISOString(),
        step: "CHECKOUT_AUTOMATION",
        status: "SUCCESS",
        message: "Playwright Headless browser automated store checkout at lowest price. Card expired safely.",
        metadata: { orderId: "ORD-998241", discountSecured: "20% Permanent Savings" },
      };
      setReasoningLogs((prev) => [...prev, logPlaywright]);
      setIsCheckoutExecuting(false);
      setCheckoutComplete(true);
    }, 1800);
  };

  const totalDiscountedUSD = recommendedProducts.reduce((acc, p) => acc + p.discountedPriceUSD, 0);

  return (
    <div className="min-h-screen bg-[#060812] text-slate-100 font-sans selection:bg-cyan-400 selection:text-slate-950 relative overflow-hidden">
      <div className="absolute top-[-15%] left-[25%] w-[600px] h-[600px] bg-gradient-to-tr from-cyan-500/15 via-indigo-600/20 to-purple-600/15 rounded-full blur-[160px] pointer-events-none"></div>

      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-16 relative z-10">
        {/* AGGREGATOR HERO */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-purple-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-bold tracking-wide">
              <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400" /> Autonomous Supplement Price Search & Purchasing Agent
            </div>

            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.1]">
              Find The Lowest <br />
              <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                Cost-Per-Active-Gram.
              </span>
            </h1>

            <p className="text-slate-300 text-lg leading-relaxed max-w-xl">
              MacroStack AI is an <strong className="text-white">autonomous price aggregator</strong>—we don't sell products. Our agent audits e-commerce stores (Amazon, iHerb, Vendor Direct), calculates true cost per active gram, and automates checkout using <strong className="text-white">Prava Virtual Cards</strong> to lock Subscribe & Save discounts safely.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-6 text-xs text-slate-400 font-medium border-t border-slate-800/80">
              <div className="flex items-center gap-2 text-slate-300">
                <Store className="w-4 h-4 text-cyan-400" /> Searches 20+ Major Stores
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Scale className="w-4 h-4 text-indigo-400" /> 100% Independent & Unbiased
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Lock className="w-4 h-4 text-purple-400" /> Prava Virtual Card Protection
              </div>
            </div>
          </div>

          {/* STORE COMPARISON MATRIX */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl bg-slate-900/90 border border-indigo-500/30 p-7 shadow-2xl backdrop-blur-2xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Store Price Comparison Audit</h3>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">LIVE AUDIT</span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                    <span className="text-slate-400">Amazon Marketplace</span>
                  </div>
                  <span className="text-slate-400 line-through">$34.99 / tub</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                    <span className="text-slate-400">Bodybuilding.com</span>
                  </div>
                  <span className="text-slate-400 line-through">$31.50 / tub</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/90 border border-cyan-400/40 shadow-lg shadow-cyan-500/10">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span className="text-white font-bold">iHerb (Direct Deal)</span>
                  </div>
                  <span className="text-cyan-400 font-bold">$25.49 / tub (Cheapest)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* OPTIMIZER CONTROLS */}
        <section id="optimizer" className="space-y-8 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-3xl bg-slate-900/90 border border-indigo-500/25 p-7 shadow-2xl backdrop-blur-2xl space-y-7">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h2 className="text-base font-bold text-white flex items-center gap-2.5">
                    <DollarSign className="w-5 h-5 text-cyan-400" /> Stack Constraints
                  </h2>
                  <span className="text-[10px] font-bold text-cyan-300">SEARCH AGGREGATOR</span>
                </div>

                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-300">Monthly Budget Cap</span>
                    <span className="text-2xl font-black font-mono text-cyan-400">${budgetUSD}</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="200"
                    step="5"
                    value={budgetUSD}
                    onChange={(e) => setBudgetUSD(Number(e.target.value))}
                    className="w-full h-2.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                <div className="space-y-3.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Target Active Ingredients
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    {availableIngredients.map((ingredient) => {
                      const isSelected = selectedIngredients.includes(ingredient);
                      return (
                        <button
                          key={ingredient}
                          onClick={() => toggleIngredient(ingredient)}
                          className={cn(
                            "text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all cursor-pointer flex items-center gap-2",
                            isSelected
                              ? "bg-indigo-500/20 border-cyan-400/50 text-cyan-300"
                              : "bg-slate-950/80 border-slate-800 text-slate-400"
                          )}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                          {ingredient}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={handleRunOptimization}
                  disabled={isOptimizing || selectedIngredients.length === 0}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 hover:from-cyan-300 hover:to-purple-400 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl shadow-cyan-500/25 transition-all cursor-pointer"
                >
                  {isOptimizing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" /> Searching Stores...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 fill-slate-950 stroke-[2.5]" /> Compare Stores & Optimize
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-7">
              <AgentReasoningFeed logs={reasoningLogs} isSearching={isOptimizing || isCheckoutExecuting} />
            </div>
          </div>
        </section>

        {/* AGGREGATED CHEAPEST STACK RESULTS */}
        {recommendedProducts.length > 0 && (
          <section className="space-y-6 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Cheapest Store Matches Found</h2>
                <p className="text-xs text-slate-400">Aggregated directly from third-party vendor checkouts</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Total Combined Cost</span>
                <span className="text-3xl font-black font-mono text-cyan-400">${totalDiscountedUSD.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {recommendedProducts.map((prod) => (
                <div
                  key={prod.id}
                  className="rounded-3xl bg-slate-900/80 border border-indigo-500/20 p-6 space-y-4 shadow-xl backdrop-blur-xl relative overflow-hidden"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-extrabold px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-400/30">
                        {prod.vendorName}
                      </span>
                      <h3 className="text-base font-bold text-white mt-2.5">{prod.productName}</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 line-through">${prod.totalPriceUSD.toFixed(2)}</span>
                      <div className="text-xl font-black font-mono text-cyan-400">${prod.discountedPriceUSD.toFixed(2)}</div>
                      <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        {prod.subscribeAndSaveDiscountPct}% Off Store Deal
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-800 text-xs font-mono text-slate-300">
                    <div className="flex justify-between">
                      <span>Store Checkout URL:</span>
                      <a href={prod.checkoutUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline flex items-center gap-1">
                        Direct Store Link <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* AUTOMATED PURCHASING WITH PRAVA */}
            <div className="p-7 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/30 flex flex-col md:flex-row items-center justify-between gap-5 shadow-2xl">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/40 flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-cyan-400" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Automate Purchases with Prava Virtual Cards</h4>
                  <p className="text-xs text-slate-400">
                    Agent executes checkouts across stores automatically. Prava card expires post-purchase to block auto-renewals.
                  </p>
                </div>
              </div>

              {checkoutComplete ? (
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm bg-cyan-500/10 border border-cyan-400/30 px-6 py-3.5 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400" /> Playwright Orders Placed & Prava Card Expired!
                </div>
              ) : (
                <button
                  onClick={() => setIsPasskeyModalOpen(true)}
                  className="py-4 px-7 rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2.5 shadow-xl shadow-cyan-500/20 transition-all cursor-pointer hover:scale-105"
                >
                  Authorize Passkey & Buy Stack <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              )}
            </div>
          </section>
        )}
      </main>

      <PasskeyModal
        isOpen={isPasskeyModalOpen}
        onClose={() => setIsPasskeyModalOpen(false)}
        products={recommendedProducts}
        totalAmountUSD={totalDiscountedUSD}
        onAuthorized={handlePasskeyAuthorized}
      />
    </div>
  );
}
