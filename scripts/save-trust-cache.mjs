/**
 * Promotes the local brand-trust cache into the committed seed file, so
 * deployments start warm on a read-only filesystem and don't re-spend Senso
 * credits on every cold start. Same pattern as save-label-cache.
 *
 * Usage:  npm run ingest-trust && npm run dev && npm run save-trust-cache
 */

import fs from 'node:fs';
import path from 'node:path';

const LOCAL = path.join(process.cwd(), '.macrostack-cache', 'brand-trust.json');
const SEED = path.join(process.cwd(), 'src', 'lib', 'agent', 'trust-seed.json');

if (!fs.existsSync(LOCAL)) {
  console.error(
    `No local trust cache at ${LOCAL}.\nRun the app once with SENSO_API_KEY set so brands get queried.`,
  );
  process.exit(1);
}

const local = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
const existing = fs.existsSync(SEED) ? JSON.parse(fs.readFileSync(SEED, 'utf8')) : {};
const merged = { ...existing };
let kept = 0;

for (const [brand, trust] of Object.entries(local)) {
  if (trust?.source !== 'SENSO_VERIFIED') continue; // never commit an unverified placeholder
  merged[brand] = trust;
  kept++;
}

fs.writeFileSync(SEED, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`Promoted ${kept} verified brand verdict(s) into ${path.relative(process.cwd(), SEED)}`);
console.log(`Seed now covers: ${Object.keys(merged).join(', ') || '(none)'}`);
console.log('\nCommit that file so deployments start warm.');
