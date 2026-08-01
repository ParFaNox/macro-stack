# MacroStack — Agent, Trust & Payments

An autonomous supplement buyer: it audits nutrition labels with a vision model,
ranks products on true cost per active gram weighted by third-party trust, then
**completes the purchase** with a single-use Prava card that dies before the
subscription can renew.

The vision provider is env-only (`VISION_BASE_URL` / `VISION_MODEL`). Defaults to
OpenAI `gpt-4o`; Google Gemini is documented as a free alternative and is what
the committed label cache was warmed on.

## Setup

```bash
cp .env.example .env.local && npm install && npm run dev
```

**No API key is required for any of it.** With `VISION_API_KEY`, `SENSO_API_KEY`
and `PRAVA_SECRET_KEY` all blank the app still runs end to end — label audits,
trust scores and cards each fall back to a clearly-labelled offline mode. Every
audit carries a `source` field (`LIVE_VISION_MODEL` | `DETERMINISTIC_MOCK`) that
is echoed into the reasoning logs — a demo never silently passes mock output off
as a real model call. For live audits, get a free key from
[Google AI Studio](https://aistudio.google.com/apikey) and set `VISION_API_KEY`.

> A Google AI Pro consumer subscription does **not** grant Gemini API quota. The
> AI Studio key has its own separate free tier.

## Endpoints

### `POST /api/optimize` → `StackOptimizationResult`

```bash
curl -s -X POST localhost:3000/api/optimize \
  -H 'content-type: application/json' \
  -d '{"targetBudgetUSD":80,"targetIngredients":["Creatine","L-Citrulline"]}'
```

Add `?stream=1` for Server-Sent Events: one `log` event per reasoning step as it
happens, then a terminal `result` event.

> **Demo tip:** offline mock audits do no I/O, so the optimizer finishes in
> under a millisecond and all ~18 logs arrive in the same frame — the reasoning
> feed pops instead of animating. Set `AGENT_LOG_DELAY_MS=150` in `.env.local`
> to pace the stream. Leave it at `0` once a real vision key is configured,
> since each label audit is then already a network round-trip.

```bash
curl -N -X POST 'localhost:3000/api/optimize?stream=1' \
  -H 'content-type: application/json' \
  -d '{"targetBudgetUSD":120,"targetIngredients":["Creatine","Whey Protein","Beta-Alanine"]}'
```

`GET /api/optimize` returns the list of optimizable ingredient families.

### `POST /api/audit-label` → `{ audit, reasoningLogs }`

```bash
curl -s -X POST localhost:3000/api/audit-label \
  -H 'content-type: application/json' \
  -d '{"imageUrl":"/labels/creatine-bulk.jpg"}'
```

Also accepts `multipart/form-data` with an `image` file field (10MB cap).

### `GET|POST /api/mcp` — Model Context Protocol server

Three tools: `audit_supplement_label`, `evaluate_ingredient_purity`,
`calculate_true_cost`. Stateless Streamable HTTP transport, mounted in-app.

```bash
npx @modelcontextprotocol/inspector
```

…then connect to `http://localhost:3000/api/mcp`.

## Brand trust (Senso)

Cost per active gram alone can recommend a brand that is cheap *because* it cuts
corners. `src/lib/agent/trust-signal.ts` asks a second question — can this brand
be trusted? — against a Senso knowledge base of third-party verification
records, and folds the answer into the ranking.

```bash
npm run ingest-trust                          # seed the knowledge base (once)
npm run warm-trust && npm run save-trust-cache # cache verdicts, commit the seed
```

Ranking sorts on **trust-adjusted** cost per gram. A neutral score (0.5) leaves
the number untouched, so with no Senso key the app ranks exactly as before —
trust can only reorder things when there is real evidence behind it. The penalty
is capped at 2x so a bad grade demotes a product without making it unpickable,
and the raw price is always shown alongside.

Worth being precise about what is real: **Senso genuinely retrieves and
synthesises**, and the verdict shown to the user is its words. The *corpus* is
seeded — our catalog brands are fictional, so no real NSF or FDA record exists
for them (see `trust-corpus.ts`, which says so on every document). Point
`ingest-trust` at real NSF Certified for Sport listings, Informed Sport's batch
database and FDA warning letters and nothing downstream changes.

`GET /api/trust` reports cache status; `GET /api/trust?brand=X` returns one verdict.

### Two scoring approaches that failed

Recorded so nobody reintroduces them:

1. **Keyword-matching Senso's answer.** `"not NSF certified"` contains
   `"NSF certified"`, so absence of a certification scored as a positive.
   MassLine — no certification, amino spiking — came out grade B.
2. **Regex over the retrieved record.** Senso chunks documents, so a single
   chunk rarely holds every field, and `"no warning letters"` still matches
   `/warning letter/`.

Now a small model pass converts Senso's answer into `{score, signals}`. It
handles negation natively, runs once per brand, and is cached. `TRUST_MODEL` is
separate from `VISION_MODEL` because providers meter quota per model — sharing
one bucket made label audits and trust scoring starve each other.

## Payments: Prava (the agent completes the transaction)

The agent does not stop at a recommendation. It mints a single-use card capped
at the exact approved total, drives the merchant's checkout in a real browser,
and retires the credential so the subscription discount is captured but the
recurring charge that normally follows it cannot land.

```
passkey challenge  → /api/prava/challenge   (bound to amount + merchant, single-use)
mint               → /api/prava/mint-card   (verifies server-side, creates Prava session)
user approves      → Prava's hosted surface (never bypassed — this is the guardrail)
credential         → /api/prava/mint-card?sessionId=…
checkout           → /api/checkout/execute?stream=1  (Playwright, SSE progress)
settle             → Prava report-status APPROVED/DECLINED
```

Verified against the live sandbox: `POST /v1/sessions` returns 201, and
`payment-result` correctly reports `pending` until a human approves. Reusing a
passkey challenge returns 401.

Verified end to end in simulated mode: 5 products, $180.20 charged, all orders
placed, card retired, and the merchant's **next billing cycle declines**. A
replayed checkout with the same credential returns 402.

**Without `PRAVA_SECRET_KEY` everything still runs**, labelled `SIMULATED` in
every log and API response. Nothing is ever presented as a real card that isn't.

### The merchant is ours, on purpose

`/mock-merchant` is a simulated storefront, labelled as such on every page. The
catalog products are synthetic, so there is no real listing to buy — and a
sandbox card would be declined at a real store anyway. This is the same shape as
developing against Stripe test mode with your own checkout. Every Prava call
around it is real, and going live is `PRAVA_ENVIRONMENT=production` plus a real
merchant URL; the code path does not change.

It also buys something a real merchant could not: `/mock-merchant/confirmation`
has a **Simulate next billing cycle** button, so the auto-renewal shield is
demonstrable rather than asserted.

### Passkey guardrail

Verification runs server-side in `/api/prava/mint-card`, before any Prava call.
The challenge binds the amount and merchant and is single-use, so an approval
for one basket cannot be replayed against another.

Simulated mode does not stage fake ceremony — the server returns the signature
and labels it as proving only that the caller saw a server-issued challenge,
**not** that a human approved anything. `PASSKEY_MODE=webauthn` deliberately
refuses to mint until a real credential registry is wired, because failing
closed is the safe direction.

## Accounts

`/signup` and `/login` are real: scrypt-hashed passwords, signed HMAC session
cookies, forged cookies rejected. `/profile` derives every figure from actual
audit and order history — it previously showed hardcoded strings.

The user store is in-memory and pinned to `globalThis`. Restart and accounts are
gone; it will not work across instances. Swapping the three maps in
`src/lib/auth/session.ts` for a database is the only change needed.

## Deploying

**Playwright does not run on Vercel serverless.** Use a container host — Fly.io,
Railway, Render — or split the checkout runner into a worker. Everything else
deploys anywhere.

The label-audit and brand-trust caches ship as committed seeds, so a cold start
is warm and costs no API quota. Re-run `warm-labels` / `warm-trust` and their
`save-*-cache` counterparts after changing `VISION_MODEL`.

## Where products come from

`src/lib/agent/product-search.ts` is the single seam between "what products
exist" and everything that reasons about them. Two providers:

| Provider | When it runs | What you get |
| --- | --- | --- |
| `seed` | default | The built-in 15-product catalog. Offline, deterministic, always works. |
| `brightdata` | `BRIGHTDATA_API_KEY` + `BRIGHTDATA_SERP_ZONE` set | Live retailer listings via Bright Data's SERP API (Google Shopping), normalised into `CatalogEntry` shape by the LLM. |

The live provider falls back to the seed catalog on **any** failure — missing
key, network, quota, unparseable response — and the reason appears in the
reasoning logs. Force the offline catalog with `PRODUCT_SEARCH_PROVIDER=seed`.

> **Untested path.** The Bright Data provider is written against the documented
> SERP API but has never been executed — there was no account or key available
> when it was built. Expect to debug the response shape on first real run. The
> seed path is fully tested and is what every verification above exercised.

Live listings have no supplement-facts panel to read, so the product photo is
passed to the auditor as the label. Gemini will report low confidence when it
isn't a facts panel, which is the honest outcome rather than pretending a label
was audited.

## Frontend integration (Teammate 1)

Replace the `setTimeout` mock in `src/app/compare/page.tsx` with one call from
`src/lib/agent/client.ts`. The return types are the same shared interfaces your
components already render, so nothing else changes:

```ts
import { streamOptimizeStack } from '@/lib/agent/client';

await streamOptimizeStack(
  { targetBudgetUSD: 150, targetIngredients: stackCart },
  {
    onLog: (log) => setReasoningLogs((prev) => [...prev, log]),
    onResult: (result) => {
      setAuditedProducts(result.recommendedProducts);
      setIsAuditing(false);
    },
  },
);
```

`optimizeStack()` is the non-streaming equivalent if you'd rather not animate.

## The cost-per-gram formula

The task doc specifies:

```
totalPriceUSD / (servingsPerContainer * sumOfActiveGrams * purityPercentage)
```

`purityPercentage` is stored 0–100 (e.g. `99.5`), so using it raw makes the
result ~100× too small. The implementation divides purity by 100:

```
totalPriceUSD / (servingsPerContainer * SUM(amountPerServingGrams * purityPercentage/100))
```

This number is rendered in the UI, so the units matter.

## Layout

| File | Purpose |
| --- | --- |
| `src/lib/agent/catalog.ts` | Seed product catalog (swap for a live feed) |
| `src/lib/agent/vision-auditor.ts` | Gemini vision audit + deterministic mock fallback |
| `src/lib/agent/optimizer-engine.ts` | Cost-per-active-gram math + stack selection |
| `src/lib/agent/logger.ts` | `AgentReasoningLog` factory + SSE collector |
| `src/lib/agent/mcp-tools.ts` | Tool schemas/handlers, shared by MCP and HTTP |
| `src/lib/agent/client.ts` | Typed browser client for Teammate 1 |
| `src/lib/mcp/server.ts` | MCP server wiring |
| `src/types/agent.ts` | Agent-only types (shared `src/types/index.ts` untouched) |

## Selection algorithm

Coverage-first greedy fill. Each requested ingredient family is ranked by true
cost per active gram; families are then visited best-value-first and the best
product that fits the remaining budget is taken, stepping down to cheaper
options when the top pick doesn't fit.

A true knapsack would squeeze out marginally more value, but the candidate set
is tiny and this ordering is *explainable* — every pick carries a one-line
reason and the list of what it beat, which is what the reasoning feed shows.
Covering more requested ingredients also beats shaving a dollar off a stack that
skips one entirely.

The catalog deliberately contains three proprietary-blend products (`prop_*`)
that look competitive on sticker price but are mostly filler, so the optimizer
visibly rejects something during a demo.
