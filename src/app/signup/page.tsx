"use client";

import Link from "next/link";
import { FadeIn } from "@/components/fade-in";
import { Sparkles, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function SignupPage() {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (item: string) => {
    if (selected.includes(item)) {
      setSelected(selected.filter(i => i !== item));
    } else {
      setSelected([...selected, item]);
    }
  };

  const supplements = [
    "Creatine", "Whey Protein", "Fish Oil", "Vitamin D", "Magnesium", 
    "Beta-Alanine", "L-Citrulline", "Electrolytes", "Ashwagandha", "Zinc"
  ];

  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased selection:bg-cyan-400 selection:text-slate-950 flex flex-col items-center justify-center p-6">
      <FadeIn className="w-full max-w-xl" delay={100}>
        <div className="rounded-3xl bg-[#121217] border border-[#22222c] p-8 space-y-8 shadow-2xl">
          <div className="text-center space-y-2">
            <Link href="/" className="inline-flex items-center gap-2 group mb-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Sparkles className="h-4 w-4 text-cyan-400 stroke-[2.5]" />
              </div>
            </Link>
            <h1 className="text-2xl font-serif italic tracking-tight text-white">Join MacroStack</h1>
            <p className="text-xs text-[#8f8f9e]">Stop overpaying for supplements today.</p>
          </div>

          <form className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">Full Name</label>
                <input type="text" placeholder="John Doe"
                  className="w-full px-4 py-3 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-sm focus:outline-none focus:border-cyan-400 transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">Email</label>
                <input type="email" placeholder="you@example.com"
                  className="w-full px-4 py-3 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-sm focus:outline-none focus:border-cyan-400 transition-colors" />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">What supplements do you currently take?</label>
              <div className="flex flex-wrap gap-2">
                {supplements.map(item => {
                  const isSel = selected.includes(item);
                  return (
                    <button type="button" key={item} onClick={() => toggle(item)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer border ${
                        isSel 
                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-300" 
                        : "bg-[#08080a] border-[#22222c] text-[#8f8f9e] hover:border-[#646473]"
                      }`}>
                      {item}
                    </button>
                  )
                })}
              </div>
            </div>

            <Link href="/profile"
              className="w-full block text-center py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-cyan-500/20 hover:scale-105">
              Create Account
            </Link>
          </form>

          <div className="text-center text-xs text-[#8f8f9e]">
            Already have an account? <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-bold">Sign in</Link>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
