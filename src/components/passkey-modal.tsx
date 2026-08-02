"use client";

import { useEffect, useRef, useState } from "react";
import type { PravaSDK as PravaSDKType } from "@prava-sdk/core";
import { ShieldCheck, Fingerprint, Lock, CheckCircle, AlertTriangle } from "lucide-react";
import { SupplementProduct, PravaCardDetails } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  products: SupplementProduct[];
  totalAmountUSD: number;
  onAuthorized: (card: PravaCardDetails) => void;
}

type Phase = "idle" | "creating_session" | "collecting_card" | "minting" | "success" | "error";

interface PravaSession {
  sessionId: string;
  sessionToken: string;
  iframeUrl: string;
}

export function PasskeyModal({ isOpen, onClose, products, totalAmountUSD, onAuthorized }: Props) {
  // Only mounted while open, so closing unmounts it and the next open starts
  // with fresh state automatically — no manual reset-on-close needed.
  if (!isOpen) return null;
  return (
    <PasskeyModalContent
      onClose={onClose}
      products={products}
      totalAmountUSD={totalAmountUSD}
      onAuthorized={onAuthorized}
    />
  );
}

function PasskeyModalContent({
  onClose,
  products,
  totalAmountUSD,
  onAuthorized,
}: Omit<Props, "isOpen">) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState<PravaSession | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<PravaSDKType | null>(null);

  // Destroy the mounted Prava iframe if this component unmounts mid-flow.
  useEffect(() => {
    return () => {
      sdkRef.current?.destroy();
      sdkRef.current = null;
    };
  }, []);

  // Mounts Prava's card-entry + passkey iframe once a session exists and the
  // container div has actually committed to the DOM. Card capture and
  // passkey/OTP verification both happen inside this iframe — there's no
  // WebAuthn code of our own to write here.
  useEffect(() => {
    if (phase !== "collecting_card" || !session || !containerRef.current) return;

    let cancelled = false;

    (async () => {
      const { PravaSDK } = await import("@prava-sdk/core");
      const sdk = new PravaSDK({
        publishableKey: process.env.NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY ?? "",
      });
      sdkRef.current = sdk;

      try {
        await sdk.collectPAN({
          sessionToken: session.sessionToken,
          iframeUrl: session.iframeUrl,
          container: containerRef.current!,
          onSuccess: async () => {
            if (cancelled) return;
            setPhase("minting");
            try {
              const res = await fetch("/api/prava/mint-card", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: session.sessionId }),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => null);
                throw new Error(err?.error ?? "Could not mint Prava card");
              }
              const card: PravaCardDetails = await res.json();
              if (cancelled) return;
              setPhase("success");
              setTimeout(() => onAuthorized(card), 800);
            } catch (err) {
              if (cancelled) return;
              setPhase("error");
              setErrorMessage(err instanceof Error ? err.message : "Card minting failed");
            }
          },
          onError: (err) => {
            if (cancelled) return;
            setPhase("error");
            setErrorMessage(err.message || "Card entry failed");
          },
        });
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setErrorMessage(err instanceof Error ? err.message : "Could not load the Prava card form");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session]);

  const startAuthorization = async () => {
    setPhase("creating_session");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/prava/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: products.map((p) => ({
            productName: p.productName,
            vendorName: p.vendorName,
            discountedPriceUSD: p.discountedPriceUSD,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Could not start Prava session");
      }
      const data: PravaSession = await res.json();
      setSession(data);
      setPhase("collecting_card");
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : "Could not start authorization");
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
            <h3 className="text-lg font-bold text-white">Prava Passkey Authorization</h3>
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

        {phase === "success" ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-base font-bold text-white">Passkey Verified & Card Minted!</h4>
            <p className="text-xs text-slate-400">Executing Playwright Subscribe & Save checkout automation...</p>
          </div>
        ) : phase === "error" ? (
          <div className="py-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">Authorization failed</h4>
            <p className="text-xs text-slate-400">{errorMessage}</p>
            <button
              onClick={startAuthorization}
              className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700"
            >
              Try Again
            </button>
            <button onClick={onClose} className="w-full py-2 text-xs text-slate-400 hover:text-white">
              Cancel
            </button>
          </div>
        ) : phase === "collecting_card" || phase === "minting" ? (
          <div className="space-y-3">
            <div ref={containerRef} className="min-h-[280px] rounded-xl overflow-hidden bg-white" />
            {phase === "minting" && (
              <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5 animate-spin" /> Minting single-use card…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={startAuthorization}
              disabled={phase === "creating_session"}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              {phase === "creating_session" ? (
                <>
                  <Lock className="w-4 h-4 animate-spin" /> Starting secure session...
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4 stroke-[2.5]" /> Approve & Mint Prava Card
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
      </div>
    </div>
  );
}
