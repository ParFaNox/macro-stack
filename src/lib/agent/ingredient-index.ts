import { INGREDIENT_FAMILIES } from './catalog';

/**
 * Searchable supplement index for the stack builder's autocomplete.
 *
 * Users type "wey", "creatine mono", "citruline" — not the exact family name
 * the optimizer matches on. This maps the messy things people actually type
 * onto the families we can audit, and says plainly when something is not
 * auditable yet rather than letting them add it and discover that later.
 */

export interface IngredientSuggestion {
  /** What the user sees and what gets added to the stack. */
  label: string;
  /** Catalog family this resolves to, when it resolves at all. */
  family?: string;
  /** Shown as a subtitle in the dropdown. */
  hint: string;
  /** False when we can recognise the supplement but cannot yet price it. */
  auditable: boolean;
}

interface IndexEntry {
  label: string;
  family?: string;
  hint: string;
  aliases: string[];
}

const INDEX: IndexEntry[] = [
  {
    label: 'Creatine',
    family: 'Creatine',
    hint: 'Strength & power · 3 products',
    aliases: ['creatine', 'creatine monohydrate', 'mono', 'micronized creatine', 'creapure', 'kre-alkalyn'],
  },
  {
    label: 'Whey Protein',
    family: 'Whey Protein',
    hint: 'Protein · 3 products',
    aliases: ['whey', 'whey protein', 'whey isolate', 'whey concentrate', 'protein powder', 'protein', 'isolate', 'wpi', 'wpc'],
  },
  {
    label: 'L-Citrulline',
    family: 'L-Citrulline',
    hint: 'Pumps & blood flow · 3 products',
    aliases: ['citrulline', 'l-citrulline', 'citrulline malate', 'l citrulline', 'pump'],
  },
  {
    label: 'Beta-Alanine',
    family: 'Beta-Alanine',
    hint: 'Muscular endurance · 3 products',
    aliases: ['beta alanine', 'beta-alanine', 'betaalanine', 'carnosyn', 'tingles'],
  },
  {
    label: 'Electrolytes',
    family: 'Electrolytes',
    hint: 'Hydration · 3 products',
    aliases: ['electrolyte', 'electrolytes', 'hydration', 'sodium', 'potassium', 'magnesium', 'salt', 'lmnt'],
  },

  // Recognised but not yet priced. Listed on purpose: silently returning
  // nothing for a real supplement looks broken, whereas saying "not audited
  // yet" is information.
  { label: 'Ashwagandha', hint: 'Not audited yet — no pricing data', aliases: ['ashwagandha', 'ksm-66', 'ksm66', 'withania'] },
  { label: 'Omega-3 / Fish Oil', hint: 'Not audited yet — no pricing data', aliases: ['omega', 'omega 3', 'fish oil', 'epa', 'dha', 'krill'] },
  { label: 'Vitamin D3', hint: 'Not audited yet — no pricing data', aliases: ['vitamin d', 'd3', 'cholecalciferol'] },
  { label: 'Magnesium Glycinate', hint: 'Not audited yet — no pricing data', aliases: ['magnesium glycinate', 'mag glycinate'] },
  { label: 'Caffeine', hint: 'Not audited yet — no pricing data', aliases: ['caffeine', 'pre workout', 'preworkout', 'pre-workout'] },
  { label: 'Collagen', hint: 'Not audited yet — no pricing data', aliases: ['collagen', 'collagen peptides'] },
  { label: 'ZMA', hint: 'Not audited yet — no pricing data', aliases: ['zma', 'zinc magnesium'] },
];

/** Cheap subsequence match, so "ctrl" still finds "Citrulline". */
function subsequenceScore(query: string, target: string): number {
  let qi = 0;
  let gaps = 0;
  let lastHit = -1;

  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      if (lastHit >= 0) gaps += ti - lastHit - 1;
      lastHit = ti;
      qi++;
    }
  }
  if (qi < query.length) return 0;
  // Tighter matches score higher.
  return 1 / (1 + gaps);
}

/**
 * Ranks suggestions for a partial query.
 *
 * Ordering: exact prefix on the label, then prefix on an alias, then substring,
 * then subsequence. Auditable entries outrank ones we can only recognise, since
 * those are the ones that actually produce a result.
 */
export function suggestIngredients(query: string, limit = 6): IngredientSuggestion[] {
  const q = query.trim().toLowerCase();

  if (!q) {
    return INDEX.filter((e) => e.family)
      .slice(0, limit)
      .map(toSuggestion);
  }

  const scored = INDEX.map((entry) => {
    const label = entry.label.toLowerCase();
    const targets = [label, ...entry.aliases];

    let best = 0;
    for (const t of targets) {
      if (t === q) best = Math.max(best, 100);
      else if (t.startsWith(q)) best = Math.max(best, 80 - t.length * 0.1);
      else if (t.includes(q)) best = Math.max(best, 55 - t.length * 0.1);
      // Subsequence is the loosest signal and only earns a place for queries
      // long enough to be meaningful — otherwise two shared letters drags in
      // every entry, which is what made the first version list all five
      // families no matter what you typed.
      else if (q.length >= 3) best = Math.max(best, subsequenceScore(q, t) * 34);
    }

    // A small nudge, applied only to something that already matched, so it can
    // order two real hits but never rescue an irrelevant one.
    if (best > 0 && entry.family) best += 4;
    return { entry, score: best };
  })
    // 18 admits a one-gap subsequence like "wey" → "whey" while still
    // excluding entries that merely share a couple of letters.
    .filter((s) => s.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => toSuggestion(s.entry));
}

function toSuggestion(entry: IndexEntry): IngredientSuggestion {
  return {
    label: entry.label,
    ...(entry.family ? { family: entry.family } : {}),
    hint: entry.hint,
    auditable: Boolean(entry.family),
  };
}

/** Families the optimizer can actually price, for the quick-add chips. */
export const QUICK_ADD: string[] = INGREDIENT_FAMILIES;
