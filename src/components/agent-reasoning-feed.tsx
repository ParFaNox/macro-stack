"use client";

import { AgentReasoningLog } from "@/types";
import { Terminal, Radio } from "lucide-react";

interface Props {
  logs: AgentReasoningLog[];
  isSearching: boolean;
}

export function AgentReasoningFeed({ logs, isSearching }: Props) {
  return (
    <div className="rounded-2xl bg-[#121217] border border-[#22222c] p-5 space-y-3 font-mono text-xs shadow-2xl h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[#22222c]">
        <div className="flex items-center gap-2 text-white font-medium text-xs">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-sans font-semibold tracking-wide">Live Audit Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isSearching ? "bg-cyan-400 animate-ping" : "bg-[#333340]"}`}></span>
          <span className="text-[10px] text-[#8f8f9e] font-mono uppercase tracking-wider">
            {isSearching ? "ACTIVE" : "STANDBY"}
          </span>
        </div>
      </div>

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="relative">
              <div className="h-12 w-12 rounded-xl bg-[#1a1a22] border border-[#22222c] flex items-center justify-center">
                <Radio className="w-5 h-5 text-[#333340]" />
              </div>
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#22222c] border-2 border-[#121217]"></div>
            </div>
            <span className="text-[#4a4a58] text-[11px] text-center leading-relaxed">
              Waiting for audit trigger.<br />
              Build your stack and hit Audit.
            </span>
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={log.id}
              className="p-3 rounded-xl bg-[#08080a] border border-[#1e1e28] space-y-1"
              style={{
                opacity: 1,
                animation: `fadeSlideIn 0.3s ease ${idx * 80}ms both`,
              }}
            >
              <div className="flex items-center justify-between text-[10px] text-[#8f8f9e]">
                <span className="font-bold text-cyan-400 uppercase tracking-wider">{log.step}</span>
                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-200 leading-relaxed text-[11px] font-mono">{log.message}</p>
              {log.metadata && (
                <pre className="mt-1.5 p-2 rounded-lg bg-[#121217] text-cyan-300 font-mono text-[10px] overflow-x-auto border border-[#22222c]">
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
