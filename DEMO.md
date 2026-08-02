# MacroStack — 5 minute demo

Read this out loud. Someone who has never seen the app can follow it.

**The pitch in one line:** supplement labels lie, so an AI agent shops real
merchants, works out the real cost per gram of active ingredient, checks whether
the brand can be trusted, then buys with a card that dies before the
subscription can renew.

---

## Before you start

```bash
npm run dev
```

Open **http://localhost:3000/setup**. Every row should read **LIVE**.

If "Prava agent link" says NOT CONNECTED, click **Connect agent**, approve in
the window that opens, and it flips to LIVE within a few seconds. That one
button is the difference between real merchants and the built-in example
catalog — and the page says which one you are getting, so nothing is ever
passed off as live when it isn't.

---

## Step 1 — Let the agent shop (90s)

Go to **AI Agent** in the nav. Type a goal in plain English, or tap an example:

> Cheapest creatine that isn't a proprietary blend, plus electrolytes

Set the budget slider and hit **Run agent**.

**What to point at while it runs.** The left panel is not a progress bar. Every
row is a real decision:

```
Search creatine                          ✓ 7 products found
Read label Warrior Creatine Monohydrate  ✓ clean label · 2% filler
Costing Transparent Labs Hydrate         ✓ $0.1246 per active gram
Verify brand Transparent Labs            ✓ grade B
Propose a stack of 2 products            ✓ stack accepted · $41.56
```

Nobody wrote that sequence. The model was given five tools and a goal, and it
chose which to call and when. A different goal produces a different sequence.

**Two things worth saying out loud:**

- The products are real. Warrior, Transparent Labs, PEScience, Raw Nutrition,
  Momentous — live prices, and the links go to their actual storefronts.
- The budget is enforced in code, not asked of the model. An over-budget
  proposal is rejected and handed back to the agent with the reason, and it
  tries again. Set the budget very low to watch that happen.

## Step 2 — Approve the spend (60s)

Hit **Approve & buy**. This is the part the hackathon is actually about:

1. The agent decided on a product.
2. We create a Prava session for that exact purchase.
3. After approval a one-time card comes back — **capped at the approved
   amount**, single-use.
4. Checkout runs against the merchant with that card.
5. The renewal attempt is **declined**, because the card no longer exists.

Step 5 is the point. Show it: after the order confirms, the page offers to
simulate the merchant charging you again next month. It fails:

> card ••••2906 is single-use and was retired after the original purchase.

An agent that can spend money is only safe if the amount it can spend is
bounded by something the agent does not control. Here that bound is the card.

## Step 3 — The fallback (30s, optional)

Open **/compare**. Same optimisation, no model in the loop at all — a
deterministic pipeline over the same tools. It exists because a demo that
depends on a free-tier model finishing in time is a demo that eventually
doesn't. Both paths produce the same shape of answer.

---

## If something goes wrong

**"Model quota exhausted"** — free tiers meter tokens per *day*. `AGENT_MODEL`
takes a comma-separated chain and a run moves to the next model automatically,
but if every model in the chain is spent, `/compare` still works and needs no
model at all.

**Products look like "BulkNutrition" or "PeakForm"** — those are the built-in
examples, which means the agent link dropped. Check `/setup`.

**Card says SIMULATED** — nobody approved the Prava session in time, so it
degraded rather than hanging. The amount cap is still enforced and the result is
labelled SIMULATED everywhere it appears. For a real card, approve the session
in the window that opens.

---

## If a judge asks "what does your agent actually decide?"

Which products are worth looking at, which labels are worth reading, when a
price is suspicious enough to check the brand, and what to buy.

On one run it rejected a cheaper creatine at $0.0728/g in favour of one at
$0.0741/g, because the cheaper brand had an amino-spiking flag and a trust grade
of F. It chose the more expensive product, and said why.
