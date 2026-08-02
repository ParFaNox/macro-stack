import type { SupplementProduct } from '@/types';
import type { CatalogEntry } from '@/types/agent';

import { createBackend } from './model-backend';
import { calculateCostPerGram, toSupplementProduct } from './optimizer-engine';
import { mockAuditNutritionLabel } from './vision-auditor';
import { TOOLS_BY_NAME, type ToolContext } from './tools';

/**
 * The agent loop.
 *
 * This is the difference between "an app that uses AI" and "an agent". Nothing
 * below decides what to do — a model is given a goal and a toolbox, and it
 * chooses which tool to call, reads the result, and decides what to do next.
 * The previous implementation ran a fixed sequence I wrote by hand; this runs
 * whatever sequence the model reasons its way into.
 *
 * Guardrails, because autonomy without limits is just an outage:
 *  - hard iteration cap, so it cannot loop forever
 *  - hard tool-call cap, so it cannot burn model quota
 *  - the budget is enforced in `propose_stack`, not trusted to the model
 *  - no tool can spend money; buying stays behind the human approval gate
 */

/**
 * Argument values the model fabricated instead of reading from a tool result.
 * They look like schema field names, never like a real brand or product.
 */
const PLACEHOLDER = /^(brand|product|item)[_-]|_from_[a-z]+_search|placeholder|example_|your_/i;

const MAX_ITERATIONS = 12;
const MAX_TOOL_CALLS = 30;

const SYSTEM_PROMPT = `You are MacroStack, an autonomous supplement buying agent.

Your job: given a goal and a budget, find the best-value supplements the user can
actually trust, then propose a stack for them to approve.

What "best value" means here — this is the whole point, do not shortcut it:
- NOT the lowest sticker price. Supplement labels routinely hide underdosing
  behind proprietary blends, filler and inflated serving counts.
- The real metric is cost per gram of ACTUAL active ingredient, weighted by
  whether the brand can be trusted.

How to work:
1. search_products ONCE per ingredient. Searching the same thing again returns
   the same products and wastes a turn — if you have candidates, move on.
2. search_products already returns candidates sorted by cost per gram, cheapest
   first. Audit only the TWO cheapest per ingredient — the label tells you what
   is really in the tub, and a cheap product with a proprietary blend or amino
   spiking is not cheap. Auditing every candidate wastes the run.
3. calculate_true_cost before comparing anything. Never estimate cost per gram
   yourself — call the tool, it does real arithmetic.
4. check_brand_trust when a price looks too good, or a label raises a flag. A
   cheap product from a brand with an FDA warning letter is not a bargain.
5. propose_stack once, at the end, with your reasoning and what you rejected.

Be efficient with model turns — call several tools in ONE turn when they do not
depend on each other. Search every ingredient at once. Audit several candidates
at once.

But NEVER call audit_supplement_label, calculate_true_cost or propose_stack in
the same turn as a search. Those take a productId, and product ids only exist
after a search result comes back. If you have not seen an id in a tool result,
you do not have it — do not guess one, do not construct one, and do not write a
placeholder like "product_id_from_creatine_search". Search first, read the ids
it returns, then use them on your next turn.

You have a limited number of tool calls, so spend them on the shortlist, not
on every product. A good run is: two searches, four audits, four costings, two
or three trust checks, then propose. Think out loud briefly before each tool call so
the user can follow your reasoning — one or two sentences, not an essay.

If an ingredient has no products, say so plainly and continue with the rest
rather than inventing something.`;

export type AgentEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; id: string; name: string; summary: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown; ms: number }
  | {
      type: 'proposal';
      products: SupplementProduct[];
      totalUSD: number;
      retailUSD: number;
      savedUSD: number;
      reasoning: string;
      rejected: Array<{ productId: string; why: string }>;
    }
  | { type: 'error'; message: string }
  | { type: 'done'; iterations: number; toolCalls: number };

