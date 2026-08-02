"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";

import { AgentTrace } from "@/components/agent-trace";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { PasskeyModal } from "@/components/passkey-modal";
import { runAgentStream, type AgentEvent } from "@/lib/agent/agent-client";
import { executeCheckout, type MintedCardClient } from "@/lib/prava/client";
import type { CheckoutExecutionPayload, SupplementProduct } from "@/types";

/**
 * The agent.
 *
 * You state a goal in plain English; a model decides which tools to call, in
 * what order, and why. Everything in the trace is a real decision — none of it
 * is scripted. When it proposes a stack you approve it, a Prava single-use card
 * is minted against that exact amount, a real browser completes the checkout,
 * and the card is retired so the subscription cannot renew.
 *
 * /compare runs the same tools in a fixed order without a model. That stays as
 * the fallback for when the agent is rate-limited.
 */

const CARD = "rounded-2xl bg-[#121217] border border-[#22222c] shadow-2xl";

const EXAMPLES = [
  "Build me a strength stack — creatine and whey. Don't let me get ripped off by filler.",
  "Cheapest creatine that isn't a proprietary blend",
  "Whey protein and electrolytes, but only brands that are third-party tested",
];

interface Proposal {
  products: SupplementProduct[];
  totalUSD: number;
  retailUSD: number;
  savedUSD: number;
  reasoning: string;
  rejected: Array<{ productId: string; why: string }>;
}

