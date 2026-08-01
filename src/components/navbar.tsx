"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#0c0c0e]/80 backdrop-blur-md border-b border-[#1c1c1f]">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-base tracking-tight text-white hover:opacity-80 transition-opacity">
          MacroStack
        </Link>

        <nav className="flex items-center gap-8 text-xs font-normal text-[#8e8e93]">
          <a href="#stack-builder" className="hover:text-white transition-colors">Stack Builder</a>
          <a href="#audit-log" className="hover:text-white transition-colors">Audit Engine</a>
          <div className="flex items-center gap-1.5 text-white bg-[#1c1c1e] px-3 py-1 rounded-full text-[11px] font-medium border border-[#2c2c2e]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0a84ff]" />
            <span>Prava Passkey</span>
          </div>
        </nav>
      </div>
    </header>
  );
}