export interface AgentRunOptions {
  goal: string;
  budgetUSD: number;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export async function runAgent({ goal, budgetUSD, onEvent, signal }: AgentRunOptions): Promise<void> {
  const ctx: ToolContext = {
    discovered: new Map<string, CatalogEntry>(),
    searched: new Set<string>(),
    budgetUSD,
  };

  const backend = createBackend(
    SYSTEM_PROMPT,
    `Goal: ${goal}\nBudget: $${budgetUSD.toFixed(2)} total.\n\nWork through it and propose a stack.`,
    signal,
  );

  let iterations = 0;
  let toolCalls = 0;
  let nudged = false;
  /** Calls rejected for naming a product that does not exist. */
  let skipped = 0;

  try {
    while (iterations < MAX_ITERATIONS) {
      if (signal?.aborted) throw new Error('Cancelled');
      iterations++;

      const turn = await backend.next();

      if (turn.text) onEvent({ type: 'thinking', text: turn.text });

      // No tool calls means the model is talking rather than acting. Observed
      // repeatedly: it finishes its research, summarises what it found in
      // prose, and never calls propose_stack — so the user gets a trace and no
      // stack. Ask once, explicitly, before giving up. Asking twice would just
      // be a loop, so the second silence ends the run.
      if (turn.toolCalls.length === 0) {
        if (nudged) {
          onEvent({ type: 'done', iterations, toolCalls });
          return;
        }
        nudged = true;
        backend.addUserMessage(
          'You have not proposed a stack yet. Call propose_stack now with the best ' +
            'products you found, your reasoning, and what you rejected. Do not search ' +
            'or audit anything further.',
        );
        continue;
      }

      const results: Array<{ id: string; name: string; result: unknown }> = [];
      let proposed = false;

      // Searches run before anything else in the turn.
      //
      // Weaker models batch the whole plan into one turn — search, audit, cost,
      // propose — inventing ids like "product_id_from_creatine_search[0]"
      // because the search has not returned yet. Ordering searches first means
      // a batched turn still populates `discovered`, so the calls that follow
      // it in that same turn can resolve real ids instead of all failing.
      const ordered = [...turn.toolCalls].sort(
        (a, b) => Number(b.name === 'search_products') - Number(a.name === 'search_products'),
      );

      for (const call of ordered) {
        // A call naming a product we have never seen is rejected without being
        // executed and without spending budget. Otherwise one confused turn
        // burns the whole allowance on calls that cannot succeed, and stuffs
        // the transcript with identical errors until the request is too large
        // to send — which is exactly how a run was dying.
        // Same story for brand names. "brand_from_creatine_search_1" was
        // reaching the trust lookup, which dutifully reported grade D
        // (unverified) — a real-looking answer about a brand that does not
        // exist, which is worse than an error.
        const brand = (call.args as { brand?: unknown }).brand;
        if (typeof brand === 'string' && PLACEHOLDER.test(brand)) {
          skipped++;
          results.push({
            id: call.id,
            name: call.name,
            result: {
              error:
                `"${brand}" is a placeholder, not a brand. Use a brand exactly as ` +
                'search_products returned it.',
              availableBrands: [...new Set([...ctx.discovered.values()].map((e) => e.brand))].slice(0, 8),
            },
          });
          continue;
        }

        const wanted = (call.args as { productId?: unknown }).productId;
        if (typeof wanted === 'string' && !ctx.discovered.has(wanted)) {
          skipped++;
          results.push({
            id: call.id,
            name: call.name,
            result:
              skipped === 1
                ? {
                    error:
                      `"${wanted}" is not a real product id. Ids come from search_products ` +
                      'results — never construct or guess one. Call the tool again using an ' +
                      'id from the list below.',
                    availableProductIds: [...ctx.discovered.keys()].slice(0, 10),
                  }
                : { error: `"${wanted}" is not a real product id — see the list above.` },
          });
          continue;
        }

        if (++toolCalls > MAX_TOOL_CALLS) {
          onEvent({
            type: 'error',
            message: `Stopped after ${MAX_TOOL_CALLS} tool calls without a proposal.`,
          });
          onEvent({ type: 'done', iterations, toolCalls });
          return;
        }

        const tool = TOOLS_BY_NAME.get(call.name);
        if (!tool) {
          results.push({ id: call.id, name: call.name, result: { error: `No such tool "${call.name}"` } });
          continue;
        }

        onEvent({
          type: 'tool_call',
          id: call.id,
          name: call.name,
          summary: tool.summarise(call.args, ctx),
          args: call.args,
        });

        const started = Date.now();
        let result: unknown;
        try {
          result = await tool.run(call.args, ctx);
        } catch (error) {
          result = { error: error instanceof Error ? error.message : String(error) };
        }
        const ms = Date.now() - started;

        onEvent({ type: 'tool_result', id: call.id, name: call.name, result, ms });
        results.push({ id: call.id, name: call.name, result });

        const proposal = result as {
          accepted?: boolean;
          products?: SupplementProduct[];
          totalUSD?: number;
          retailUSD?: number;
          savedUSD?: number;
          reasoning?: string;
          rejected?: Array<{ productId: string; why: string }>;
        };

        if (call.name === 'propose_stack' && proposal.accepted) {
          onEvent({
            type: 'proposal',
            products: proposal.products ?? [],
            totalUSD: proposal.totalUSD ?? 0,
            retailUSD: proposal.retailUSD ?? 0,
            savedUSD: proposal.savedUSD ?? 0,
            reasoning: proposal.reasoning ?? '',
            rejected: proposal.rejected ?? [],
          });
          proposed = true;
        }
      }

      if (proposed) {
        onEvent({ type: 'done', iterations, toolCalls });
        return;
      }

      // A rejected proposal (over budget, unknown ids) stays in the transcript
      // so the agent can read the reason and correct itself.
      backend.addToolResults(results);
    }

    onEvent({
      type: 'error',
      message: `Reached the ${MAX_ITERATIONS}-step limit without proposing a stack.`,
    });
    onEvent({ type: 'done', iterations, toolCalls });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // The model died, but its research did not. If it had already found real
    // products, finish the job deterministically rather than handing the user a
    // provider stack trace — the ranking is the same arithmetic the agent's own
    // costing tool runs, so the answer is the one it was heading towards.
    //
    // Labelled honestly: the UI says the model dropped out and code finished.
    // Passing this off as the agent's own choice would be the dishonest move.
    if (ctx.discovered.size > 0 && salvage(ctx, onEvent, message)) {
      onEvent({ type: 'done', iterations, toolCalls });
      return;
    }

    onEvent({
      type: 'error',
      message: /429|quota|rate/i.test(message)
        ? `Model quota exhausted mid-run (${message.slice(0, 140)}). ` +
          'The deterministic pipeline at /compare still works.'
        : message,
    });
    onEvent({ type: 'done', iterations, toolCalls });
  }
}

/**
 * Best in-budget stack from whatever the agent managed to discover.
 *
 * One product per ingredient family, cheapest per active gram first, skipping
 * anything that would breach the budget. Returns false when nothing fits, so
 * the caller can report the original failure instead.
 */
function salvage(
  ctx: ToolContext,
  onEvent: (e: AgentEvent) => void,
  why: string,
): boolean {
  const byFamily = new Map<string, CatalogEntry>();

  for (const entry of ctx.discovered.values()) {
    const best = byFamily.get(entry.ingredientFamily);
    if (!best || calculateCostPerGram(entry) < calculateCostPerGram(best)) {
      byFamily.set(entry.ingredientFamily, entry);
    }
  }

  const picked: SupplementProduct[] = [];
  let total = 0;

  for (const entry of [...byFamily.values()].sort(
    (a, b) => calculateCostPerGram(a) - calculateCostPerGram(b),
  )) {
    const product = toSupplementProduct(entry, mockAuditNutritionLabel(entry.labelImageUrl));
    if (total + product.discountedPriceUSD > ctx.budgetUSD) continue;
    picked.push(product);
    total += product.discountedPriceUSD;
  }

  if (picked.length === 0) return false;

  const retail = Number(picked.reduce((s, p) => s + p.totalPriceUSD, 0).toFixed(2));

  onEvent({
    type: 'error',
    message:
      `The model dropped out mid-run (${why.slice(0, 90)}). Ranking its ${ctx.discovered.size} ` +
      'discovered products in code instead — same cost-per-active-gram maths, no model involved.',
  });

  onEvent({
    type: 'proposal',
    products: picked,
    totalUSD: Number(total.toFixed(2)),
    retailUSD: retail,
    savedUSD: Number((retail - total).toFixed(2)),
    reasoning:
      'Completed without the model. These are the cheapest products per gram of active ' +
      'ingredient, one per category, that fit the budget — computed from the real prices ' +
      'and serving counts the agent had already retrieved.',
    rejected: [],
  });

  return true;
}
