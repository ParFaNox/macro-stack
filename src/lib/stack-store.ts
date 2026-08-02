/**
 * Hands the user's stack from the landing page to /compare.
 *
 * sessionStorage rather than a URL query string: stacks can be long, and this
 * keeps the shareable URL clean. Both pages import these constants so the key
 * and defaults can't drift apart.
 */

export const STACK_STORAGE_KEY = 'macrostack:stack';

export const DEFAULT_BUDGET_USD = 250;

/**
 * Empty by default. The builder used to arrive pre-filled with five items,
 * which meant nobody ever actually built a stack — they just pressed Audit on
 * someone else's list.
 */
export const DEFAULT_STACK: string[] = [];

/** One-tap suggestions. Kept in sync with the catalog's ingredient families. */
export const SUGGESTED_INGREDIENTS: string[] = [
  'Creatine',
  'L-Citrulline',
  'Whey Protein',
  'Beta-Alanine',
  'Electrolytes',
];

/** Used when /compare is opened directly with nothing in the builder. */
export const EXAMPLE_STACK: string[] = ['Creatine', 'Whey Protein', 'Electrolytes'];

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
