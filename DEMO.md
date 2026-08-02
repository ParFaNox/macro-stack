# MacroStack — 5 minute demo script

Read this out loud. Someone who has never seen the app can follow it.

**The pitch in one line:** supplement labels lie, so an AI agent reads the
actual labels, works out the real cost per gram of active ingredient, checks
whether the brand can be trusted, then buys the stack with a card that dies
before the subscription can renew.

---

## Before you start

The server should already be running. If not:

```bash
npm run dev
```

Open **http://localhost:3000**. Check the top of `/agent` shows
`15/15 labels cached` — if it does, everything is warm and nothing will be slow.

---

## Step 1 — Build a stack (30s)

On the landing page there's a **Stack Builder** with five supplements already in
it. Two things to point out:

- Type something into the box and hit Add, e.g. **Ashwagandha**. It gets added.
- Drag the **budget cap** slider. Say: *"the agent has to stay under this."*

Hit **Audit Stack**.

> If you added Ashwagandha, watch for `No catalog match for "Ashwagandha" — skipping`
> in the log. That's honest behaviour worth showing: the agent says what it
> couldn't do instead of quietly inventing a product.

## Step 2 — Watch the agent think (60s)

The left panel streams the agent's actual reasoning. Walk through the steps as
they appear:

- **`TRUST_VERIFICATION`** — checking brands against third-party records
- **`LABEL_AUDIT`** — a vision model reading each supplement facts panel.
  Click **view label** on any product to see the actual image it read.
- **`COST_CALCULATION`** — *"ranked 3 products, 30x spread"*. Say: *"same
  ingredient, thirty times the price per actual gram."*
- **`STACK_OPTIMIZATION`** — each pick lists what it beat and why

**The line that lands:** find a `WARNING` where a brand is flagged. The agent
caught a proprietary blend hiding its dosing — maltodextrin listed before the
creatine. Nobody told it that; it read it off the label.

**The second line that lands:** MassLine whey is *cheaper* per active gram than
CleanWhey, and the agent rejects it anyway, because amino spiking and no
third-party certification put it at trust grade F.

## Step 3 — Buy it (90s)

Hit **Authorize & Checkout**.

A modal shows the amount and that the card is single-use and hard-capped.

Approve it. Then, in the right-hand panel, the log shows a real browser being
driven through a merchant checkout — selecting Subscribe & Save, verifying the
merchant's total matches what the card is capped at, entering the card, placing
the order.

Say: *"that's a real headless browser, not a script pretending. It refuses to
pay if the merchant's total doesn't match what was authorised."*

## Step 4 — The bit that matters (60s)

When it finishes you get order numbers and **Try the renewal charge →**.

Click it. On the merchant's confirmation page hit **Simulate next billing cycle**.

It says **DECLINED — card is single-use and was retired after the original purchase.**

Say: *"we took the 15% subscribe-and-save discount, and the subscription
physically cannot bill us next month. That's the product."*

---

## If someone asks "where's the AI?"

- A vision model reads the labels — that's real perception, not OCR templates
- Senso retrieves third-party verification records and a model turns them into a trust grade
- A model normalises messy retailer listings into structured products

The money maths — cost per gram, budget selection — is deliberately **not** AI.
You don't want a language model doing arithmetic on someone's card.

## If someone asks "is the payment real?"

Yes, and be precise about what's real:

- **Real:** Prava sessions, the amount cap, the single-use credential, the
  approval step, settlement back to Prava
- **Simulated:** the merchant. Our products are synthetic, so there's no real
  listing to buy — same as developing against Stripe test mode with your own
  checkout

Check which mode is live: `curl -s localhost:3000/api/prava/mint-card`

- `SANDBOX` — real Prava. The approval step opens **Prava's own page**, where
  card entry and the passkey happen. We never touch card data.
- `SIMULATED` — no Prava call at all. Every log and badge says `SIMULATED`.

## Two switches worth knowing

**Guaranteed-to-complete run** (Prava's sandbox has been flaky; several teams
have been blocked on it). No external dependency, finishes every time:

```bash
PRAVA_SECRET_KEY= npm run dev
```

**Real products instead of the built-in catalog** — one browser sign-in:

```bash
open http://localhost:3000/api/prava/oauth/start
```

Read-only scope, so that token can find products but cannot buy anything.

---

## Honest gaps, if asked

- **The 15 products are ours.** Prices are realistic but invented. Connect Prava
  shop_search (above) and they become real merchants.
- **The merchant is ours** — labelled "simulated storefront" on every page.
- **Accounts are in-memory.** Restart the server and they're gone. Swapping one
  file for a database is the only change needed.
- **Playwright won't run on Vercel serverless** — needs a container host.

## Reset between demos

Restart the server. Orders and retired cards are in-memory, so a restart gives
you a clean run.

## Prove it isn't smoke

```bash
npm run verify
```

97 assertions across every layer, including the negative cases — replayed
passkey challenges, tampered amounts, forged session cookies, reused cards.
