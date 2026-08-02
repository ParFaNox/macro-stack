"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, ShieldCheck, ArrowRight, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

import { AgentTrace } from "@/components/agent-trace";
import { PasskeyModal } from "@/components/passkey-modal";
import { runAgentStream, type AgentEvent } from "@/lib/agent/agent-client";
import { executeCheckout, type MintedCardClient } from "@/lib/prava/client";
import type { CheckoutExecutionPayload, SupplementProduct } from "@/types";
import type { Integration } from "@/app/api/status/route";

/**
 * The agent console.
 *
 * You state a goal in plain English; a model decides which tools to call, in
 * what order, and why. Everything in the trace is a real decision — none of it
 * is scripted. When it proposes a stack you approve it, a Prava single-use card
 * is minted against that exact amount, a real browser completes the checkout,
 * and the card is retired so the subscription cannot renew.
 *
 * /compare runs the same tools in a fixed order without a model. That stays as
 * the fallback for when the agent is rate-limited.
 *
 * Lives in a component rather than on a page because it is the product, so it
 * is the first thing on the landing page AND the whole of /agent. Extracted
 * verbatim — the two surfaces must not drift into subtly different agents.
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

/**
 * `compact` drops the title and blurb. The landing page already has a hero
 * saying the same thing, and two <h1>s on one page is both a duplicated message
 * and bad structure for anything reading the document outline.
 */
