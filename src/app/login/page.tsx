"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FadeIn } from "@/components/fade-in";
import { Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error ?? "Sign in failed");
      setBusy(false);
      return;
    }
    router.push("/profile");
    router.refresh();
  }

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

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">Email</label>
              <input type="email" name="email" required placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-sm focus:outline-none focus:border-cyan-400 transition-colors" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">Password</label>
              <input type="password" name="password" required placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-sm focus:outline-none focus:border-cyan-400 transition-colors" />
            </div>
            {error && (
              <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy}
              className="w-full block text-center py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-cyan-500/20 hover:scale-105 disabled:opacity-50">
              {busy ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="text-center text-xs text-[#8f8f9e]">
            Don&apos;t have an account? <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 font-bold">Sign up</Link>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
