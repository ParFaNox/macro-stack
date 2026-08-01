"use client";

import { AgentReasoningLog } from "@/types";
import { Activity, CheckCircle2, Shield, Cpu, ShoppingBag, Terminal } from "lucide-react";

interface Props {
  logs: AgentReasoningLog[];
  isSearching: boolean;
}

export function AgentReasoningFeed({ logs, isSearching }: Props) {
  return (
    <div className="rounded-2xl bg-[#0c0c0e] border border-[#1c1c1e] p-6 space-y-4 font-sans text-xs">
      <div className="flex items-center justify-between pb-3 border-b border-[#1c1c1e]">
        <div className="flex items-center gap-2 text-white font-medium">
          <Terminal className="w-4 h-4 text-[#86868b]" />
          <span>Audit Engine Logs</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isSearching ? "bg-emerald-400 animate-pulse" : "bg-[#2c2c2e]"}`}></span>
          <span className="text-[11px] text-[#86868b]">
            {isSearching ? "Processing..." : "Ready"}
          </span>
        </div>
      </div>

      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <div className="text-[#6e6e73] py-12 text-center text-xs">
            System standing by. Click "Audit Entire Stack" to initiate OCR.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-3.5 rounded-xl bg-[#161618] border border-[#2c2c2e] space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px] text-[#86868b]">
                <span className="font-semibold text-white uppercase tracking-wider">{log.step}</span>
                <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-[#f5f5f7] leading-relaxed text-xs">{log.message}</p>
              {log.metadata && (
                <pre className="mt-2 p-2.5 rounded-lg bg-[#000000] text-emerald-400 font-mono text-[10px] overflow-x-auto border border-[#2c2c2e]">
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
