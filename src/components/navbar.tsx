"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#ffffff]/80 backdrop-blur-md border-b border-[#e5e5e7]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-base tracking-tight text-[#1d1d1f] hover:opacity-70 transition-opacity">
          MacroStack
        </Link>

        <nav className="flex items-center gap-8 text-xs font-normal text-[#515154]">
          <a href="#stack-builder" className="hover:text-[#1d1d1f] transition-colors">Stack Builder</a>
          <a href="#audit-log" className="hover:text-[#1d1d1f] transition-colors">Audit Engine</a>
          <div className="flex items-center gap-1.5 text-[#1d1d1f] bg-[#f5f5f7] px-3 py-1 rounded-full text-[11px] font-medium border border-[#e5e5e7]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0071e3]" />
            <span>Prava Passkey</span>
          </div>
        </nav>
      </div>
    </header>
  );
}
