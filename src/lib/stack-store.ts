/**
 * Hands the user's stack from the landing page to /compare.
 *
 * sessionStorage rather than a URL query string: stacks can be long, and this
 * keeps the shareable URL clean. Both pages import these constants so the key
 * and defaults can't drift apart.
 */

export const STACK_STORAGE_KEY = 'macrostack:stack';

export const DEFAULT_BUDGET_USD = 250;

export const DEFAULT_STACK: string[] = [
  'Creatine Monohydrate (500g)',
  'L-Citrulline Malate (300g)',
  'Whey Protein Isolate (2lb)',
  'Beta-Alanine (200g)',
  'Electrolytes Complex (30 servings)',
];

export interface StoredStack {
  items: string[];
  budgetUSD: number;
}

export function saveStack(stack: StoredStack): void {
  try {
    sessionStorage.setItem(STACK_STORAGE_KEY, JSON.stringify(stack));
  } catch {
    // Private browsing or a full quota just means /compare uses its defaults.
  }
}
