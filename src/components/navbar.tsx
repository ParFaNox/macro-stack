"use client";

import Link from "next/link";
import { ShieldCheck, Sparkles, Terminal, Cpu, ArrowRight } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#090a0f]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-emerald-400 stroke-[2]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base tracking-tight text-slate-100">MacroStack</span>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              v2.4
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-md">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Prava Passkey Protected</span>
          </div>

          <a
            href="#stack-builder"
            className="py-1.5 px-3.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            Audit Stack <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
