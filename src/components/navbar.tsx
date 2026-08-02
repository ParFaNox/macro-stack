"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  // The agent is the product, so it leads and is styled as the primary
  // destination. It was previously reachable only by typing the URL, which
  // meant a first-time visitor never found the one thing worth seeing.
  const navLinks = [
    { href: "/agent", label: "AI Agent", primary: true },
    { href: "/#stack-builder", label: "Stack Builder" },
    { href: "/compare", label: "Compare" },
    { href: "/setup", label: "Status" },
    { href: "/profile", label: "Profile" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#08080a]/90 backdrop-blur-xl border-b border-[#22222c]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Sparkles className="h-3 w-3 text-cyan-400 stroke-[2.5]" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">
            MacroStack<span className="text-cyan-400">.ai</span>
          </span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6 text-xs font-medium shrink-0">
          {navLinks.map(({ href, label, primary }) => (
            <Link
              key={href}
              href={href}
              // Secondary links hide on narrow screens: at ~560px they wrapped
              // and collided with the wordmark. The agent link always stays —
              // it is the whole point of the site.
              className={`${primary ? "inline" : "hidden sm:inline"} whitespace-nowrap transition-colors ${
                primary
                  ? pathname === href
                    ? "text-cyan-300"
                    : "text-cyan-400 hover:text-cyan-300"
                  : pathname === href
                    ? "text-white"
                    : "text-[#8f8f9e] hover:text-[#f0f0f5]"
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
