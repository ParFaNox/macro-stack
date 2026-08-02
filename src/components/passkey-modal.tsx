"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Fingerprint, Lock, CheckCircle } from "lucide-react";
import { SupplementProduct } from "@/types";
import { authorizeAndMintCard, pollForCard, type MintedCardClient } from "@/lib/prava/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  products: SupplementProduct[];
  totalAmountUSD: number;
  onAuthorized: (card: MintedCardClient) => void;
}

export function PasskeyModal({ isOpen, onClose, products, totalAmountUSD, onAuthorized }: Props) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Drives the copy. Claiming "Passkey Verified" in simulated mode contradicts
  // the warning shown underneath it, so the wording follows the real mode.
  const [pravaEnv, setPravaEnv] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch("/api/prava/mint-card")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPravaEnv(d.pravaEnvironment ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const isSimulated = pravaEnv === "SIMULATED";

  if (!isOpen) return null;

  /**
   * Real authorization + mint. The server issues a challenge bound to this
   * amount and merchant, verifies the signature, and only then asks Prava for a
   * single-use credential capped at the approved total.
   */
  const handlePasskeyAuth = async () => {
    setIsAuthenticating(true);
    setError(null);

    // Open the popup synchronously, inside the click handler. Opening it after
    // the await gets blocked by popup blockers because the browser no longer
    // considers it user-initiated — which would silently break the real Prava
    // approval step. Navigated once the session exists; closed if not needed.
    const approvalWindow = !isSimulated
      ? window.open("about:blank", "prava-approval", "width=460,height=760")
      : null;

    try {
      const { card, session, passkeyMode, simulatedWarning } = await authorizeAndMintCard(
        Number(totalAmountUSD.toFixed(2)),
        "NutriMart (demo)",
        products.map((p) => ({
          description: p.productName,
          unitPrice: Number(p.discountedPriceUSD.toFixed(2)),
          quantity: 1,
        })),
      );

      if (passkeyMode === "SIMULATED" && simulatedWarning) setNotice(simulatedWarning);

      if (card) {
        approvalWindow?.close();
        setIsSuccess(true);
        onAuthorized(card);
        return;
      }

      if (!session) throw new Error("Prava returned neither a card nor an approval session.");

      // Prava issues the credential only after the user approves on their own
      // hosted surface. Open it and wait — never try to route around it.
      setNotice(
        "Complete card approval in the Prava window, then this continues automatically. " +
          "Use the sandbox card Prava emailed you (or one from their test-cards doc) · OTP 456789.",
      );

      if (approvalWindow && !approvalWindow.closed) {
        approvalWindow.location.href = session.iframeUrl;
      } else {
        // Blocked anyway — surface the link rather than stalling silently.
        setNotice(
          `Popup blocked. Open this to approve, then this continues automatically: ${session.iframeUrl}`,
        );
      }

      const approved = await pollForCard(session.sessionId, {
        onWait: (ms) =>
          setNotice(
            `Waiting for approval in the Prava window… (${Math.round(ms / 1000)}s)  ` +
              "Test card 4622 9431 2313 7789 · CVV 757 · exp 12/27 · OTP 456789.",
          ),
      });

      setNotice(null);
      setIsSuccess(true);
      onAuthorized(approved);
    } catch (e) {
      approvalWindow?.close();
      setError(e instanceof Error ? e.message : "Authorization failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500"></div>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Fingerprint className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {isSimulated ? "Authorize Purchase (Simulated)" : "Prava Passkey Authorization"}
            </h3>
            <p className="text-xs text-slate-400">Cryptographic approval for single-use virtual card</p>
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 mb-5 space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Authorized Total:</span>
            <span className="text-emerald-400 font-bold font-mono text-sm">${totalAmountUSD.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Card Type:</span>
            <span className="text-white font-medium">Prava Hard-Capped Disposable</span>
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Auto-Renewal Trap Protection:</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Active (Expires Post-Checkout)
            </span>
          </div>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-base font-bold text-white">
                {isSimulated ? "Authorization recorded · card minted" : "Passkey verified · card minted"}
              </h4>
            <p className="text-xs text-slate-400">Executing Playwright Subscribe & Save checkout automation...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handlePasskeyAuth}
              disabled={isAuthenticating}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              {isAuthenticating ? (
                <>
                  <Lock className="w-4 h-4 animate-spin" />{" "}
                  {isSimulated ? "Recording authorization…" : "Waiting for Prava approval…"}
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4 stroke-[2.5]" />{" "}
                  {isSimulated ? "Approve (simulated) & mint card" : "Approve with Prava & mint card"}
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Cancel Transaction
            </button>
          </div>
        )}
      
        {error && (
          <p className="mt-4 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
            {notice}
          </p>
        )}
</div>
    </div>
  );
}