export default function AgentPage() {
  const [goal, setGoal] = useState(EXAMPLES[0]);
  const [budget, setBudget] = useState(120);

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modelInfo, setModelInfo] = useState<string>("");
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [orderIds, setOrderIds] = useState<string | null>(null);
  const [checkoutLog, setCheckoutLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      fetch("/api/agent")
        .then((r) => r.json())
        .then((d) => setModelInfo(`${d.model} · ${d.provider}`))
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function run() {
    setRunning(true);
    setEvents([]);
    setProposal(null);
    setError(null);
    setOrderIds(null);
    setCheckoutLog([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await runAgentStream(
        goal,
        budget,
        (e) => {
          setEvents((prev) => [...prev, e]);
          if (e.type === "proposal") setProposal(e);
          if (e.type === "error") setError(e.message);
        },
        controller.signal,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent run failed");
    } finally {
      setRunning(false);
    }
  }

  /** Approved: mint a capped card, drive the real checkout, retire the card. */
  async function onAuthorized(card: MintedCardClient) {
    if (!proposal) return;
    setPasskeyOpen(false);
    setBuying(true);
    setCheckoutLog([`Prava card ••••${card.cardNumber.slice(-4)} minted · capped at $${card.amountCapUSD.toFixed(2)} · ${card.environment}`]);

    try {
      const result = await executeCheckout(
        {
          products: proposal.products,
          shippingAddress: {
            fullName: "Alex Demo",
            streetAddress: "1 Market Street",
            city: "San Francisco",
            state: "CA",
            zipCode: "94105",
            email: "demo@macrostack.test",
          },
          cardDetails: card as unknown as CheckoutExecutionPayload["cardDetails"],
        },
        {
          onLog: (log) => setCheckoutLog((prev) => [...prev, log.message]),
          onError: (m) => setError(m),
        },
      );

      if (result?.success) setOrderIds(result.orderId ?? null);
      else setError("Checkout did not complete — see the log.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBuying(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight">Agent</h1>
          <p className="text-sm text-[#8f8f9e] max-w-2xl leading-relaxed">
            Tell it what you want. It decides which products to look at, reads their labels,
            checks the brands, does the maths, and proposes a stack — then you approve the spend.
          </p>
          {modelInfo && (
            <span className="inline-block text-[10px] font-mono px-2 py-1 rounded-full bg-[#121217] border border-[#22222c] text-[#8f8f9e]">
              {modelInfo}
            </span>
          )}
        </header>

        <section className={`${CARD} p-5 space-y-4`}>
          <div className="space-y-2">
            <label htmlFor="goal" className="text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">
              What do you want?
            </label>
            <textarea
              id="goal"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={running}
              className="w-full px-4 py-3 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-sm focus:outline-none focus:border-cyan-400 transition-colors resize-none disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setGoal(ex)}
                  disabled={running}
                  className="px-2.5 py-1 rounded-full text-[10px] border border-[#22222c] bg-[#08080a] text-[#8f8f9e] hover:border-cyan-400/50 hover:text-cyan-300 transition-colors cursor-pointer disabled:opacity-40 max-w-full truncate"
                >
                  {ex.length > 52 ? `${ex.slice(0, 52)}…` : ex}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="budget" className="flex justify-between text-[11px] font-bold text-[#8f8f9e] uppercase tracking-wider">
              <span>Budget cap</span>
              <span className="text-cyan-300 font-mono">${budget}</span>
            </label>
            <input
              id="budget"
              type="range"
              min={20}
              max={400}
              step={5}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              disabled={running}
              className="w-full mt-2 accent-cyan-400 cursor-pointer disabled:opacity-50"
            />
            <p className="text-[10px] text-[#646473] mt-1">
              Enforced in code, not trusted to the model — an over-budget proposal is rejected and
              sent back to the agent.
            </p>
          </div>

          <button
            onClick={run}
            disabled={running || goal.trim().length < 3}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 text-slate-950 font-black text-[11px] uppercase tracking-wider disabled:opacity-40 cursor-pointer hover:scale-[1.01] transition-transform flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5 fill-slate-950 stroke-[2.5]" />
            {running ? "Agent is working…" : "Run agent"}
          </button>

          {/*
            A recovered run is not a failed one. When the model drops out but we
            still produce a stack from its research, red text over a perfectly
            good $103.66 proposal reads as "this is broken" — so it is styled as
            a notice, and the offer to leave for /compare is dropped, because
            there is already an answer on screen.
          */}
          {error &&
            (proposal ? (
              <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 leading-relaxed">
                {error}
              </p>
            ) : (
              <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 leading-relaxed">
                {error}{" "}
                <Link href="/compare" className="font-bold underline">
                  Use the deterministic pipeline instead
                </Link>
              </p>
            ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6">
            <AgentTrace events={events} running={running} />
          </div>

          <div className="lg:col-span-6 space-y-4">
            {!proposal && !running && (
              <div className={`${CARD} p-8 text-center`}>
                <p className="text-[11px] text-[#4a4a58] leading-relaxed">
                  The agent&apos;s proposal will appear here,
                  <br />
                  with what it picked and what it rejected.
                </p>
              </div>
            )}

            {proposal && (
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-sm font-black text-white">The agent proposes</h2>
                  <div className="text-right">
                    <span className="text-[10px] text-[#646473] line-through font-mono mr-2">
                      ${proposal.retailUSD.toFixed(2)}
                    </span>
                    <span className="text-xl font-mono font-bold text-cyan-400">
                      ${proposal.totalUSD.toFixed(2)}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-200 leading-relaxed bg-[#08080a] border border-[#1e1e28] rounded-xl p-3">
                  {proposal.reasoning}
                </p>

                <div className="space-y-2">
                  {proposal.products.map((p) => (
                    <div key={p.id} className="flex gap-3 p-2.5 rounded-xl bg-[#08080a] border border-[#1e1e28]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.imageUrl}
                        alt={p.productName}
                        className="w-[46px] h-[58px] object-contain rounded bg-[#0b0b0f] border border-[#22222c] shrink-0"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <span className="text-[11px] font-bold text-white truncate">{p.productName}</span>
                          <span className="text-[11px] font-mono text-cyan-400 shrink-0">
                            ${p.discountedPriceUSD.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#8f8f9e]">
                          {p.brand} · {p.vendorName}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1 text-[9px] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-[#121217] border border-[#22222c] text-cyan-300">
                            ${p.costPerGramActiveUSD.toFixed(4)}/g active
                          </span>
                          <Link
                            href={p.labelImageUrl}
                            target="_blank"
                            className="px-1.5 py-0.5 rounded bg-[#121217] border border-[#22222c] text-[#8f8f9e] hover:text-cyan-300"
                          >
                            label →
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {proposal.rejected.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-[#8f8f9e] uppercase tracking-wider">
                      Rejected
                    </p>
                    {proposal.rejected.map((r) => (
                      <p key={r.productId} className="text-[10px] text-[#8f8f9e] leading-relaxed">
                        <span className="text-rose-400/80">✗</span>{" "}
                        <span className="font-mono text-[#646473]">{r.productId}</span> — {r.why}
                      </p>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-[#22222c] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                    <p className="text-[10px] text-[#8f8f9e] leading-relaxed">
                      Single-use card, capped at ${proposal.totalUSD.toFixed(2)}.
                      <br />
                      Retired after checkout so the subscription can&apos;t renew.
                    </p>
                  </div>

                  {orderIds ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[11px] font-bold text-cyan-300 bg-cyan-500/10 px-4 py-2.5 rounded-lg border border-cyan-400/30 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Bought · card retired
                      </span>
                      <Link
                        href={`/mock-merchant/confirmation?order=${encodeURIComponent(orderIds.split(",")[0].trim())}`}
                        className="text-[10px] font-bold text-cyan-300 hover:text-cyan-200"
                      >
                        Try the renewal charge →
                      </Link>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPasskeyOpen(true)}
                      disabled={buying}
                      className="py-3 px-5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 text-slate-950 font-black text-[11px] uppercase tracking-wider cursor-pointer flex items-center gap-2 disabled:opacity-50 shrink-0"
                    >
                      {buying ? "Buying…" : "Approve & buy"}
                      <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {checkoutLog.length > 0 && (
              <div className={`${CARD} p-4 space-y-1.5 max-h-64 overflow-y-auto`}>
                <p className="text-[10px] font-bold text-[#8f8f9e] uppercase tracking-wider">Checkout</p>
                {checkoutLog.map((l, i) => (
                  <p key={i} className="text-[10px] font-mono text-slate-300 leading-relaxed">
                    {l}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />

      <PasskeyModal
        isOpen={passkeyOpen}
        onClose={() => setPasskeyOpen(false)}
        products={proposal?.products ?? []}
        totalAmountUSD={proposal?.totalUSD ?? 0}
        onAuthorized={onAuthorized}
      />
    </div>
  );
}
