"use client";

import { AgentReasoningLog } from "@/types";
import { Activity, CheckCircle2, Shield, Cpu, ShoppingBag, Terminal } from "lucide-react";

interface Props {
  logs: AgentReasoningLog[];
  isSearching: boolean;
}

export function AgentReasoningFeed({ logs, isSearching }: Props) {
  return (
    <div className="rounded-2xl bg-[#f5f5f7] border border-[#e5e5e7] p-6 space-y-4 font-sans text-xs">
      <div className="flex items-center justify-between pb-3 border-b border-[#e5e5e7]">
        <div className="flex items-center gap-2 text-[#1d1d1f] font-semibold">
          <Terminal className="w-4 h-4 text-[#86868b]" />
          <span>Audit Engine Log</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isSearching ? "bg-[#0071e3] animate-pulse" : "bg-[#86868b]"}`}></span>
          <span className="text-[11px] text-[#86868b]">
            {isSearching ? "Processing..." : "Standby"}
          </span>
        </div>
      </div>

      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <div className="text-[#86868b] py-12 text-center text-xs font-normal">
            System standing by. Click "Audit Entire Stack" to initiate label OCR.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-3.5 rounded-xl bg-white border border-[#e5e5e7] space-y-1"
            >
              <div className="flex items-center justify-between text-[11px] text-[#86868b]">
                <span className="font-semibold text-[#1d1d1f] uppercase tracking-wider">{log.step}</span>
                <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-[#1d1d1f] leading-relaxed text-xs font-normal">{log.message}</p>
              {log.metadata && (
                <pre className="mt-2 p-2.5 rounded-lg bg-[#f5f5f7] text-[#0071e3] font-mono text-[10px] overflow-x-auto border border-[#e5e5e7]">
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
