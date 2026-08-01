"use client";

import { useState } from "react";
import { ShieldCheck, Fingerprint, Lock, CheckCircle } from "lucide-react";
import { SupplementProduct, PravaCardDetails } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  products: SupplementProduct[];
  totalAmountUSD: number;
  onAuthorized: (card: PravaCardDetails) => void;
}

export function PasskeyModal({ isOpen, onClose, products, totalAmountUSD, onAuthorized }: Props) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePasskeyAuth = async () => {
    setIsAuthenticating(true);
    // Simulate WebAuthn Passkey prompt & Prava Virtual Card minting call
    setTimeout(() => {
      setIsAuthenticating(false);
      setIsSuccess(true);

      const mockPravaCard: PravaCardDetails = {
        cardId: `prv_card_${Math.random().toString(36).substring(2, 9)}`,
        cardNumber: "4000123456789010",
        expiryMonth: "12",
        expiryYear: "28",
        cvv: "888",
        cardHolderName: "MacroStack Buyer",
        billingZip: "90210",
        isSingleUse: true,
        status: "ACTIVE",
      };

      setTimeout(() => {
        onAuthorized(mockPravaCard);
      }, 1000);
    }, 1500);
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

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-base font-bold text-white">Passkey Verified & Card Minted!</h4>
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
                  <Lock className="w-4 h-4 animate-spin" /> Verifying Passkey...
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
