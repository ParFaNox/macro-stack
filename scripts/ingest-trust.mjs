/**
 * Seeds the Senso knowledge base with the brand trust corpus.
 *
 * Run once after setting SENSO_API_KEY. Ingestion is asynchronous — Senso
 * returns 202 and processes in the background — so this polls until the
 * documents are actually retrievable rather than exiting optimistically.
 *
 * Usage:  npm run ingest-trust
 *
 * To use real data instead of the demo corpus, replace the documents in
 * src/lib/agent/trust-corpus.ts with NSF Certified for Sport listings, Informed
 * Sport's batch database, and FDA warning letters. Nothing downstream changes.
 */

import fs from 'node:fs';
import path from 'node:path';

// Minimal .env.local reader — this runs outside Next, so no auto-loading.
function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const KEY = process.env.SENSO_API_KEY?.trim();
const BASE = process.env.SENSO_API_BASE?.trim() || 'https://apiv2.senso.ai/api/v1';

if (!KEY) {
  console.error(
    'SENSO_API_KEY is not set.\nGet one free (no card) at https://docs.senso.ai and put it in .env.local.',
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
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

async function main() {
  const me = await api('/org/me');
  if (!me.ok) {
    console.error(`Could not reach Senso (HTTP ${me.status}).`, me.body);
    process.exit(1);
  }
  console.log(`Org: ${me.body.name}  ·  free tier: ${me.body.is_free_tier}`);

  const credits = await api('/org/credits/balance');
  if (credits.ok) console.log(`Credits available: ${credits.body.credits_available}\n`);

  // Import the corpus by stripping the TS type annotations — this is a plain
  // .mjs script and the corpus lives in a .ts module.
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'agent', 'trust-corpus.ts'),
    'utf8',
  );
  const docs = [];
  const re = /\{\s*brand:\s*'([^']+)',\s*title:\s*'([^']+)',\s*content:\s*`([\s\S]*?)`,?\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    docs.push({
      brand: m[1],
      title: m[2],
      content: m[3].replace(/\$\{DISCLAIMER\}/g, 'NOTE: MacroStack demonstration corpus.'),
    });
  }

  if (docs.length === 0) {
    console.error('Could not parse any documents out of trust-corpus.ts.');
    process.exit(1);
  }

  console.log(`Ingesting ${docs.length} document(s)…`);
  let ingested = 0;

  for (const doc of docs) {
    const res = await api('/org/kb/raw', {
      method: 'POST',
      body: JSON.stringify({ title: doc.title, text: doc.content }),
    });
    if (res.ok || res.status === 202) {
      ingested++;
      console.log(`  ✓ ${doc.title}`);
    } else {
      console.log(`  ✗ ${doc.title} — HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
    }
    await sleep(400);
  }

  console.log(`\nIngested ${ingested}/${docs.length}. Waiting for indexing…`);

  // Poll until a known brand actually comes back, so a later demo isn't the
  // first thing to discover the index wasn't ready.
  for (let attempt = 1; attempt <= 12; attempt++) {
    await sleep(5000);
    const probe = await api('/org/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'Is BulkNutrition NSF Certified for Sport?' }),
    });
    const total = probe.body?.total_results ?? 0;
    if (total > 0) {
      console.log(`\nIndexed and searchable after ~${attempt * 5}s.`);
      console.log(`Sample answer: ${String(probe.body.answer).slice(0, 180)}…`);
      console.log('\nNext: npm run dev, then the optimizer will rank on trust as well as price.');
      return;
    }
    process.stdout.write(`  still indexing (${attempt * 5}s)…\r`);
  }

  console.log('\nIngest submitted, but nothing is searchable yet.');
  console.log('Indexing can lag — re-run this script in a minute to check.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
