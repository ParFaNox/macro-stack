"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_BUDGET_USD, DEFAULT_STACK, SUGGESTED_INGREDIENTS, saveStack } from "@/lib/stack-store";
import { IngredientAutocomplete } from "@/components/ingredient-autocomplete";
import { Navbar } from "@/components/navbar";
import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";
import {
  Sparkles,
  Trash2,
  Zap,
  ChevronDown,
  Info,
  Layers,
  Award,
  Shield,
  RefreshCw,
} from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [stackCart, setStackCart] = useState<string[]>(DEFAULT_STACK);
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET_USD);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const addItemToCart = (item: string) => {
    if (!item.trim()) return;
    if (!stackCart.includes(item)) {
      setStackCart([...stackCart, item]);
    }
  };

  const removeItemFromCart = (index: number) => {
    setStackCart(stackCart.filter((_, i) => i !== index));
  };

  const handleAuditEntireStack = async () => {
    if (stackCart.length === 0) return;
    setIsAuditing(true);

    // Hand the stack to /compare, which runs the real audit against it.
    saveStack({ items: stackCart, budgetUSD: budget });
    router.push("/compare");
  };

  const faqs = [
    { q: "How does MacroStack find the best value?", a: "A vision model reads each product's supplement facts panel, we compute the true cost per gram of active ingredient (so filler and proprietary blends can't hide underdosing), weight it by third-party verification, and pick the best value that fits your budget. Today it compares a built-in demo catalog; connect a live product source and the same maths runs over real merchant listings." },
    { q: "What does the Prava Virtual Card do?", a: "It selects Subscribe & Save to unlock 15-20% discounts, then issues a single-use card that auto-expires post-checkout — blocking future auto-renewals." },
    { q: "Any hidden fees?", a: "None. You pay the merchant price. We take no cut and have no affiliate deals." },
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

        {/* 3-STEP PIPELINE */}
        <FadeIn className="w-full grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl mx-auto" delay={100}>
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

        {/* STACK BUILDER */}
        <FadeIn className="w-full max-w-2xl mx-auto" delay={150}>
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

            <IngredientAutocomplete onAdd={addItemToCart} existing={stackCart} />

            {/* One-tap suggestions. These are the ingredient families the
                optimizer can actually audit, so a first-time user is not left
                guessing what the box accepts. */}
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_INGREDIENTS.filter((s) => !stackCart.includes(s)).map((s) => (
                <button
                  key={s}
                  onClick={() => addItemToCart(s)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#22222c] bg-[#08080a] text-[#8f8f9e] hover:border-cyan-400/50 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  + {s}
                </button>
              ))}
            </div>

            {stackCart.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#22222c] p-5 text-center space-y-1">
                <p className="text-[11px] font-bold text-white">Your stack is empty</p>
                <p className="text-[10px] text-[#646473]">
                  Tap a suggestion above, or type any supplement and hit Add.
                </p>
              </div>
            )}

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

            <div className="pt-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="budget" className="text-[11px] font-semibold text-[#8f8f9e]">
                  Budget cap
                </label>
                <span className="text-[11px] font-mono font-bold text-cyan-300">${budget}</span>
              </div>
              <input
                id="budget"
                type="range"
                min={20}
                max={500}
                step={10}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <button onClick={handleAuditEntireStack} disabled={isAuditing || stackCart.length === 0}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-[11px] uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/25 hover:scale-[1.02]">
              {isAuditing ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Preparing Audit...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 fill-slate-950 stroke-[2.5]" /> Audit Stack ({stackCart.length})</>
              )}
            </button>
          </div>
        </FadeIn>

        {/* FAQ */}
        <FadeIn className="w-full max-w-3xl mx-auto space-y-3" delay={200}>
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
    </div>
  );
}
