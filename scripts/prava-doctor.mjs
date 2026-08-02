/**
 * Prava sandbox diagnostic.
 *
 * Creates exactly ONE session, prints the approval URL, then polls until the
 * credential appears or provisioning fails — and prints Prava's actual error
 * code rather than a generic timeout.
 *
 * One session per run is deliberate. Prava's sandbox has a daily transaction
 * limit and other teams have burned theirs on retries; if this fails, read the
 * error before running it again.
 *
 * Usage:
 *   npm run prava:doctor
 *   npm run prava:doctor -- --amount 21.24 --merchant-url https://example.com
 */

import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const KEY = process.env.PRAVA_SECRET_KEY?.trim();
const BASE = process.env.PRAVA_API_BASE?.trim() || 'https://sandbox.api.prava.space/v1';
const MERCHANT_URL = arg('merchant-url', process.env.PRAVA_MERCHANT_URL?.trim() || 'https://nutrimart-demo.example.com');
const AMOUNT = Number(arg('amount', '21.24'));

if (!KEY) {
  console.error('PRAVA_SECRET_KEY is not set in .env.local.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

console.log(`Prava sandbox doctor
  base         ${BASE}
  merchant_url ${MERCHANT_URL}
  amount       $${AMOUNT.toFixed(2)}
`);

const created = await api('/sessions', {
  method: 'POST',
  body: JSON.stringify({
    user_id: 'macrostack_doctor',
    user_email: process.env.PRAVA_USER_EMAIL?.trim() || 'demo@macrostack.ai',
    total_amount: AMOUNT.toFixed(2),
    currency: 'USD',
    integration_type: 'full_checkout',
    purchase_context: [
      {
        merchant_details: { name: 'NutriMart demo', url: MERCHANT_URL, country_code_iso2: 'US' },
        product_details: [
          { description: 'MacroStack supplement stack', unit_price: AMOUNT.toFixed(2), quantity: 1 },
        ],
      },
    ],
  }),
});

if (!created.ok) {
  console.error(`✗ Session creation failed — HTTP ${created.status}`);
  console.error(JSON.stringify(created.body, null, 2).slice(0, 800));
  console.error(`
If this is INTERNAL_ERROR / HTTP 500, the sandbox itself is likely down —
other teams have hit the same thing. Check #support before retrying.`);
  process.exit(1);
}

const sessionId = created.body.session_id;
console.log(`✓ Session created: ${sessionId}`);
console.log(`
  Open this and complete card entry:
  ${created.body.iframe_url}

  Approved test cards: https://docs.prava.space/api-reference/test-cards.md
  Test OTP: 456789   (sandbox sends no email or SMS — this is the bypass)
  If Prava emailed you a specific sandbox card, use THAT one.
`);
console.log('Polling for the credential (2 minutes)…\n');

const deadline = Date.now() + 120_000;
let lastStatus = '';

for (;;) {
  const res = await api(`/sessions/${sessionId}/payment-result`);
  const b = res.body ?? {};
  const txn = (b.transactions ?? []).find((t) => t.error) ?? (b.transactions ?? [])[0];
  const line = txn?.line_items?.[0];

  if (line?.token) {
    console.log('✓ CREDENTIAL ISSUED — provisioning works.\n');
    console.log(`  card    ••••${String(line.token).slice(-4)}`);
    console.log(`  cvv     ${line.dynamic_cvv ? 'issued' : 'missing'}`);
    console.log(`  expiry  ${line.expiry_month}/${line.expiry_year}`);
    console.log(`  amount  $${line.total_amount}`);
    console.log('\nThe app will now complete a real checkout with this session.');
    process.exit(0);
  }

  if (b.status === 'failed' || txn?.error) {
    const code = txn?.error?.code ?? 'UNKNOWN';
    const msg = txn?.error?.message ?? '(no message)';
    console.error(`✗ PROVISIONING FAILED\n`);
    console.error(`  code        ${code}`);
    console.error(`  message     ${msg}`);
    console.error(`  merchant    ${line?.merchant_url ?? MERCHANT_URL}`);
    console.error(`  session     ${sessionId}`);
    console.error(`
Paste those four lines into Prava's #support — they identify the session.

Common causes, in order:
  1. Sandbox outage. Several teams have seen INTERNAL_ERROR / 403 during one.
     Check #support for "it's up again" before assuming it's your code.
  2. Wrong card. Use the card Prava emailed you, or one from the docs list.
  3. merchant_details.url must be a reachable https origin — not localhost.
  4. Passkey/device: the collect page may need Face ID / Touch ID, or
     Windows Hello enabled.

The app does not depend on this. With PRAVA_FALLBACK_ON_FAILURE unset it
degrades to a clearly-labelled simulated credential and the demo still runs
end to end.`);
    process.exit(2);
  }

  if (b.status !== lastStatus) {
    lastStatus = b.status;
    console.log(`  status: ${b.status}`);
  }

  if (Date.now() > deadline) {
    console.error(`\n✗ Timed out. Status stayed "${b.status}" — the approval was never completed.`);
    console.error(`  session ${sessionId}`);
    process.exit(3);
  }

  await sleep(3000);
}
