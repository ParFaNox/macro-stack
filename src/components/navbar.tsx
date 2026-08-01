"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#000000]/90 backdrop-blur-md border-b border-[#161618]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-wider uppercase text-white hover:opacity-80 transition-opacity">
          MacroStack
        </Link>

        <nav className="flex items-center gap-8 text-xs tracking-wider uppercase font-medium text-[#86868b]">
          <a href="#stack-builder" className="hover:text-white transition-colors">Stack Builder</a>
          <a href="#audit-terminal" className="hover:text-white transition-colors">Audit Terminal</a>
          <div className="flex items-center gap-2 text-white bg-[#1c1c1e] px-3.5 py-1.5 rounded-full border border-[#2c2c2e]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] normal-case">Prava Protected</span>
          </div>
        </nav>
      </div>
    </header>
  );
}
