"use client";

import { useEffect, useState } from "react";

import { AgentReasoningFeed } from "@/components/agent-reasoning-feed";
import { streamOptimizeStack } from "@/lib/agent/client";
import type { AgentReasoningLog, SupplementProduct } from "@/types";

/**
 * Live agent console (Teammate 2).
 *
 * A separate route on purpose: `/compare` belongs to Teammate 1 and still runs
 * their mock, so editing it would collide with their branch. This page drives
 * the real `/api/optimize` endpoint end to end — live Gemini label audits,
 * genuine cost-per-active-gram ranking, streamed reasoning logs.
 */

const CARD = "rounded-2xl bg-[#121217] border border-[#22222c] shadow-2xl";

export default function AgentConsolePage() {
  const [families, setFamilies] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [budget, setBudget] = useState(200);

  const [logs, setLogs] = useState<AgentReasoningLog[]>([]);
  const [products, setProducts] = useState<SupplementProduct[]>([]);
  const [summary, setSummary] = useState<{
    original: number;
    discounted: number;
    saved: number;
    confidence: number;
  } | null>(null);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<string>("…");
  const [cacheInfo, setCacheInfo] = useState<string>("");

  useEffect(() => {
    fetch("/api/optimize")
      .then((r) => r.json())
      .then((d) => {
        setFamilies(d.availableIngredients ?? []);
        setSelected(d.availableIngredients ?? []);
      })
      .catch(() => setError("Could not reach /api/optimize — is the dev server running?"));

    fetch("/api/labels")
      .then((r) => r.json())
      .then((d) => {
        setMode(d.visionMode === "LIVE_VISION_MODEL" ? `Gemini · ${d.model}` : "Offline mock");
        setCacheInfo(`${d.liveCachedAudits}/${d.totalLabels} labels have a live reading cached`);
      })
      .catch(() => undefined);
  }, []);

  const toggle = (f: string) =>
    setSelected((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  async function run() {
    setRunning(true);
    setError(null);
    setLogs([]);
    setProducts([]);
    setSummary(null);

    try {
      await streamOptimizeStack(
        { targetBudgetUSD: budget, targetIngredients: selected },
        {
          onLog: (log) => setLogs((prev) => [...prev, log]),
          onResult: (result) => {
            setProducts(result.recommendedProducts);
            setSummary({
              original: result.totalOriginalPriceUSD,
              discounted: result.totalDiscountedPriceUSD,
              saved: result.totalSavingsUSD,
              confidence: result.confidenceScore,
            });
          },
          onError: (m) => setError(m),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Optimization failed");
    } finally {
      setRunning(false);
    }
  }

  const liveAudits = logs.filter((l) => l.metadata?.source === "LIVE_VISION_MODEL").length;
  const mockAudits = logs.filter((l) => l.metadata?.source === "DETERMINISTIC_MOCK").length;

  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased">
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-black text-white">Agent Console</h1>
          <p className="text-sm text-[#8f8f9e]">
            Live label auditing and cost-per-active-gram optimization — the real{" "}
            <code className="text-cyan-300">/api/optimize</code> pipeline, not a mock.
          </p>
          <div className="flex flex-wrap gap-2 pt-2 text-[10px]">
            <span className="px-2 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 font-bold">
              Vision: {mode}
            </span>
            {cacheInfo && (
              <span className="px-2 py-1 rounded-full bg-[#1a1a22] border border-[#22222c] text-[#8f8f9e]">
                {cacheInfo}
              </span>
            )}
          </div>
        </header>

        {/* Controls */}
        <section className={`${CARD} p-5 space-y-4`}>
          <div>
            <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">
              Target ingredients
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {families.map((f) => {
                const on = selected.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() => toggle(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      on
                        ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-300"
                        : "bg-[#08080a] border-[#22222c] text-[#646473] hover:text-white"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">
              Budget: <span className="text-cyan-300 font-mono">${budget}</span>
            </label>
            <input
              type="range"
              min={20}
              max={400}
              step={5}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full mt-2 accent-cyan-400"
            />
          </div>

          <button
            onClick={run}
            disabled={running || selected.length === 0}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 text-slate-950 font-black text-[11px] uppercase tracking-wider disabled:opacity-40 cursor-pointer hover:scale-[1.01] transition-transform"
          >
            {running ? "Auditing labels…" : `Run live audit (${selected.length} ingredients)`}
          </button>

          {error && (
            <p className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
              {error}
            </p>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <AgentReasoningFeed logs={logs} isSearching={running} />
            {(liveAudits > 0 || mockAudits > 0) && (
              <p className="text-[10px] text-[#646473] mt-2 font-mono">
                {liveAudits} live model reading{liveAudits === 1 ? "" : "s"}
                {mockAudits > 0 && ` · ${mockAudits} offline fallback${mockAudits === 1 ? "" : "s"}`}
              </p>
            )}
          </div>

          <div className="lg:col-span-7 space-y-4">
            {summary && (
              <div className={`${CARD} p-5`}>
                <div className="flex flex-wrap gap-6">
                  <Stat label="Retail" value={`$${summary.original.toFixed(2)}`} strike />
                  <Stat label="After Subscribe & Save" value={`$${summary.discounted.toFixed(2)}`} accent />
                  <Stat label="Saved" value={`$${summary.saved.toFixed(2)}`} accent />
                  <Stat label="Confidence" value={summary.confidence.toFixed(2)} />
                </div>
              </div>
            )}

            {products.length > 0 && (
              <div className={`${CARD} p-5 space-y-3`}>
                <h2 className="text-sm font-black text-white">Selected stack</h2>
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-[#08080a] border border-[#1e1e28] space-y-1"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="text-xs font-bold text-white">{p.productName}</div>
                        <div className="text-[10px] text-[#8f8f9e]">
                          {p.brand} · {p.vendorName}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-[#646473] line-through font-mono">
                          ${p.totalPriceUSD.toFixed(2)}
                        </div>
                        <div className="text-sm text-cyan-400 font-mono font-bold">
                          ${p.discountedPriceUSD.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-[#121217] border border-[#22222c] text-cyan-300">
                        ${p.costPerGramActiveUSD.toFixed(4)}/g active
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#121217] border border-[#22222c] text-[#8f8f9e]">
                        {p.subscribeAndSaveDiscountPct}% S&amp;S
                      </span>
                      <a
                        href={p.labelImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 rounded bg-[#121217] border border-[#22222c] text-[#8f8f9e] hover:text-cyan-300"
                      >
                        view label →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  strike,
}: {
  label: string;
  value: string;
  accent?: boolean;
  strike?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] text-[#8f8f9e] uppercase tracking-wider">{label}</div>
      <div
        className={`text-xl font-mono font-bold ${
          accent ? "text-cyan-400" : strike ? "text-[#646473] line-through" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
