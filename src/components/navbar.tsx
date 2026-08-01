"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: "Stack Builder" },
    { href: "/compare", label: "Compare" },
    { href: "/profile", label: "Profile" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#08080a]/90 backdrop-blur-xl border-b border-[#22222c]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Sparkles className="h-3 w-3 text-cyan-400 stroke-[2.5]" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">
            MacroStack<span className="text-cyan-400">.ai</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-xs font-medium">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`transition-colors ${
                pathname === href ? "text-white" : "text-[#8f8f9e] hover:text-[#f0f0f5]"
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-slate-950 bg-white hover:bg-slate-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
          >
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}
