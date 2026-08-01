"use client";

import { AgentReasoningLog } from "@/types";
import { Activity, CheckCircle2, Shield, Cpu, ShoppingBag, Terminal } from "lucide-react";

interface Props {
  logs: AgentReasoningLog[];
  isSearching: boolean;
}

export function AgentReasoningFeed({ logs, isSearching }: Props) {
  const getStepIcon = (step: string) => {
    switch (step) {
      case "LABEL_AUDIT":
        return <Cpu className="w-3.5 h-3.5 text-cyan-400" />;
      case "COST_CALCULATION":
        return <Activity className="w-3.5 h-3.5 text-emerald-400" />;
      case "STACK_OPTIMIZATION":
        return <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />;
      case "CARD_MINTING":
        return <Shield className="w-3.5 h-3.5 text-amber-400" />;
      case "CHECKOUT_AUTOMATION":
        return <ShoppingBag className="w-3.5 h-3.5 text-blue-400" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="rounded-xl bg-[#0d0e15] border border-slate-800 p-5 font-mono text-xs shadow-xl">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Live Audit Terminal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isSearching ? "bg-emerald-400 animate-ping" : "bg-slate-600"}`}></span>
          <span className="text-[10px] text-slate-400">
            {isSearching ? "Agent active..." : "Idle"}
          </span>
        </div>
      </div>

      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 text-[11px]">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic py-8 text-center">
            Standing by. Add items to your stack and click "Audit Entire Stack".
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded-md bg-[#090a0f] border border-slate-800/60 font-mono text-slate-300 space-y-1"
            >
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1.5 font-medium text-slate-400">
                  {getStepIcon(log.step)} {log.step}
                </span>
                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-200 leading-normal">{log.message}</p>
              {log.metadata && (
                <pre className="mt-1 p-2 rounded bg-slate-950 text-emerald-400 text-[10px] overflow-x-auto">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
