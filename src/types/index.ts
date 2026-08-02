// --- 1. SUPPLEMENT & STACK SCHEMA ---
export interface ActiveIngredient {
  name: string;
  amountPerServingGrams: number;
  purityPercentage: number;
}

export interface SupplementProduct {
  id: string;
  brand: string;
  productName: string;
  imageUrl: string;
  labelImageUrl: string;
  totalPriceUSD: number;
  servingsPerContainer: number;
  activeIngredients: ActiveIngredient[];
  costPerGramActiveUSD: number;
  subscribeAndSaveDiscountPct: number;
  discountedPriceUSD: number;
  checkoutUrl: string;
  vendorName: string;
}

export interface StackOptimizationRequest {
  targetBudgetUSD: number;
  targetIngredients: string[];
  preferredBrands?: string[];
}

export interface BrandTrustSummary {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  verdict: string;
  signals: string[];
  citations: string[];
}

export interface StackOptimizationResult {
  recommendedProducts: SupplementProduct[];
  /** How many candidate products were actually compared. Shown in the UI so
   *  "best value" is scoped to what was searched, not implied market-wide. */
  productsCompared?: number;
  /** Where those candidates came from. */
  productSource?: 'PRAVA_SHOP_SEARCH' | 'LIVE_RETAIL_SEARCH' | 'SEED_CATALOG';
  /** Brand -> third-party trust verdict, keyed by SupplementProduct.brand.
   *  Absent when no trust signal was available. */
  brandTrust?: Record<string, BrandTrustSummary>;
  totalOriginalPriceUSD: number;
  totalDiscountedPriceUSD: number;
  totalSavingsUSD: number;
  confidenceScore: number;
  reasoningLogs: AgentReasoningLog[];
}

// --- 2. AGENT REASONING LOG SCHEMA ---
export type AgentLogStep = 'LABEL_AUDIT' | 'TRUST_VERIFICATION' | 'COST_CALCULATION' | 'STACK_OPTIMIZATION' | 'CARD_MINTING' | 'CHECKOUT_AUTOMATION';
export type AgentLogStatus = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface AgentReasoningLog {
  id: string;
  timestamp: string;
  step: AgentLogStep;
  status: AgentLogStatus;
  message: string;
  metadata?: Record<string, unknown>;
}

// --- 3. PRAVA CARD & CHECKOUT SCHEMA ---
export interface PravaCardRequest {
  amountUSD: number;
  merchantName: string;
  userPasskeySignature: string;
}

export interface PravaCardDetails {
  cardId: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cardHolderName: string;
  billingZip: string;
  isSingleUse: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'BLOCKED';
}

export interface CheckoutExecutionPayload {
  products: SupplementProduct[];
  shippingAddress: {
    fullName: string;
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
    email: string;
  };
  cardDetails: PravaCardDetails;
}

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  merchantName: string;
  amountChargedUSD: number;
  cardStatusAfterCheckout: 'EXPIRED_SAFELY' | 'FAILED';
  executionLogs: string[];
}