export function AgentConsole({ compact = false }: { compact?: boolean }) {
  const [goal, setGoal] = useState(EXAMPLES[0]);
  const [budget, setBudget] = useState(120);

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modelInfo, setModelInfo] = useState<string>("");
  const [chips, setChips] = useState<Array<{ label: string; live: boolean; detail: string }>>([]);
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

      // Two integrations decide whether what you are about to watch is real:
      // where the products came from, and whether payments are live. Both are
      // already reported by /api/status, so the header just surfaces them.
      fetch("/api/status")
        .then((r) => r.json())
        .then((d: { integrations?: Integration[] }) =>
          setChips(
            (d.integrations ?? [])
              .filter((i) => i.id === "products" || i.id === "payments")
              .map((i) => ({
                label:
                  i.id === "products"
                    ? i.health === "live"
                      ? "real merchants"
                      : "example catalog"
                    : i.health === "live"
                      ? "prava sandbox"
                      : "simulated cards",
                live: i.health === "live",
                detail: i.detail,
              })),
          ),
        )
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
            email: "demo@macrostack.ai",
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
    <div className="w-full space-y-6">
        <header className="space-y-2.5">
          {!compact && (
            <>
              <h1 className="text-3xl font-black text-white tracking-tight leading-none">Agent</h1>
              <p className="text-sm text-[#8f8f9e] max-w-2xl leading-relaxed">
                Tell it what you want. It decides which products to look at, reads their labels,
                checks the brands, does the maths, and proposes a stack — then you approve the spend.
              </p>
            </>
          )}
          {/*
            What is actually live, on this machine, right now — read from the
            same status endpoint /setup uses. A bare model name told a visitor
            nothing about whether the products were real, which is the first
            thing anyone sensible asks.
          */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {modelInfo && (
              <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-[#121217] border border-[#22222c] text-[#8f8f9e]">
                {modelInfo}
              </span>
            )}
            {chips.map((c) => (
              <span
                key={c.label}
                title={c.detail}
                className={`text-[10px] font-mono px-2 py-1 rounded-full border cursor-default ${
                  c.live
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300/90"
                    : "bg-amber-500/10 border-amber-500/25 text-amber-300/90"
                }`}
              >
                <span className="opacity-60">{c.live ? "● " : "◌ "}</span>
                {c.label}
              </span>
            ))}
            <Link
              href="/setup"
              className="text-[10px] font-mono px-2 py-1 rounded-full border border-[#22222c] text-[#646473] hover:text-cyan-300 hover:border-cyan-400/40 transition-colors"
            >
              status →
            </Link>
          </div>
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
              className="w-full px-4 py-3 rounded-xl bg-[#08080a] border border-[#22222c] text-white placeholder-[#646473] text-sm leading-relaxed focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setGoal(ex)}
                  disabled={running}
                  className="px-2.5 py-1 rounded-full text-[10px] border border-[#22222c] bg-[#08080a] text-[#8f8f9e] hover:border-cyan-400/50 hover:text-cyan-300 focus-visible:outline-none focus-visible:border-cyan-400 focus-visible:text-cyan-300 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed max-w-full truncate"
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
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 text-slate-950 font-black text-[11px] uppercase tracking-wider shadow-lg shadow-blue-500/10 hover:brightness-110 hover:shadow-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121217] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 cursor-pointer transition-all duration-200 flex items-center justify-center gap-2"
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
              <div className={`${CARD} p-6 space-y-4`}>
                <p className="text-[11px] text-[#8f8f9e] leading-relaxed">
                  The agent&apos;s proposal appears here — what it picked, what it rejected, and
                  why.
                </p>
                <div className="space-y-2">
                  {[
                    ["Searches real merchants", "PEScience, Transparent Labs, Momentous, RYSE"],
                    ["Reads the supplement facts", "proprietary blends, filler, amino spiking"],
                    ["Does the arithmetic in code", "cost per gram of actual active ingredient"],
                    ["Buys with a card that dies", "single-use, capped, cannot be renewed against"],
                  ].map(([title, detail]) => (
                    <div key={title} className="flex gap-2.5">
                      <span className="text-cyan-400/60 text-[10px] mt-0.5 shrink-0">▸</span>
                      <p className="text-[10px] leading-relaxed">
                        <span className="text-[#c8c8d4] font-bold">{title}</span>
                        <span className="text-[#646473]"> — {detail}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/*
              A run takes about a minute. An empty panel for that long reads as
              a hang, so the shape of the answer is shown while the trace on the
              left does the talking.
            */}
            {!proposal && running && (
              <div className={`${CARD} p-5 space-y-3`}>
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  <span className="text-[11px] font-bold text-white">Working on your stack…</span>
                </div>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex gap-3 p-2.5 rounded-xl bg-[#08080a] border border-[#1e1e28] animate-pulse"
                    style={{ animationDelay: `${i * 180}ms` }}
                  >
                    <div className="w-[46px] h-[58px] rounded bg-[#141420] shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-2 rounded bg-[#141420] w-3/4" />
                      <div className="h-2 rounded bg-[#141420] w-1/2" />
                      <div className="h-2 rounded bg-[#141420] w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {proposal && (
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-sm font-black text-white">The agent proposes</h2>
                  <div className="text-right">
                    {proposal.savedUSD > 0.005 && (
                      <span className="text-[10px] text-[#646473] line-through font-mono mr-2">
                        ${proposal.retailUSD.toFixed(2)}
                      </span>
                    )}
                    <span className="text-xl font-mono font-bold text-cyan-400">
                      ${proposal.totalUSD.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/*
                  How much of the cap was used, shown rather than asserted. The
                  budget is the one promise the user is trusting, so "spent
                  $75.98 of your $120" is worth more than a line claiming it is
                  enforced somewhere they cannot see.
                */}
                <div className="space-y-1">
                  <div className="h-1 rounded-full bg-[#1e1e28] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-700"
                      style={{
                        width: `${Math.min(100, (proposal.totalUSD / budget) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-[#646473]">
                    <span>
                      ${proposal.totalUSD.toFixed(2)} of ${budget} cap
                    </span>
                    <span>
                      {proposal.savedUSD > 0.005
                        ? `saved $${proposal.savedUSD.toFixed(2)}`
                        : `$${(budget - proposal.totalUSD).toFixed(2)} left`}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-200 leading-relaxed bg-[#08080a] border border-[#1e1e28] rounded-xl p-3">
                  {proposal.reasoning}
                </p>

                <div className="space-y-2">
                  {proposal.products.map((p) => {
                    // Cheapest per active gram in this stack gets a marker. It is
                    // the number the whole product argues about, so it should be
                    // visible without reading four cards and comparing decimals.
                    const best =
                      proposal.products.length > 1 &&
                      p.costPerGramActiveUSD ===
                        Math.min(...proposal.products.map((o) => o.costPerGramActiveUSD));

                    return (
                      <div
                        key={p.id}
                        className="group flex gap-3 p-2.5 rounded-xl bg-[#08080a] border border-[#1e1e28] hover:border-[#2e2e3c] transition-colors"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.imageUrl}
                          alt={p.productName}
                          className="w-[46px] h-[58px] object-contain rounded bg-[#0b0b0f] border border-[#22222c] shrink-0"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2">
                            {/* The product name links to the real storefront. The
                                URL was already being fetched and thrown away —
                                a listed price nobody can go and check is just a
                                claim. */}
                            <a
                              href={p.checkoutUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-bold text-white truncate hover:text-cyan-300 transition-colors"
                              title={`Open ${p.productName} on ${p.vendorName}`}
                            >
                              {p.productName}
                              <ExternalLink className="inline w-2.5 h-2.5 ml-1 mb-0.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                            </a>
                            <span className="text-[11px] font-mono text-cyan-400 shrink-0">
                              ${p.discountedPriceUSD.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#8f8f9e] truncate">
                            {p.brand} · {p.vendorName}
                          </p>
                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[9px] font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded border ${
                                best
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                  : "bg-[#121217] border-[#22222c] text-cyan-300"
                              }`}
                            >
                              ${p.costPerGramActiveUSD.toFixed(4)}/g active
                            </span>
                            {best && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                                best value
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-[#121217] border border-[#22222c] text-[#8f8f9e]">
                              {p.servingsPerContainer} servings
                            </span>
                            <Link
                              href={p.labelImageUrl}
                              target="_blank"
                              className="px-1.5 py-0.5 rounded bg-[#121217] border border-[#22222c] text-[#8f8f9e] hover:text-cyan-300 transition-colors"
                            >
                              label →
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {proposal.rejected.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-[#8f8f9e] uppercase tracking-wider">
                      Considered and rejected
                    </p>
                    {proposal.rejected.map((r) => (
                      <div
                        key={r.productId}
                        className="flex gap-2 text-[10px] leading-relaxed rounded-lg bg-[#08080a] border border-[#1e1e28] px-2.5 py-1.5"
                      >
                        <span className="text-rose-400/70 shrink-0">✗</span>
                        <span className="min-w-0">
                          <span className="text-[#c8c8d4]">{r.productId}</span>
                          <span className="text-[#646473]"> — {r.why}</span>
                        </span>
                      </div>
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

      {/*
        Rendered inside the console, not beside it.
        It previously sat after </main> on the page, so extracting the console
        left it behind and "Approve & buy" flipped state with nothing on screen.
        It belongs with the state that drives it.
      */}
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
