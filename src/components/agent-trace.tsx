"use client";

import { Brain, Wrench, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

import type { AgentEvent } from "@/lib/agent/agent-client";

/**
 * The agent's actual trace.
 *
 * Not a progress bar and not a scripted animation — every row here is a real
 * decision the model made or a real tool result it received. Tool arguments are
 * shown because "it called check_brand_trust on MassLine" is the interesting
 * part, and hiding it would make this indistinguishable from theatre.
 */

const TOOL_LABELS: Record<string, string> = {
  search_products: "Search",
  audit_supplement_label: "Read label",
  check_brand_trust: "Verify brand",
  calculate_true_cost: "Cost per gram",
  propose_stack: "Propose",
};

/** One-line summary of a tool result, so the trace stays readable. */
function summariseResult(name: string, result: unknown): { text: string; tone: "ok" | "warn" | "bad" } {
  const r = (result ?? {}) as Record<string, unknown>;

  if (typeof r.error === "string") return { text: r.error.slice(0, 90), tone: "bad" };

  if (name === "search_products") {
    if (typeof r.alreadySearched === "string") {
      return { text: `already searched ${r.alreadySearched}`, tone: "warn" };
    }
    const n = Number(r.found ?? 0);
    return { text: `${n} product${n === 1 ? "" : "s"} found`, tone: n > 0 ? "ok" : "warn" };
  }

  if (name === "audit_supplement_label") {
    const flags = (r.deceptiveLabellingFlags as string[]) ?? [];
    const filler = r.fillerPercentage;
    return flags.length
      ? { text: flags[0], tone: "bad" }
      : { text: `clean label · ${filler}% filler`, tone: "ok" };
  }

  if (name === "check_brand_trust") {
    const grade = String(r.grade ?? "?");
    return {
      text: `grade ${grade}${r.verified ? "" : " (unverified)"}`,
      tone: grade <= "B" ? "ok" : grade === "C" ? "warn" : "bad",
    };
  }

  if (name === "calculate_true_cost") {
    return { text: `$${r.costPerActiveGramUSD} per active gram`, tone: "ok" };
  }

  if (name === "propose_stack") {
    return r.accepted
      ? { text: `stack accepted · $${r.totalUSD}`, tone: "ok" }
      : { text: String(r.error ?? "rejected").slice(0, 90), tone: "warn" };
  }

  return { text: "done", tone: "ok" };
}

function argSummary(args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const v = a.ingredient ?? a.productId ?? a.brand;
  if (typeof v === "string") return v;
  if (Array.isArray(a.productIds)) return `${a.productIds.length} products`;
  return "";
}

export function AgentTrace({ events, running }: { events: AgentEvent[]; running: boolean }) {
  const visible = events.filter(
    (e) => e.type === "thinking" || e.type === "tool_call" || e.type === "tool_result" || e.type === "error",
  );

  const results = new Map(
    events.filter((e): e is Extract<AgentEvent, { type: "tool_result" }> => e.type === "tool_result").map((e) => [e.id, e]),
  );

  return (
    <div className="rounded-2xl bg-[#121217] border border-[#22222c] shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#22222c]">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold text-white">Agent reasoning</span>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#8f8f9e]">
          <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-cyan-400 animate-pulse" : "bg-[#333340]"}`} />
          {running ? "thinking" : "idle"}
        </span>
      </div>

      <div className="max-h-[560px] min-h-[180px] overflow-y-auto overscroll-contain p-4 space-y-2.5">
        {visible.length === 0 && (
          <p className="text-[11px] text-[#4a4a58] text-center py-8 leading-relaxed">
            Tell the agent what you want.
            <br />
            Every tool it chooses to call will show up here.
          </p>
        )}

        {visible.map((e, i) => {
          if (e.type === "thinking") {
            return (
              <div key={i} className="flex gap-2.5">
                <Brain className="w-3.5 h-3.5 text-cyan-400/70 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-200 leading-relaxed">{e.text}</p>
              </div>
            );
          }

          if (e.type === "error") {
            return (
              <div key={i} className="flex gap-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-rose-200 leading-relaxed">{e.message}</p>
              </div>
            );
          }

          if (e.type !== "tool_call") return null;

          const result = results.get(e.id);
          const summary = result ? summariseResult(e.name, result.result) : null;
          const arg = argSummary(e.args);

          // A failed call the agent then got right is self-correction, not a
          // fault. Showing it in red next to a successful proposal made a run
          // that worked look broken. It stays visible — watching the agent
          // recover is the interesting part — but reads as "retried".
          const recovered =
            summary?.tone === "bad" &&
            events.some(
              (o) =>
                o.type === "tool_result" &&
                o.name === e.name &&
                events.indexOf(o) > i &&
                !(o.result as { error?: unknown })?.error,
            );

          return (
            <div key={i} className="rounded-lg bg-[#08080a] border border-[#1e1e28] px-3 py-2 hover:border-[#2a2a38] transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="w-3 h-3 text-[#646473] shrink-0" />
                  <span className="text-[10px] font-bold text-cyan-300 shrink-0">
                    {TOOL_LABELS[e.name] ?? e.name}
                  </span>
                  {arg && <span className="text-[10px] font-mono text-[#8f8f9e] truncate">{arg}</span>}
                </div>
                {result ? (
                  <span className="text-[9px] font-mono text-[#4a4a58] shrink-0">{result.ms}ms</span>
                ) : (
                  <Loader2 className="w-3 h-3 text-cyan-400 animate-spin shrink-0" />
                )}
              </div>

              {summary && (
                <p
                  className={`text-[10px] mt-1 pl-5 leading-relaxed ${
                    summary.tone === "ok"
                      ? "text-emerald-300/85"
                      : summary.tone === "warn" || recovered
                        ? "text-amber-300/85"
                        : "text-rose-300/85"
                  }`}
                >
                  {summary.tone === "ok" ? "✓ " : recovered ? "↻ " : summary.tone === "warn" ? "! " : "✗ "}
                  {summary.text}
                  {recovered && <span className="text-[#646473]"> — retried successfully</span>}
                </p>
              )}
            </div>
          );
        })}

        {running && (
          <div className="flex items-center gap-2 text-[10px] text-[#646473] pl-1 pt-1">
            <Loader2 className="w-3 h-3 animate-spin" /> deciding what to do next…
          </div>
        )}
      </div>

      {!running && events.some((e) => e.type === "done") && (
        <div className="px-5 py-2.5 border-t border-[#22222c] flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-[#8f8f9e] font-mono">
            {(() => {
              const done = events.find((e): e is Extract<AgentEvent, { type: "done" }> => e.type === "done");
              return `${done?.iterations ?? 0} model turns · ${done?.toolCalls ?? 0} tool calls`;
            })()}
          </span>
        </div>
      )}
    </div>
  );
}
