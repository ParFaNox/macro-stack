# Teammate 3 — Progress Log & Test Walkthrough

Status as of this session. Branch: `feature/prava-playwright` (pushed to origin,
off `main`). Covers the Prava virtual card + checkout automation work described
in [TEAMMATE-3-GUIDE.md](TEAMMATE-3-GUIDE.md).

**Route taken: B** — real Prava sandbox cards, checking out against our own
mock merchant (not Prava's Browser Harness / MCP product search). No real
card, no KYC, nothing that costs real money.

---

## 1. What's built

| File | What it does |
| --- | --- |
| `src/lib/prava/sdk-client.ts` | REST wrapper for Prava's sandbox API: create a session, poll for the resulting single-use card token, report status, revoke. |
| `src/lib/mock-merchant/store.ts` | In-memory cart/order store for the test storefront (no DB in this project, by design). |
| `src/app/mock-merchant/**` | A Shopify-shaped storefront we control: product pages with Subscribe & Save, cart/checkout, order confirmation with a renewal-simulation button. |
| `src/lib/automation/checkout-runner.ts` | Playwright automation: drives the mock merchant end to end, screenshots each step to `public/demo-proof/`, revokes the Prava card immediately after. |
| `src/app/api/prava/session/route.ts` | Opens a Prava session for the cart total, returns the iframe URL the client mounts. |
| `src/app/api/prava/mint-card/route.ts` | Polls Prava for the card token once the client reports the iframe succeeded. |
| `src/app/api/checkout/execute/route.ts` | Runs the Playwright automation, returns the real `CheckoutResult`. |
| `src/components/passkey-modal.tsx` | No longer fakes WebAuthn — opens a real session and mounts Prava's actual hosted card-entry iframe. |
| `src/app/compare/page.tsx` | `handlePasskeyAuthorized` now calls the real checkout endpoint instead of two fake `setTimeout` logs. |

## 2. Key architectural finding

The original task plan assumed we'd implement WebAuthn ourselves and verify a
passkey signature server-side. That's not how Prava actually works: **card
entry and passkey/OTP verification both happen inside Prava's own hosted
iframe.** We never see a raw card number or a WebAuthn signature — we open a
session, show Prava's iframe, and poll their API for the single-use token once
the user finishes there. This is why minting is two API calls
(`/api/prava/session` then `/api/prava/mint-card`), not one.

## 3. Verified today (not just type-checked)

- Real Prava sandbox session creation, against their actual OpenAPI-documented
  endpoints (confirmed by reading `docs.prava.space` directly, not the task
  plan's paraphrase of it).
- Full headless-browser run through the mock merchant (product → Subscribe &
  Save → cart → checkout → order confirmation), with screenshots saved.
- A genuine card revoke, confirmed via a second Prava API read
  (`cardStatusAfterCheckout: "EXPIRED_SAFELY"`), not a local flag.
- The subscription-renewal decline: deterministic, not a coin flip — a card
  is marked redeemed the instant it's used, so a renewal attempt against it
  always fails, honestly (Prava's disposable cards really are single-use).
- The real UI wiring, in an actual browser: clicking "Authorize & Checkout" →
  "Approve & Mint Prava Card" genuinely opens Prava's hosted checkout iframe,
  correctly populated with our real merchant name, product, and total.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.

## 4. One bug found and fixed

`revokeSession` was sending `Content-Type: application/json` with a truly
empty body. Prava's API rejects that combination
(`FST_ERR_CTP_EMPTY_JSON_BODY`). Fixed by sending `{}` instead.

## 5. What's NOT yet confirmed

**Nobody has clicked all the way through the real UI as a human yet** — enter
a sandbox card into Prava's iframe, pass OTP/passkey, watch the reasoning feed
go `CARD_MINTING` → `CHECKOUT_AUTOMATION` → "Complete · Card Expired" in the
browser. Every piece has been verified working independently (automation via
a script, the UI up to where Prava's iframe mounts), but never chained
together live by a person. **That's what the walkthrough below is for.**

Also known and out of scope for this branch (see the guide's Reality Check):
no real accounts, so shipping address is a fixed placeholder; catalog is still
synthetic (Route B, not A); Playwright won't run on Vercel serverless — needs
a container host to actually deploy.

---

## 6. How to test it (manual walkthrough)

### One-time setup (each teammate, on their own machine)

```bash
git checkout feature/prava-playwright
npm install
npx playwright install chromium
```

Then set up `.env.local` (copy from `.env.example`, never commit real keys):

```bash
PRAVA_SECRET_KEY=sk_test_...
NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY=pk_test_...
PRAVA_API_BASE=https://sandbox.api.prava.space
PRAVA_ENVIRONMENT=sandbox
PLAYWRIGHT_HEADLESS=true
```

Get your own free sandbox keys at [dashboard.prava.space](https://dashboard.prava.space)
(no business verification needed for sandbox), or ask Ved to share sandbox
keys directly (Slack/DM — never through git).

### Run it

```bash
npm run dev
```

1. Open `http://localhost:3000`, build a stack (or skip straight to `/compare`
   — it falls back to a sensible default stack).
2. On `/compare`, wait for the reasoning feed to finish auditing.
3. Click **"Authorize & Checkout."**
4. Click **"Approve & Mint Prava Card."** Prava's real hosted checkout form
   mounts inside the modal, showing your real product(s) and total.
5. Fill it in with Prava's sandbox test data:
   - Shipping: any fake address (e.g. `123 Main St`, `West Lafayette`, `IN`, `47906`)
   - Card number: `4622 9431 2313 7789`
   - Month/Year: `12` / `27`
   - CVV: `757`
   - Cardholder name: anything
6. Click **"Pay Now."** If prompted for an OTP, sandbox OTP is always
   `456789`. You may then be asked to register a passkey (Face ID / Touch ID /
   Windows Hello) — that's Prava's real biometric flow, not ours.
7. Modal should show "Minting single-use card…" then "Passkey Verified & Card
   Minted!"
8. Watch the reasoning feed: `CARD_MINTING` → `CHECKOUT_AUTOMATION` should
   appear within ~5–10s (Playwright running headless against `/mock-merchant`
   in the background), ending in an order ID and "Card Expired."
9. Check `public/demo-proof/` for the screenshots from that run.
10. Optional — the money-shot: go to `http://localhost:3000/mock-merchant/order/<the order id>`
    and click **"Simulate renewal charge."** It should decline, because the
    card was already redeemed.

### If something goes wrong

- **Session creation errors on the first try**: Prava's sandbox threw one
  random 500 during testing that resolved on retry with zero code changes —
  looked like transient infra flakiness on their end. Try once more before
  assuming it's a real bug.
- **Merchant URL must be https**: if you touch `src/app/api/prava/session/route.ts`,
  note Prava requires an `https://` merchant URL even in sandbox (forwarded to
  Visa) — a plain `http://localhost:3000` URL will fail.
- Check the terminal running `npm run dev` for the actual server-side error —
  API failures return `{ error: "..." }` with details.

---

## 7. Not done yet

Steps 5–6 of the guide are complete. Not started: the Linq iMessage stretch
goal (deliberately ranked last in the guide — do this only after everything
above is solid).
