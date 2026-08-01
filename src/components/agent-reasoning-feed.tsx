"use client";

import { AgentReasoningLog } from "@/types";
import { Activity, CheckCircle2, AlertTriangle, Shield, Cpu, ShoppingBag, Terminal } from "lucide-react";

interface Props {
  logs: AgentReasoningLog[];
  isSearching: boolean;
}

export function AgentReasoningFeed({ logs, isSearching }: Props) {
  const getStepIcon = (step: string) => {
    switch (step) {
      case "LABEL_AUDIT":
        return <Cpu className="w-4 h-4 text-cyan-400" />;
      case "COST_CALCULATION":
        return <Activity className="w-4 h-4 text-purple-400" />;
      case "STACK_OPTIMIZATION":
        return <CheckCircle2 className="w-4 h-4 text-indigo-400" />;
      case "CARD_MINTING":
        return <Shield className="w-4 h-4 text-emerald-400" />;
      case "CHECKOUT_AUTOMATION":
        return <ShoppingBag className="w-4 h-4 text-pink-400" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="rounded-3xl bg-slate-900/90 border border-indigo-500/20 p-6 shadow-2xl backdrop-blur-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white tracking-wide uppercase flex items-center gap-2">
              Autonomous Agent Terminal
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">GPT-4o Vision • MCP Audit Server • Prava SDK</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 border border-indigo-500/30">
          <span className="relative flex h-2.5 w-2.5">
            {isSearching && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            )}
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400"></span>
          </span>
          <span className="text-[10px] font-bold font-mono text-cyan-300">
            {isSearching ? "AGENT EXECUTING..." : "LIVE LOG STREAM"}
          </span>
        </div>
      </div>

      <div className="space-y-3.5 max-h-96 overflow-y-auto pr-2 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-slate-500 italic py-12 text-center flex flex-col items-center gap-3">
            <Cpu className="w-8 h-8 text-indigo-500/40 animate-bounce" />
            <span>Agent standing by. Adjust parameters to initiate vision audit...</span>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-950/80 border border-indigo-500/15 hover:border-indigo-500/40 transition-all duration-300 shadow-md"
            >
              <div className="mt-0.5 p-1.5 rounded-lg bg-slate-900 border border-slate-800">{getStepIcon(log.step)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                  <span className="font-bold text-cyan-400 tracking-wider">{log.step}</span>
                  <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-slate-200 font-medium text-xs leading-relaxed">{log.message}</p>
                {log.metadata && (
                  <pre className="mt-2 p-2.5 rounded-lg bg-slate-900/90 text-cyan-300 text-[10px] border border-slate-800 overflow-x-auto">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
