"use client";

import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#08080a]/85 backdrop-blur-xl border-b border-[#181820]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 border border-cyan-400/30 flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-cyan-500/20">
            <Sparkles className="h-3.5 w-3.5 text-white stroke-[2.5]" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white font-sans">
            MacroStack<span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">.ai</span>
          </span>
        </Link>

        <nav className="flex items-center gap-8 text-xs font-medium text-[#8f8f9e]">
          <a href="#stack-builder" className="hover:text-white transition-colors">Stack Builder</a>
          <a href="#audit-log" className="hover:text-white transition-colors">Live Audit</a>
          <div className="flex items-center gap-2 text-white bg-[#121217] px-3.5 py-1.5 rounded-full text-[11px] font-semibold border border-[#22222c] shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Prava Protected</span>
          </div>
        </nav>
      </div>
    </header>
  );
}
