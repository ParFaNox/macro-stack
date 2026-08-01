"use client";

import { Navbar } from "@/components/navbar";
import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased selection:bg-cyan-400 selection:text-slate-950 flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10 space-y-10 flex flex-col items-center">
        <FadeIn className="w-full max-w-4xl mx-auto" delay={100}>
          <div className="rounded-2xl bg-[#121217] border border-[#22222c] p-6 shadow-2xl space-y-6">
            <h2 className="text-2xl font-serif italic tracking-tight text-white">Your Savings Profile</h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Saved", value: "$247.80" },
                { label: "Stacks Audited", value: "12" },
                { label: "Avg Savings", value: "17%" },
                { label: "Member Since", value: "Jul 2025" },
              ].map((stat, i) => (
                <div key={i} className="p-4 rounded-xl bg-[#08080a] border border-[#1e1e28]">
                  <span className="text-[10px] text-[#8f8f9e] block mb-1 uppercase tracking-wider">{stat.label}</span>
                  <span className="text-xl font-mono font-bold text-cyan-400">{stat.value}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#22222c] pt-6">
              <h3 className="text-sm font-bold text-white mb-4">Past Audits</h3>
              <div className="space-y-3">
                {[
                  { date: "July 28, 2025", items: 5, saved: "$67.20" },
                  { date: "June 15, 2025", items: 3, saved: "$52.10" },
                  { date: "May 22, 2025", items: 4, saved: "$38.50" },
                ].map((audit, i) => (
                  <div key={i} className="flex justify-between items-center p-4 rounded-xl bg-[#08080a] border border-[#1e1e28]">
                    <div>
                      <span className="text-sm font-bold text-white block">{audit.date}</span>
                      <span className="text-xs text-[#8f8f9e]">{audit.items} items stack</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-cyan-400">Saved {audit.saved}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>
      </main>

      <Footer />
    </div>
  );
}
