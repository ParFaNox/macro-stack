"use client";

import Link from "next/link";
import { FadeIn } from "@/components/fade-in";
import { Sparkles, ArrowRight } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased selection:bg-cyan-400 selection:text-slate-950 flex flex-col items-center justify-center p-6">
      <FadeIn className="w-full max-w-md" delay={100}>
        <div className="rounded-3xl bg-[#121217] border border-[#22222c] p-8 space-y-8 shadow-2xl">
          <div className="text-center space-y-2">
            <Link href="/" className="inline-flex items-center gap-2 group mb-4">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Sparkles className="h-4 w-4 text-cyan-400 stroke-[2.5]" />
              </div>
            </Link>
            <h1 className="text-2xl font-serif italic tracking-tight text-white">Welcome back</h1>
            <p className="text-xs text-[#8f8f9e]">Sign in to access your saved stacks</p>
          </div>

          <form className="space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">Email</label>
              <input type="email" placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-sm focus:outline-none focus:border-cyan-400 transition-colors" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">Password</label>
              <input type="password" placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-sm focus:outline-none focus:border-cyan-400 transition-colors" />
            </div>
            <Link href="/profile"
              className="w-full block text-center py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-cyan-500/20 hover:scale-105">
              Sign In
            </Link>
          </form>

          <div className="text-center text-xs text-[#8f8f9e]">
            Don't have an account? <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 font-bold">Sign up</Link>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
