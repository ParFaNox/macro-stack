# Teammate 3 — Prava Virtual Cards & Checkout Automation

Everything you need to finish the last third of MacroStack. Written after
building the agent layer, so the contracts below are what the code *actually*
does, not what the task plan assumed.

**Read the "Reality check" section at the bottom before you plan your demo.** One
finding changes the whole approach: Prava already ships checkout automation, so
you probably should not write Playwright from scratch.

---

## 1. What already exists (you inherit this, don't rebuild it)

| Area | State |
| --- | --- |
| `src/types/index.ts` | The shared contract. `PravaCardRequest`, `PravaCardDetails`, `CheckoutExecutionPayload`, `CheckoutResult` are already defined and **are your API shapes**. |
| `/api/optimize` | Live. Returns a `StackOptimizationResult` with real audited products. |
| `/api/audit-label`, `/api/mcp` | Live. Gemini label auditing + MCP tool server. |
| `/` and `/compare` | Wired to the real pipeline. `/compare` produces the product list and total you will charge. |
| `/agent` | Agent console (Teammate 2's debug view). Ignore. |
| Reasoning log stream | `AgentReasoningLog` with steps `LABEL_AUDIT → COST_CALCULATION → STACK_OPTIMIZATION`. **`CARD_MINTING` and `CHECKOUT_AUTOMATION` are reserved for you and currently faked.** |

Run it: `npm run dev`, then `npm run warm-labels` once (caches Gemini label
readings so runs are instant and free).

### The two fakes you are replacing

**`src/components/passkey-modal.tsx`** — `handlePasskeyAuth()` does
`setTimeout(1500)` then returns a hardcoded `PravaCardDetails` with card number
`4000123456789010`. No WebAuthn, no Prava call.

**`src/app/compare/page.tsx`** — `handlePasskeyAuthorized()` pushes a fake
`CARD_MINTING` log, waits 1600 ms, pushes a fake `CHECKOUT_AUTOMATION` log with
hardcoded `orderId: "ORD-9921"`, then flips to "Complete · Card Expired". No
network call at all.

Both call sites already exist and are typed — you are filling in behaviour, not
restructuring the UI.

---

## 2. Your scope

```
src/lib/prava/
  sdk-client.ts          # Prava session/mandate wrapper
  passkey-verifier.ts    # WebAuthn assertion verification
src/lib/automation/
  checkout-runner.ts     # Checkout orchestration
  merchant-adapters.ts   # Per-merchant selectors (only if you write your own)
src/app/api/prava/mint-card/route.ts
src/app/api/checkout/execute/route.ts
src/app/mock-merchant/…   # Recommended: a local store to check out against
```

None of these exist yet. `src/lib/prava` and `src/lib/automation` are empty
directories in the plan only — nothing is scaffolded.

---

## 3. The finding that should change your plan

The original task plan says "write Playwright automation to complete a merchant
checkout." **Prava already does this.** From their
[Browser Harness docs](https://docs.prava.space/integration/browser-harness):

> It "fills the merchant's checkout (contact, shipping address, delivery option)
> and submits payment with the one-time token", reconciles subtotal/shipping/tax
> against live data before charging, and "learns a merchant's checkout on the
> first run and completes later runs consistently, healing automatically if the
> page changes."

**But it only targets Shopify checkouts**, and it starts from a UCP quote —
meaning it needs *real products at real Shopify merchants*. Our catalog is 15
synthetic products with `example-merchant.test` URLs that do not resolve.

Better still: **Prava ships a hosted MCP server** at `https://mcp.pay.prava.space/mcp`
— one URL, sign in once, works with any MCP client. It exposes 18 tools,
including `shop_search`, `shop_product`, `shop_quote`, `shop_checkout`,
`create_payment_session`, and the full mandate lifecycle.
([overview](https://docs.prava.space/mcp/overview) ·
[tools reference](https://docs.prava.space/mcp/tools))

That solves **two** problems in one move, which is why it's the recommended route.

### Route A — Prava MCP *(recommended)*

Connect our agent to Prava's MCP and let it discover, quote, and buy.

The flow maps almost exactly onto what already exists:

```
shop_search("creatine monohydrate")     ← real products, real prices
  → our Gemini label audit + cost-per-active-gram ranking   ← already built
    → shop_quote                        ← locks the true total
      → create_payment_session          ← user approves by passkey
        → shop_checkout                 ← order placed
```

- **Satisfies the hard requirement.** "Use Prava as a real part of the product"
  and "an agent completing a transaction" are both literally true.
- **Fixes the invented inventory** (see §4 below) — `shop_search` returns real
  products from real Shopify merchants via UCP.
- **No KYB.** The MCP/CLI path verifies you by card enrollment (KYC), not
  business incorporation.
- **Human approval is built in** — the agent never touches card data. That's a
  feature to show off, not a limitation.

> **Check before you call `shop_checkout`.** The MCP docs don't mention a
> sandbox, and this path enrolls a **real card**. Confirm sandbox availability in
> Prava's Discord or office hours first. Do not discover this by spending your
> own money on creatine.

### Route B — REST sandbox + your own mock merchant *(fallback)*

If MCP has no sandbox and nobody wants to spend real money: mint real
credentials against `sandbox.api.prava.space`, and check out against a mock
Shopify-shaped store you host at `/mock-merchant`.

- **Real:** sessions, card minting, mandates, test cards, OTP, card revocation.
- **Simulated:** the merchant, and therefore the products stay synthetic.
- **Cost:** you write both the Playwright script and the mock store.

Route B is a solid fallback and everything in §5 and §6 still applies to it. But it
leaves the "where do your prices come from?" question unanswered, so try Route A
first.

---

## 4. P0 — Replace the invented inventory

**This is the single weakest point in the whole project and it is now yours,
because the fix runs through Prava.**

Right now `src/lib/agent/catalog.ts` is 15 hand-written products with
`example-merchant.test` URLs that do not resolve. Every price in the demo is
invented. "Where do your prices come from?" is the first question a judge asks,
and today the honest answer is "we made them up."

`shop_search` fixes it. There is already a seam built for exactly this:
[src/lib/agent/product-search.ts](src/lib/agent/product-search.ts) exposes

```ts
searchProducts(query: string): Promise<ProductSearchResult>
```

and *everything* downstream — label audits, cost-per-gram, ranking, budget
selection, the UI — depends only on `CatalogEntry[]`, never on where the entries
came from. Add a third provider alongside `seed` and `brightdata`:

1. Call `shop_search` / `shop_product` through Prava's MCP.
2. Map each result into `CatalogEntry` (see the `brightdata` provider in that
   file for a worked example of the mapping and the LLM normalisation pass).
3. Keep the existing fallback contract: **never throw.** On any failure return
   the seed catalog with a `fallbackReason`, which the reasoning feed already
   surfaces. A demo should degrade to synthetic-but-working, never to a blank page.
4. Set `sourceMode: 'LIVE_RETAIL_SEARCH'` so the UI can honestly badge real data.

### The trade-off, so it doesn't surprise you

Real listings have **product photos, not supplement-facts panels**. Teammate 2's
Gemini auditor reads facts panels; point it at a product photo and it will
correctly report low confidence. So as pricing becomes real, the *label audit*
gets weaker on those items.

Options, roughly in order of effort:

- Accept it — low confidence is the honest reading, and the audit already reports
  `confidence` per product.
- Use `shop_product` to pull additional images and pick the one that looks like a
  panel (many listings include one).
- Keep the synthetic catalog as a labelled "demo mode" toggle, so you can show
  the full vision pipeline *and* real pricing in the same presentation.

Talk to Teammate 2 before choosing. Do not silently ship whichever is easiest.

---

## 5. Step-by-step plan

### Step 0 — Accounts and env (30 min)

1. Sign up at [dashboard.prava.space](https://dashboard.prava.space), stay in
   **sandbox**. No business verification needed for sandbox.
2. Grab `pk_test_*` (publishable) and `sk_test_*` (secret).
3. Add to `.env.local` — **never `.env.example`**, that file is committed:

```bash
PRAVA_SECRET_KEY=sk_test_...
NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY=pk_test_...
PRAVA_API_BASE=https://sandbox.api.prava.space/v1
PRAVA_ENVIRONMENT=sandbox
PLAYWRIGHT_HEADLESS=true
```

Then add the same keys **blank** to `.env.example` so the team knows they exist.

4. `npm i @prava-sdk/core` (Playwright is already a dependency).

> The existing `.env.example` has `PRAVA_API_KEY` / `PRAVA_MERCHANT_WEBHOOK_SECRET`
> from the original plan. Those names predate the real docs — rename them to
> match above and tell the team.

### Step 1 — `src/lib/prava/sdk-client.ts` (2h)

Wrap the REST API. Sandbox base `https://sandbox.api.prava.space/v1`, auth via
`Authorization: Bearer ${PRAVA_SECRET_KEY}`.

Core call — [Create Session](https://docs.prava.space/api-reference/create-session):

```
POST /v1/sessions
{ user id, email, total amount, currency, merchant/product info }
→ { session_token, iframe_url }
```

Then [Get Payment Result](https://docs.prava.space/api-reference/get-payment-result)
returns the card credentials and status.

Expose:

```ts
mintPravaCard(req: PravaCardRequest): Promise<PravaCardDetails>
getPaymentResult(sessionId: string): Promise<...>
reportStatus(sessionId, outcome): Promise<void>   // settle APPROVED/DECLINED
revokeSession(sessionId): Promise<void>           // this is your "expire the card"
```

`PravaCardRequest.amountUSD` is the hard cap — pass it as the session total so
the credential physically cannot be charged more.

**Consider mandates instead.** [Mandates](https://docs.prava.space/concepts/mandates)
are "approve once with a passkey, let an agent charge later within caps", and
[Charge a Mandate](https://docs.prava.space/api-reference/mandate-charge) mints
single-use credentials with *no passkey per charge*. That is a much better fit
for MacroStack's story (an autonomous agent buying on a recurring basis) and
demos better than one-card-one-checkout. Read both pages before you commit to a
shape.

### Step 2 — `src/lib/prava/passkey-verifier.ts` (2h)

The modal currently fakes WebAuthn entirely. Two options:

- **Real:** `navigator.credentials.get()` in the browser, verify the assertion
  server-side (signature over challenge, origin, and counter). Highest
  credibility, ~2h with a library like `@simplewebauthn/server`.
- **Honest-fake:** keep the simulated prompt but *say so in the UI*. Faster.

Whichever you pick, **do not present a simulated passkey as real** in the demo.
Teammate 2's layer labels every audit `LIVE_VISION_MODEL` vs
`DETERMINISTIC_MOCK` for exactly this reason — match that standard.

Never verify the signature client-side only. That is the whole point of the
guardrail.

### Step 3 — Mock merchant at `src/app/mock-merchant/` (2h)

A Shopify-shaped checkout you control:

- Product page with a **Subscribe & Save** toggle (10–20% off) — the discount
  must visibly change the total, since that's the pitch.
- Cart → checkout form: contact, shipping address, card number / expiry / CVV.
- Order confirmation page showing an order ID.
- A subscription flag, so you can *show* that the card expiring blocks the
  renewal charge. **This is the money shot of the whole demo** — build it.

Read the totals from the products passed in, so the amount matches what
`/compare` charged.

### Step 4 — `src/lib/automation/checkout-runner.ts` (3h)

```ts
executePlaywrightCheckout(payload: CheckoutExecutionPayload): Promise<CheckoutResult>
```

1. Launch Chromium (`headless: process.env.PLAYWRIGHT_HEADLESS !== 'false'`).
2. Navigate to each product's `checkoutUrl`.
3. Select Subscribe & Save, add to cart.
4. Fill `payload.shippingAddress`, then `payload.cardDetails`.
5. Submit; capture the order ID.
6. **Immediately revoke/expire the card via Prava.**
7. Screenshot each step to `public/demo-proof/` — the plan asks for video/screenshot
   backup, and you will be grateful when the live demo fails.

Return the real `CheckoutResult` shape:
`{ success, orderId, merchantName, amountChargedUSD, cardStatusAfterCheckout: 'EXPIRED_SAFELY' | 'FAILED', executionLogs }`.

`npx playwright install chromium` first — it is not downloaded yet on this repo.

### Step 5 — API routes (1h)

```
POST /api/prava/mint-card      body: PravaCardRequest      → PravaCardDetails
POST /api/checkout/execute     body: CheckoutExecutionPayload → CheckoutResult
```

Both must be `export const runtime = 'nodejs'` (Playwright and the Prava secret
key cannot run on edge). Validate bodies with `zod` — copy the pattern in
[src/app/api/optimize/route.ts](src/app/api/optimize/route.ts), which returns
400 with per-field issues.

**Verify the passkey signature inside `mint-card` before calling Prava.** A
client that can skip the check is not a guardrail.

### Step 6 — Wire the UI (1h)

In `passkey-modal.tsx`, replace the `setTimeout` with a real
`fetch('/api/prava/mint-card')`.

In `compare/page.tsx` `handlePasskeyAuthorized()`, replace the two fake
`setTimeout` logs with a real `fetch('/api/checkout/execute')`, and emit
`CARD_MINTING` / `CHECKOUT_AUTOMATION` logs from the **actual** response.

Use `createLog()` from [src/lib/agent/logger.ts](src/lib/agent/logger.ts) so your
log objects match the ones already streaming into the feed. For a live stream,
copy the SSE pattern from `/api/optimize?stream=1` — checkout takes 10–30s, so
streaming progress matters a lot more here than it did for auditing.

---

## 6. Testing

Sandbox test cards (from [Test Cards](https://docs.prava.space/api-reference/test-cards)):

- `4622 9431 2313 7789` CVV `757`, `4622 9431 2313 7797` CVV `640` — 11 Visa
  numbers total, all expiry `12/27`.
- **Test OTP: `456789`** when the issuer asks for one.
- These only work on `sandbox.api.prava.space` / `sandbox.collect.prava.space`.
  Declined everywhere else.

Also read [Anatomy of a Checkout](https://docs.prava.space/concepts/checkout-flow) —
it explicitly covers "the card-verification steps (passkey / device binding and
issuer OTP) that a first-time integrator does not see coming." Read it *before*
you start, not while debugging.

Definition of done:

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean (they are
      clean today — keep them that way).
- [ ] Full run: build stack → audit → passkey → mint → checkout → card expired.
- [ ] Card status is verifiably `EXPIRED`/revoked via a Prava API read, not just
      a local flag.
- [ ] The subscription renewal attempt on your mock merchant **fails** because
      the card is dead. Demo this explicitly.
- [ ] Screenshots in `public/demo-proof/`.

---

## 7. Reality check — will this be a deployable webapp?

You asked whether finishing this gives a working product or just a better mock.
Honestly: **a genuinely impressive end-to-end demo, but not a deployable
consumer product.** Four things block that, and only one is yours.

**1. The products aren't real — yet.** See §4: this is now a P0 on your plate,
and `shop_search` is the fix. A Bright Data provider also exists in
[product-search.ts](src/lib/agent/product-search.ts) as a second option, but it
has **never been executed** and needs its own account. Until one of them runs,
every price is invented and there is nothing real to buy.

**2. Going live needs a legal entity — on one path.** Per Prava's
[compliance docs](https://docs.prava.space/guides/compliance):
- **SDK/API path** (what Step 1 above builds) needs **KYB**: legal entity name,
  incorporation details, beneficial owners. Plus emailing support@prava.space for
  manual approval. A hackathon team cannot clear that in a weekend.
- **MCP/CLI path** uses **KYC via card verification** instead — your own bank
  verifies your own card. An individual *can* do this. But then the agent charges
  *your real card*, which is not a product, it's a personal tool.

**3. No accounts, no persistence.** `/login` and `/signup` are styled forms with
no submit handler. `/profile` is hardcoded strings. There is no database and no
shipping-address capture — you'd hardcode an address into
`CheckoutExecutionPayload`. Real checkout needs all three.

**4. Two concrete deploy blockers in the current code:**
- **Playwright will not run on Vercel serverless.** You need a container host
  (Fly.io, Railway, Render) or a separate worker. Decide this early — it affects
  how you structure `/api/checkout/execute`.
- ~~The label-audit cache writes to disk, which is read-only on Vercel.~~
  **Fixed.** Readings now ship in a committed seed
  (`src/lib/agent/label-audit-seed.json`), imported and bundled, so deployments
  start warm with zero API calls. Verified: a run with no local cache served
  15/15 live readings in 53 ms. If you change `VISION_MODEL`, re-run
  `npm run warm-labels && npm run save-label-cache` and commit — the cache is
  keyed by model, so a Gemini-warmed seed is deliberately not reused for GPT-4o.

**Also worth saying out loud:** automating checkout on real third-party
retailers generally violates their terms of service, and card automation moves
real money. That is fine for a sandboxed hackathon demo against a mock merchant.
It is a legal and business problem, not a technical one, before it is a product.

### Bottom line

Finish Route A and you can honestly say: *"Real Gemini vision audits every label,
real cost-per-active-gram ranking, real Prava sandbox credentials minted against
a real passkey approval, real automated checkout, and the card verifiably dies
before the subscription can renew — against a merchant we control."*

That is a strong, defensible hackathon result. What it is not is a site strangers
can buy supplements on. The gap is real products, real merchants, accounts, and
KYB — not more code from you.

---

## 8. Rules of the road

- **Don't edit** `src/lib/agent/**`, `src/app/api/{optimize,audit-label,mcp,labels}/**`,
  or `src/app/labels/**` without telling Teammate 2 — that's the agent layer.
- **`src/types/index.ts` is shared.** Adding a field is fine; changing or removing
  one breaks both other workstreams. Announce it.
- **Never commit real keys.** `.env.example` is a tracked file. A key was pasted
  into it once already and caught before it was pushed — put secrets in
  `.env.local`, which is gitignored.
- Branch: `feature/prava-playwright`, off current `main`.
- Label simulated things as simulated. The rest of the app does.

## Reference

- [Prava docs index](https://docs.prava.space/llms.txt) — every page, one file. Feed it to your AI tool.
- [Quickstart](https://docs.prava.space/quickstart) · [Authentication & Environments](https://docs.prava.space/authentication)
- [Anatomy of a Checkout](https://docs.prava.space/concepts/checkout-flow) · [Mandates](https://docs.prava.space/concepts/mandates) · [Guardrails](https://docs.prava.space/concepts/guardrails)
- [Testing in Sandbox](https://docs.prava.space/api-reference/testing) · [Errors](https://docs.prava.space/api-reference/errors)
- [Browser Harness](https://docs.prava.space/integration/browser-harness) · [Choosing Your Integration](https://docs.prava.space/choosing-your-integration)
- [README-agent.md](README-agent.md) — what Teammate 2 built and how to call it.
