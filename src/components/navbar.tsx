"use client";

import Link from "next/link";
import { ShieldCheck, Sparkles, Terminal, Cpu, ArrowRight } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-indigo-500/20 bg-slate-950/80 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-purple-500 p-[1px] shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-all">
            <div className="h-full w-full bg-slate-950 rounded-[11px] flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-cyan-400 stroke-[2.5]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight text-white">MacroStack</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-400/30">
                PRO
              </span>
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-300">
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#roi-calculator" className="hover:text-white transition-colors">Savings Calculator</a>
          <a href="#purity-audit" className="hover:text-white transition-colors">Purity Index</a>
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-900/90 border border-indigo-500/30 px-3.5 py-2 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Prava Protected</span>
          </div>

          <a
            href="#optimizer"
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all hover:scale-105"
          >
            Start Free Audit <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
          </a>
        </div>
      </div>
    </header>
  );
}
