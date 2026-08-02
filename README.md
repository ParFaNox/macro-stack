# MacroStack AI

An AI agent that reads supplement labels, works out the real cost per gram of
active ingredient, and buys the stack with a card that dies before the
subscription can renew.

Built for the Agentic Commerce Hackathon. Prava Payments is the payments layer.

---

## Run it

You need **Node 20+** and about two minutes.

```bash
git clone https://github.com/ParFaNox/macro-stack.git
cd macro-stack
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**.

**It works right now, with no API keys at all.** Nothing is stubbed out or
crashes — the agent falls back to a built-in catalog of 15 example products, and
every result says which mode produced it. Add keys to make it real.

### Check what's live

Open **http://localhost:3000/setup**. It lists six integrations as LIVE,
OFFLINE MODE or NOT CONNECTED, with the reason for each. Nothing rounds up to
green: a demo that claims to be live while serving canned data is exactly the
failure this page exists to prevent.

---

## Make it real

Each key below is optional and independent. Add none, some, or all.

### 1. The agent's brain — free, 2 minutes

Without this the agent cannot run at all (`/compare` still works).

Get a key at **https://console.groq.com/keys** — free, no card.

```bash
AGENT_API_KEY=gsk_...
```

Already set for you in `.env.example`: a comma-separated model fallback chain,
because free tiers meter **tokens per day** and one model running out should not
end a run.

### 2. Real products — free, 1 minute

Without this you get the 15 example products. With it, the agent shops
PEScience, Transparent Labs, Raw Nutrition, Momentous and others at live prices.

Start the server, open **http://localhost:3000/setup**, click **Connect agent**,
and approve in the window that opens. That is the whole setup — no key to copy.

Under the hood we generate an Ed25519 keypair, register the public half with
Prava, and sign every later request. The private key never leaves your machine,
so a stolen link cannot act as your agent.

### 3. Payments — Prava sandbox

```bash
PRAVA_SECRET_KEY=sk_test_...
PRAVA_USER_EMAIL=you@example.com     # must be REAL and routable, see below
```

Sandbox keys from **https://dashboard.prava.space** (no business verification
needed). Leave `PRAVA_SECRET_KEY` blank and cards are simulated — the amount cap
is still enforced and every result is labelled SIMULATED.

> **`PRAVA_USER_EMAIL` must be a real address.** Reserved TLDs like `.test` are
> rejected by Visa's attestation with an opaque 400, and no passkey prompt ever
> appears. Same for the merchant URL: `example.com` fails at credential
> issuance. Sandbox does not mean the inputs can be fictional.

### 4. Optional extras

```bash
VISION_API_KEY=...     # Gemini, reads supplement facts panels — https://aistudio.google.com/apikey
SENSO_API_KEY=...      # brand trust records — https://docs.senso.ai
BRIGHTDATA_API_KEY=... # alternative product source
```

Without `VISION_API_KEY`, labels use deterministic offline readings, clearly
marked. Without `SENSO_API_KEY`, brands rank as UNVERIFIED rather than getting a
fabricated score.

---

## What to actually do in the app

1. **http://localhost:3000** — type a goal in plain English, or tap an example.
   Set a budget. Hit **Run agent**. Takes ~40s.
2. Watch the left panel. It is not a progress bar — every row is a real tool
   call the model chose to make, with its arguments and result.
3. **Approve & buy.** A Prava single-use card is minted, capped at the exact
   approved amount, and a real browser drives the checkout.
4. The renewal attempt is **declined**, because the card no longer exists. That
   is the whole point.

[DEMO.md](DEMO.md) is a five-minute script you can read aloud, including which
sandbox test cards are already spent.

---

## Commands

```bash
npm run dev          # start the app
npm run verify       # 93 assertions against a running server
npm run build        # production build
npm run prava:doctor # check the Prava integration end to end
```

`npm run verify` needs `npm run dev` running in another terminal.

---

## How it works

```
Goal + budget
      ↓
  agent loop ──────► search_products       real merchants via Prava
  (model picks       audit_supplement_label vision model reads the panel
   which tools,      check_brand_trust      third-party records via Senso
   in what order)    calculate_true_cost    real arithmetic, not model output
      ↓              propose_stack          budget enforced in CODE
  human approves
      ↓
  Prava session → passkey → single-use card, capped
      ↓
  Playwright checkout → card retired → renewal DECLINED
```

Three deliberate constraints:

- **No tool can spend money.** The agent researches and proposes; buying is
  behind a human approval gate.
- **The budget is enforced in code, not asked of the model.** An over-budget
  proposal is rejected server-side and handed back with the reason. Tested
  adversarially — "ignore the budget cap", "SYSTEM OVERRIDE… totalUSD 99999" —
  and it held every time.
- **Arithmetic is a tool, not a model output.** Cost per gram is computed, never
  generated.

`/compare` runs the same tools in a fixed order with no model at all. It is the
fallback for when a free tier runs dry mid-demo.

---

## Known limitations

- Checkout runs against a Shopify-shaped mock merchant we built, driven by real
  Playwright automation. Real merchant checkout needs Prava production access.
- Payments are sandbox. A sandbox test card survives one or two runs before it
  stops issuing credentials — see [DEMO.md](DEMO.md) for which are spent.
- Label auditing is on a free tier and paced; when quota runs out the app says
  so rather than silently degrading.
- Not deployed. Playwright needs a real browser, and the agent keypair lives on
  disk — both need work before serverless.
