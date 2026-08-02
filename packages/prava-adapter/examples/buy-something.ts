/**
 * End-to-end: link an agent, find a product, buy it with a capped single-use
 * card, and report the outcome.
 *
 *   PRAVA_SECRET_KEY=sk_test_... PRAVA_USER_EMAIL=you@gmail.com \
 *     npx tsx examples/buy-something.ts "creatine monohydrate"
 */

import { PravaAdapter, FileIdentityStore } from '../src/index';

const prava = new PravaAdapter({
  secretKey: process.env.PRAVA_SECRET_KEY,
  userEmail: process.env.PRAVA_USER_EMAIL ?? '',
  store: new FileIdentityStore(),
  agent: { name: 'ExampleAgent', platform: 'node', description: 'Buys one thing' },
});

// 1. Link once. A human approves in the browser; the private key stays here.
if (!(await prava.isLinked())) {
  const { linkUrl } = await prava.link();
  console.log(`Approve this agent, then re-run:\n  ${linkUrl}`);
  process.exit(0);
}

// 2. Discover. Real merchants, live prices.
const [product] = await prava.search(process.argv[2] ?? 'creatine', 5);
if (!product) throw new Error('Nothing found');
console.log(`Chosen: ${product.title} — $${product.priceUSD} at ${product.merchant}`);

// 3. Create a session scoped to THIS purchase and THIS merchant.
const session = await prava.createSession({
  totalUSD: product.priceUSD,
  merchantName: product.merchant,
  merchantUrl: `https://${product.merchant}`,
  products: [{ description: product.title, unitPriceUSD: product.priceUSD }],
});
console.log(`Approve the payment:\n  ${session.approvalUrl}`);

// 4. Wait for the human. Returns null on timeout rather than hanging forever,
//    so a caller can degrade instead of stranding the purchase.
const card = await prava.waitForCard(session.sessionId);
if (!card) {
  console.log('Not approved in time — nothing was charged.');
  process.exit(0);
}

console.log(`Card issued: ****${card.token.slice(-4)}, capped at $${card.amountCapUSD}`);

// 5. Spend it at the merchant, then tell Prava how it went. The card is
//    single-use: a renewal attempt against it will be declined.
await prava.reportStatus(session.sessionId, card.txnRefId, 'success');
console.log('Done. That card cannot be charged again.');
