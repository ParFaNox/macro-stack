"use client";

import { AgentReasoningLog } from "@/types";
import { Activity, CheckCircle2, Shield, Cpu, ShoppingBag, Terminal } from "lucide-react";

interface Props {
  logs: AgentReasoningLog[];
  isSearching: boolean;
}

export function AgentReasoningFeed({ logs, isSearching }: Props) {
  return (
    <div className="rounded-2xl bg-[#121217] border border-[#22222c] p-6 space-y-4 font-mono text-xs shadow-2xl">
      <div className="flex items-center justify-between pb-3.5 border-b border-[#22222c]">
        <div className="flex items-center gap-2 text-white font-medium text-xs">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-sans font-semibold tracking-wide">Live Audit Engine Log</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isSearching ? "bg-cyan-400 animate-ping" : "bg-[#333340]"}`}></span>
          <span className="text-[10px] text-[#8f8f9e] font-mono uppercase tracking-wider">
            {isSearching ? "ACTIVE AUDIT" : "STANDBY"}
          </span>
        </div>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <div className="text-[#646473] py-14 text-center text-xs font-mono">
            System standing by. Click "Audit Entire Stack" to initiate label OCR scan.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-3.5 rounded-xl bg-[#08080a] border border-[#1e1e28] space-y-1.5 shadow-sm"
            >
              <div className="flex items-center justify-between text-[10px] text-[#8f8f9e]">
                <span className="font-bold text-cyan-400 uppercase tracking-wider">{log.step}</span>
                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-200 leading-relaxed text-xs font-mono">{log.message}</p>
              {log.metadata && (
                <pre className="mt-2 p-2.5 rounded-lg bg-[#121217] text-cyan-300 font-mono text-[10px] overflow-x-auto border border-[#22222c]">
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
