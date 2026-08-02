/**
 * End-to-end verification suite.
 *
 * Exercises every layer against a running dev server and asserts on real
 * responses — including the negative cases, which are where the interesting
 * bugs hide. Written because "it worked when I curled it" is not a test.
 *
 * Deliberately does NOT hit Prava's live sandbox: it has a daily transaction
 * limit and needs a human at the approval screen. Run `npm run prava:doctor`
 * for that. This suite covers the payments layer in SIMULATED mode, which
 * exercises identical code paths either side of the credential itself.
 *
 * Usage:
 *   npm run dev            (in another terminal, PRAVA_SECRET_KEY unset)
 *   npm run verify
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
let group = '';

const g = (name) => {
  group = name;
  console.log(`\n${name}`);
};

function skip(label, why) {
  skipped++;
  console.log(`  ~ ${label}  (skipped: ${why})`);
}

function ok(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${group} → ${label}${detail ? `\n      ${detail}` : ''}`);
    console.log(`  ✗ ${label}${detail ? `  (${detail})` : ''}`);
  }
}

async function req(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

const json = (payload) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

// ---------------------------------------------------------------- reachability

const health = await fetch(BASE).catch(() => null);
if (!health?.ok) {
  console.error(`Cannot reach ${BASE}. Start it first:  npm run dev`);
  process.exit(1);
}

// ------------------------------------------------------------------- optimizer

g('Optimizer');
{
  const r = await req('/api/optimize', json({
    targetBudgetUSD: 250,
    targetIngredients: ['Creatine', 'Whey Protein', 'Electrolytes'],
  }));
  const d = r.body;

  ok('returns 200', r.status === 200, `got ${r.status}`);
  ok('recommends products', Array.isArray(d.recommendedProducts) && d.recommendedProducts.length > 0);
  ok('stays within budget', d.totalDiscountedPriceUSD <= 250,
     `$${d.totalDiscountedPriceUSD} > $250`);
  ok('savings are consistent',
     Math.abs((d.totalOriginalPriceUSD - d.totalDiscountedPriceUSD) - d.totalSavingsUSD) < 0.02,
     `${d.totalOriginalPriceUSD} - ${d.totalDiscountedPriceUSD} != ${d.totalSavingsUSD}`);
  ok('confidence is 0..1', d.confidenceScore >= 0 && d.confidenceScore <= 1);

  const steps = new Set(d.reasoningLogs.map((l) => l.step));
  ok('emits LABEL_AUDIT', steps.has('LABEL_AUDIT'));
  ok('emits COST_CALCULATION', steps.has('COST_CALCULATION'));
  ok('emits STACK_OPTIMIZATION', steps.has('STACK_OPTIMIZATION'));
  ok('emits TRUST_VERIFICATION', steps.has('TRUST_VERIFICATION'));

  // Cost per active gram must match the documented formula, purity as 0-100.
  const p = d.recommendedProducts[0];
  const grams = p.servingsPerContainer *
    p.activeIngredients.reduce((s, i) => s + i.amountPerServingGrams * (i.purityPercentage / 100), 0);
  const expected = p.totalPriceUSD / grams;
  ok('cost-per-active-gram math is correct',
     Math.abs(p.costPerGramActiveUSD - expected) < 0.001,
     `${p.costPerGramActiveUSD} vs ${expected.toFixed(4)}`);

  ok('discounted price matches the discount',
     Math.abs(p.discountedPriceUSD - p.totalPriceUSD * (1 - p.subscribeAndSaveDiscountPct / 100)) < 0.02);

  // Every audit must declare which engine produced it.
  const audits = d.reasoningLogs.filter((l) => l.metadata?.source);
  ok('every audit declares its source', audits.length > 0 &&
     audits.every((l) => typeof l.metadata.source === 'string'));
}

g('Optimizer — streaming');
{
  const res = await fetch(`${BASE}/api/optimize?stream=1`, json({
    targetBudgetUSD: 120, targetIngredients: ['Creatine'],
  }));
  ok('content-type is SSE', (res.headers.get('content-type') ?? '').includes('text/event-stream'));
  ok('is chunked, not buffered', res.headers.get('content-length') === null);

  const text = await res.text();
  ok('emits log events', text.includes('event: log'));
  ok('emits a terminal result', text.includes('event: result'));
  ok('result is last', text.lastIndexOf('event: result') > text.lastIndexOf('event: log'));
}

g('Optimizer — bad input');
{
  ok('rejects negative budget',
     (await req('/api/optimize', json({ targetBudgetUSD: -5, targetIngredients: ['Creatine'] }))).status === 400);
  ok('rejects empty ingredients',
     (await req('/api/optimize', json({ targetBudgetUSD: 50, targetIngredients: [] }))).status === 400);
  ok('rejects malformed JSON',
     (await fetch(`${BASE}/api/optimize`, {
       method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json',
     })).status === 400);

  const unknown = await req('/api/optimize', json({ targetBudgetUSD: 50, targetIngredients: ['Unobtainium'] }));
  ok('handles an unknown ingredient without crashing', unknown.status === 200);
  ok('returns nothing for an unknown ingredient', unknown.body.recommendedProducts.length === 0);

  const broke = await req('/api/optimize', json({ targetBudgetUSD: 3, targetIngredients: ['Creatine'] }));
  ok('handles a budget that affords nothing', broke.status === 200 &&
     broke.body.recommendedProducts.length === 0);
}

// ---------------------------------------------------------------- label audits

g('Label auditing');
{
  const r = await req('/api/audit-label', json({ imageUrl: '/labels/prop_creasurge_matrix' }));
  ok('audits a known label', r.status === 200);
  ok('extracts active ingredients', r.body.audit?.activeIngredients?.length > 0);
  ok('flags the proprietary blend', (r.body.audit?.fillerCallouts ?? []).length > 0);
  ok('reports a source', ['LIVE_VISION_MODEL', 'DETERMINISTIC_MOCK'].includes(r.body.audit?.source));
  ok('confidence is 0..1', r.body.audit?.confidence >= 0 && r.body.audit?.confidence <= 1);

  ok('rejects an empty body', (await req('/api/audit-label', json({}))).status === 400);

  // Not "zero flags": a live model correctly notes minor excipients like the
  // silicon dioxide flow agent that is genuinely printed on the clean label.
  // The property that matters is discrimination between honest and deceptive.
  const clean = await req('/api/audit-label', json({ imageUrl: '/labels/creatine_bulk_500' }));
  const cleanFlags = clean.body.audit?.fillerCallouts ?? [];
  const blendFlags = r.body.audit?.fillerCallouts ?? [];
  ok('a clean label raises fewer flags than a blend',
     cleanFlags.length < blendFlags.length, `${cleanFlags.length} vs ${blendFlags.length}`);
  ok('a clean label has far less filler',
     clean.body.audit.fillerPercentage < r.body.audit.fillerPercentage / 2,
     `${clean.body.audit.fillerPercentage}% vs ${r.body.audit.fillerPercentage}%`);
  ok('no clean-label flag mentions a proprietary blend',
     !cleanFlags.some((f) => /proprietary|blend/i.test(f)));
}

g('Generated label images');
{
  const png = await fetch(`${BASE}/labels/creatine_bulk_500`);
  ok('renders a PNG', png.headers.get('content-type') === 'image/png');
  const buf = Buffer.from(await png.arrayBuffer());
  ok('PNG is non-trivial', buf.length > 10_000, `${buf.length} bytes`);
  ok('has a PNG magic number', buf[0] === 0x89 && buf[1] === 0x50);
  ok('unknown id is a 404', (await fetch(`${BASE}/labels/nope`)).status === 404);
}

// ----------------------------------------------------------------------- trust

g('Brand trust (Senso)');
{
  const r = await req('/api/trust');
  ok('reports trust status', r.status === 200);
  ok('lists catalog brands', Array.isArray(r.body.brands) && r.body.brands.length > 0);

  const one = await req(`/api/trust?brand=${encodeURIComponent('ApexLabs')}`);
  ok('returns a verdict for a brand', one.status === 200);
  ok('score is 0..1', one.body.score >= 0 && one.body.score <= 1);
  ok('grade is A-F', ['A', 'B', 'C', 'D', 'F'].includes(one.body.grade));
  ok('declares its source', typeof one.body.source === 'string');
  if (one.body.source === 'SENSO_VERIFIED') {
    ok('a flagged brand grades poorly', one.body.score < 0.5, `ApexLabs scored ${one.body.score}`);
    ok('carries citations', Array.isArray(one.body.citations) && one.body.citations.length > 0);
  } else {
    ok('unverified brands get a neutral score', one.body.score === 0.5);
  }
}

// ------------------------------------------------------------------------- MCP

g('MCP server');
{
  const call = (method, params) =>
    req('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

  const list = await call('tools/list', {});
  const names = (list.body?.result?.tools ?? []).map((t) => t.name);
  ok('exposes three tools', names.length === 3, names.join(', '));
  ok('has audit_supplement_label', names.includes('audit_supplement_label'));
  ok('has evaluate_ingredient_purity', names.includes('evaluate_ingredient_purity'));
  ok('has calculate_true_cost', names.includes('calculate_true_cost'));

  const cost = await call('tools/call', {
    name: 'calculate_true_cost', arguments: { productId: 'prop_creasurge_matrix' },
  });
  const parsed = JSON.parse(cost.body.result.content[0].text);
  ok('calculate_true_cost computes', parsed.costPerGramActiveUSD > 0);
  ok('  and matches the formula',
     Math.abs(parsed.costPerGramActiveUSD - parsed.totalPriceUSD / parsed.totalActiveGrams) < 0.001);

  const purity = await call('tools/call', {
    name: 'evaluate_ingredient_purity',
    arguments: { activeIngredients: [{ name: 'x', amountPerServingGrams: 1.5, purityPercentage: 65 }], servingSizeGrams: 5 },
  });
  const pp = JSON.parse(purity.body.result.content[0].text);
  ok('evaluate_ingredient_purity grades', ['A', 'B', 'C', 'D', 'F'].includes(pp.grade));
  ok('  and a filler-heavy serving fails', pp.grade === 'F', `got ${pp.grade}`);

  const bad = await call('tools/call', { name: 'calculate_true_cost', arguments: { productId: 'nope' } });
  ok('unknown product is a tool error', bad.body.result?.isError === true);
}

// ------------------------------------------------------------------------ auth

g('Accounts');
{
  const email = `verify_${Date.now()}@test.com`;

  const signup = await req('/api/auth/signup', json({ email, password: 'password123' }));
  ok('signup succeeds', signup.status === 200);

  const cookie = (signup.headers.get('set-cookie') ?? '').split(';')[0];
  ok('issues a session cookie', cookie.startsWith('macrostack_session='));

  ok('rejects a duplicate email',
     (await req('/api/auth/signup', json({ email, password: 'password123' }))).status === 400);
  ok('rejects a short password',
     (await req('/api/auth/signup', json({ email: `x${Date.now()}@t.com`, password: 'short' }))).status === 400);
  ok('rejects an invalid email',
     (await req('/api/auth/signup', json({ email: 'notanemail', password: 'password123' }))).status === 400);
  ok('rejects a wrong password',
     (await req('/api/auth/login', json({ email, password: 'wrongpassword' }))).status === 401);

  const wrongPw = await req('/api/auth/login', json({ email, password: 'wrongpassword' }));
  const unknownUser = await req('/api/auth/login', json({ email: 'nobody@nowhere.com', password: 'whatever12' }));
  ok('does not leak which half was wrong', wrongPw.body.error === unknownUser.body.error);

  const me = await req('/api/auth/me', { headers: { Cookie: cookie } });
  ok('session identifies the user', me.body.signedIn === true && me.body.email === email.toLowerCase());

  const forged = await req('/api/auth/me', { headers: { Cookie: 'macrostack_session=someone-else.badsig' } });
  ok('rejects a forged cookie', forged.body.signedIn === false);

  ok('profile is 401 when signed out', (await req('/api/profile')).status === 401);

  await req('/api/profile', {
    ...json({ kind: 'audit', ingredients: ['Creatine'], budgetUSD: 100, retailUSD: 24.99,
              discountedUSD: 21.24, savedUSD: 3.75, productCount: 1 }),
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  });
  const prof = await req('/api/profile', { headers: { Cookie: cookie } });
  ok('profile records the audit', prof.body.profile?.stacksAudited === 1);
  ok('profile starts with no orders', prof.body.profile?.ordersPlaced === 0);
}

// -------------------------------------------------------------------- payments

// Payment tests need a credential without a human at an approval screen, which
// only SIMULATED mode provides. Running against SANDBOX is a legitimate config,
// so skip rather than fail — and say so loudly.
const pravaEnv = (await req('/api/prava/mint-card')).body?.pravaEnvironment;
const canTestPayments = pravaEnv === 'SIMULATED';

g('Passkey guardrail');
{
  const ch = await req('/api/prava/challenge', json({ amountUSD: 45.03, merchantName: 'NutriMart (demo)' }));
  ok('issues a challenge', ch.status === 200 && !!ch.body.challengeId);
  ok('binds the amount', ch.body.amountUSD === 45.03);
  ok('declares its mode', ['SIMULATED', 'WEBAUTHN'].includes(ch.body.mode));
  if (ch.body.mode === 'SIMULATED') {
    ok('labels simulated authorization honestly', typeof ch.body.simulatedWarning === 'string');
  }

  const mint = await req('/api/prava/mint-card', json({
    amountUSD: 45.03, merchantName: 'NutriMart (demo)',
    challengeId: ch.body.challengeId, userPasskeySignature: ch.body.simulatedSignature,
  }));
  ok('mints against a valid challenge', mint.status === 200);
  if (!canTestPayments) {
    ok('  creates a real Prava session', Boolean(mint.body.session?.sessionId),
       `env=${pravaEnv}`);
  }

  const replay = await req('/api/prava/mint-card', json({
    amountUSD: 45.03, merchantName: 'NutriMart (demo)',
    challengeId: ch.body.challengeId, userPasskeySignature: ch.body.simulatedSignature,
  }));
  ok('a replayed challenge is rejected', replay.status === 401, `got ${replay.status}`);

  const ch2 = await req('/api/prava/challenge', json({ amountUSD: 10, merchantName: 'NutriMart (demo)' }));
  const tampered = await req('/api/prava/mint-card', json({
    amountUSD: 999, merchantName: 'NutriMart (demo)',
    challengeId: ch2.body.challengeId, userPasskeySignature: ch2.body.simulatedSignature,
  }));
  ok('an amount mismatch is rejected', tampered.status === 401, `got ${tampered.status}`);

  const ch3 = await req('/api/prava/challenge', json({ amountUSD: 10, merchantName: 'NutriMart (demo)' }));
  const wrongMerchant = await req('/api/prava/mint-card', json({
    amountUSD: 10, merchantName: 'Evil Store',
    challengeId: ch3.body.challengeId, userPasskeySignature: ch3.body.simulatedSignature,
  }));
  ok('a merchant mismatch is rejected', wrongMerchant.status === 401, `got ${wrongMerchant.status}`);

  const badSig = await req('/api/prava/mint-card', json({
    amountUSD: 10, merchantName: 'NutriMart (demo)',
    challengeId: (await req('/api/prava/challenge', json({ amountUSD: 10, merchantName: 'NutriMart (demo)' }))).body.challengeId,
    userPasskeySignature: 'obviously-wrong',
  }));
  ok('a bad signature is rejected', badSig.status === 401, `got ${badSig.status}`);

  globalThis.__card = mint.body.card;
}

g('Checkout automation');
{
  const card = globalThis.__card;
  if (!canTestPayments) {
    skip('checkout automation', `PRAVA_ENVIRONMENT=${pravaEnv} needs a human at Prava's approval screen — run with PRAVA_SECRET_KEY= to cover this`);
  } else if (!card) {
    ok('card available for checkout', false, 'minting failed above');
  } else {
    ok('card is capped at the approved amount', card.amountCapUSD === 45.03);
    ok('card is single-use', card.isSingleUse === true);
    ok('card declares its environment', ['SANDBOX', 'PRODUCTION', 'SIMULATED'].includes(card.environment));

    const opt = await req('/api/optimize', json({
      targetBudgetUSD: 250, targetIngredients: ['Creatine', 'L-Citrulline'],
    }));
    const products = opt.body.recommendedProducts;

    const run = await req('/api/checkout/execute', json({
      products,
      shippingAddress: {
        fullName: 'Verify Bot', streetAddress: '1 Market St', city: 'SF',
        state: 'CA', zipCode: '94105', email: 'verify@macrostack.test',
      },
      cardDetails: card,
    }));

    const result = run.body.result;
    ok('checkout completes', result?.success === true, JSON.stringify(result?.executionLogs?.slice(-2)));
    ok('every product produced an order',
       (result?.orderId ?? '').split(',').filter(Boolean).length === products.length);
    ok('charged the discounted total',
       Math.abs(result.amountChargedUSD - products.reduce((s, p) => s + p.discountedPriceUSD, 0)) < 0.02);
    ok('card is retired afterwards', result.cardStatusAfterCheckout === 'EXPIRED_SAFELY');
    ok('logged the Subscribe & Save selection',
       result.executionLogs.some((l) => /Subscribe & Save/.test(l)));
    ok('reconciled the merchant total before paying',
       result.executionLogs.some((l) => /Verified merchant total/.test(l)));
    ok('reported the outcome to Prava',
       result.executionLogs.some((l) => /Reported outcome to Prava/.test(l)));

    globalThis.__orderId = (result.orderId ?? '').split(',')[0].trim();
    globalThis.__cardNumber = card.cardNumber;
  }
}

g('Auto-renewal shield');
{
  const orderId = globalThis.__orderId;
  if (!canTestPayments) {
    skip('auto-renewal shield', 'depends on a completed checkout');
  } else if (!orderId) {
    ok('order available', false, 'checkout failed above');
  } else {
    const renew = await req('/api/mock-merchant/renew', json({ orderId }));
    ok('the next billing cycle is DECLINED', renew.body.charged === false, renew.body.reason);
    ok('the decline names the retired card', /single-use|retired/i.test(renew.body.reason));

    const replay = await req('/api/mock-merchant/order', json({
      productName: 'Replay attempt', unitPriceUSD: 24.99, quantity: 1,
      subscribeAndSave: true, discountPct: 15, totalChargedUSD: 21.24,
      cardNumber: globalThis.__cardNumber, email: 'verify@macrostack.test', shippingName: 'Verify Bot',
    }));
    ok('a replayed checkout is refused', replay.status === 402, `got ${replay.status}`);

    const order = await req(`/api/mock-merchant/order?orderId=${encodeURIComponent(orderId)}`);
    ok('order is readable', order.status === 200);
    ok('order never exposes the full PAN', order.body.cardNumber === undefined);
    ok('unknown order is a 404',
       (await req('/api/mock-merchant/order?orderId=NOPE')).status === 404);
  }
}

// ------------------------------------------------- agent link & system status

g('Prava agent link and status');
{
  const status = await req('/api/status');
  ok('status endpoint responds', status.status === 200, `got ${status.status}`);
  ok('status reports every integration',
     Array.isArray(status.body.integrations) && status.body.integrations.length >= 6,
     `got ${status.body.integrations?.length}`);
  ok('every integration states a health',
     (status.body.integrations ?? []).every((i) => ['live', 'degraded', 'off'].includes(i.health)));
  ok('status never leaks a key value',
     !JSON.stringify(status.body).match(/sk_|gsk_|AQ\.Ab8|pk_test/));

  const link = await req('/api/prava/link');
  ok('link status responds', link.status === 200, `got ${link.status}`);
  ok('link status reports whether it is linked', typeof link.body.linked === 'boolean');

  // The private half of the agent key must never cross the wire.
  ok('link status never returns the private key',
     !JSON.stringify(link.body).includes('privateKey'));

  const products = await req('/api/optimize', json({
    targetBudgetUSD: 120, targetIngredients: ['Creatine'],
  }));
  ok('optimize reports which source produced the products',
     ['PRAVA_SHOP_SEARCH', 'LIVE_RETAIL_SEARCH', 'SEED_CATALOG'].includes(products.body.productSource),
     `got ${products.body.productSource}`);

  if (link.body.linked) {
    ok('a linked agent gets real merchant products',
       products.body.productSource === 'PRAVA_SHOP_SEARCH',
       `linked but source was ${products.body.productSource}`);
    ok('real products link to a real merchant page',
       (products.body.recommendedProducts ?? []).every((p) => /^https:\/\//.test(p.checkoutUrl)));
  } else {
    skip('real merchant products (agent not linked — visit /setup)');
  }
}

// ----------------------------------------------------------------------- pages

g('Pages render');
{
  for (const [label, path] of [
    ['landing', '/'], ['compare', '/compare'], ['agent console', '/agent'],
    ['setup', '/setup'],
    ['login', '/login'], ['signup', '/signup'], ['profile', '/profile'],
    ['mock merchant', '/mock-merchant?product=Test&price=24.99&discount=15'],
  ]) {
    const res = await fetch(`${BASE}${path}`);
    ok(`${label} responds 200`, res.status === 200, `got ${res.status}`);
  }
}

// ---------------------------------------------------------------------- report

console.log(`\n${'─'.repeat(60)}`);
console.log(`${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
if (skipped) console.log(`(prava environment: ${pravaEnv})`);

if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
