"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ExternalLink, RefreshCw } from "lucide-react";

import type { Health, Integration } from "@/app/api/status/route";

/**
 * The honest status board.
 *
 * Written for someone who has never seen this project: it says which parts are
 * really talking to a third party right now and which are running offline, and
 * lets them fix the one thing that matters (linking the Prava agent) without
 * touching a terminal.
 *
 * It deliberately does NOT round anything up to green. A demo that claims to be
 * live while serving canned data is the failure mode this page exists to stop.
 */

const TONE: Record<Health, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  live: { icon: CheckCircle2, cls: "text-emerald-400", label: "LIVE" },
  degraded: { icon: AlertTriangle, cls: "text-amber-400", label: "OFFLINE MODE" },
  off: { icon: XCircle, cls: "text-rose-400", label: "NOT CONNECTED" },
};

export default function SetupPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [summary, setSummary] = useState({ live: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setIntegrations(data.integrations);
      setSummary(data.summary);
    } catch {
      setError("Could not read local status. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * The approval happens on Prava's domain, which we cannot observe, so the
   * window is opened synchronously (a popup blocker eats anything opened after
   * an await) and we poll our own status endpoint until it flips.
   */
  const connect = async () => {
    setError(null);
    setLinking(true);
    const popup = window.open("", "_blank");

    try {
      const res = await fetch("/api/prava/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reach Prava");

      setLinkUrl(data.linkUrl);
      if (popup) popup.location.href = data.linkUrl;

      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const status = await (await fetch("/api/prava/link")).json();
        if (status.linked) {
          await refresh();
          setLinkUrl(null);
          return;
        }
      }
      setError("Link not approved within 5 minutes. Start again when you are ready.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Linking failed");
    } finally {
      setLinking(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#08080a] text-white px-4 sm:px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold tracking-tight">System status</h1>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 text-[11px] text-[#8f8f9e] hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> refresh
          </button>
        </div>
        <p className="text-sm text-[#8f8f9e] leading-relaxed mb-8">
          What is genuinely connected on this machine right now.{" "}
          <span className="text-[#c8c8d4]">
            {summary.live} of {summary.total} integrations live.
          </span>{" "}
          Anything not live falls back to something that works offline, and says so in its results
          rather than pretending.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-[#8f8f9e]">
            <Loader2 className="w-4 h-4 animate-spin" /> reading configuration…
          </div>
        )}

        <div className="space-y-3">
          {integrations.map((i) => {
            const tone = TONE[i.health];
            const Icon = tone.icon;
            return (
              <div
                key={i.id}
                className="rounded-xl bg-[#121217] border border-[#22222c] px-4 py-3.5 flex gap-3"
              >
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${tone.cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-bold">{i.name}</span>
                    <span className={`text-[9px] font-mono tracking-wider ${tone.cls}`}>
                      {tone.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8f8f9e] mt-1 leading-relaxed">{i.detail}</p>

                  {i.action === "Connect agent" && i.id === "prava-agent" && (
                    <button
                      onClick={connect}
                      disabled={linking}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 px-3 py-1.5 text-[11px] font-bold transition-colors"
                    >
                      {linking ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> waiting for approval…
                        </>
                      ) : (
                        <>
                          Connect agent <ExternalLink className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {linkUrl && (
          <div className="mt-4 rounded-xl bg-[#121217] border border-emerald-500/25 p-4">
            <p className="text-[11px] text-[#8f8f9e] leading-relaxed">
              Approve in the window that opened. If it was blocked, open this link and click
              approve:
            </p>
            <a
              href={linkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-mono text-cyan-400 hover:underline break-all"
            >
              {linkUrl}
            </a>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/25 p-4 text-[11px] text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-10 rounded-xl bg-[#121217] border border-[#22222c] p-5">
          <h2 className="text-sm font-bold mb-3">What to do first</h2>
          <ol className="space-y-2.5 text-[11px] text-[#8f8f9e] leading-relaxed list-decimal list-inside">
            <li>
              Connect the Prava agent above — that is what turns the 15 example products into real
              listings from real merchants.
            </li>
            <li>
              Go to{" "}
              <Link href="/agent" className="text-cyan-400 hover:underline">
                the agent
              </Link>
              , tell it what you want in plain English, and watch which tools it decides to call.
            </li>
            <li>
              Approve the stack it proposes. That mints a single-use Prava card capped at the exact
              amount, drives a real checkout, and then proves the card cannot be charged again.
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
