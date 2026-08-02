# @macrostack/prava-adapter

A reusable Prava payments adapter for autonomous agents — agent identity,
product discovery, and single-use amount-capped cards.

Extracted from [MacroStack AI](../../README.md), where every path here has been
run against Prava's sandbox end to end, including the failure modes. The failure
modes are most of what this package is worth: Prava's errors surface several
steps away from the input that caused them, so this adapter validates the things
that will otherwise cost you an evening.

---

## Install

No dependencies beyond Node 20+ (`node:crypto` and global `fetch`).

```bash
cp -r packages/prava-adapter /your/project/prava-adapter
```

```ts
import { PravaAdapter, FileIdentityStore } from './prava-adapter/src/index';
```

---

## Use

```ts
const prava = new PravaAdapter({
  secretKey: process.env.PRAVA_SECRET_KEY,   // omit for discovery only
  userEmail: 'you@gmail.com',                // MUST be routable — see below
  store: new FileIdentityStore(),
  agent: { name: 'MyAgent', platform: 'node', description: 'Buys things' },
});
```

### 1. Link the agent — once

Prava's shopping API is not OAuth-gated. It authenticates the *agent* with an
Ed25519 keypair: you register the public half, a human approves once, and every
later request is signed over `timestamp + body`.

```ts
if (!(await prava.isLinked())) {
  const { linkUrl } = await prava.link();
  console.log(`Approve here: ${linkUrl}`);   // expires in ~15 minutes
}
```

The private key never leaves your process, so a stolen link id cannot act as
your agent.

### 2. Discover products

```ts
const hits = await prava.search('creatine monohydrate', 5);
// → [{ title, merchant, priceUSD, imageUrl, url, productId }]
```

Real merchants, live prices, and `url` points at the merchant's own storefront.
No API key needed — discovery is authorised by agent signature.

### 3. Create a session for one specific purchase

```ts
const session = await prava.createSession({
  totalUSD: 24.95,
  merchantName: 'PEScience',
  merchantUrl: 'https://www.pescience.com',
  products: [{ description: 'TruCreatine+ Powder', unitPriceUSD: 24.95 }],
});
// open session.approvalUrl — human approves + completes the passkey
```

### 4. Wait for the card

```ts
const card = await prava.waitForCard(session.sessionId, { timeoutMs: 180_000 });
if (!card) { /* nobody approved — nothing charged, degrade gracefully */ }
```

Returns `null` on timeout rather than throwing. A human who walked away should
not hang your agent.

You get a network token, a dynamic cryptogram, an expiry and the amount cap.
Use the token as the card number and the cryptogram as the CVV.

### 5. Report the outcome

```ts
await prava.reportStatus(session.sessionId, card.txnRefId, 'success');
```

The card is single-use. A renewal attempt against it is declined — which is the
entire security argument for letting an agent spend money at all.

---

## Failure modes

Every one of these cost us real time. Each fails with an error pointing
somewhere other than the cause, so the adapter validates up front where it can.

| Symptom | Actual cause |
|---|---|
| Opaque `400` during passkey registration, **no Touch ID prompt ever appears** | `user_email` on a reserved TLD (`.test`, `.example`). The passkey binds to a cardholder identity, so it must be real. Looks like a browser bug; isn't. **Adapter throws before the request.** |
| `FETCH_AGENTIC_CREDS_ERROR` — "Visa 400, fetching cryptogram failed", *after* the passkey succeeds | `merchant_url` is reserved or non-https. Visa scopes the credential to a merchant, so it must be one that could exist. **Adapter throws before the request.** |
| Same cryptogram error, with valid inputs | The sandbox test card is spent. A card survives one or two passes. **Change cards before debugging anything else.** |
| `PROVISION_ERROR 403` | `merchant_url` is `http://localhost`. Must be a reachable https origin. |
| Agent silently "not linked" after a restart | Identity was held in module scope and lost. Use `FileIdentityStore`, or implement `IdentityStore` against a secret store. |
| `401` on wallet calls with a correct key | The canonical signing string is order-sensitive. Do not rebuild the body between signing and sending — the signature covers exact bytes. |

Sandbox does not mean the inputs can be fictional.

---

## Design notes

- **Storage is injected.** `MemoryIdentityStore` for a single long-lived
  process, `FileIdentityStore` for local dev, or implement `IdentityStore`
  yourself for serverless.
- **Discovery and payment are separable.** `search()` needs only a linked
  agent; `createSession()` needs a secret key. Payment methods throw a clear
  error rather than failing obscurely when the key is missing.
- **Timeouts everywhere.** A merchant search that hangs is worse than one that
  fails — we once watched a single query take 306 seconds.
- **No money is spent by this adapter.** It creates sessions and receives
  credentials. Charging happens at the merchant, with a card that is already
  capped.

## Verified

The full flow completed against Prava's sandbox on a real card:
session `ses_01KZ1WKMKGZD676K7E0WRPGD5C`, status `completed` — agent decides →
capped single-use card issued → checkout → renewal **declined**.
