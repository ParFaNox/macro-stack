/**
 * Promotes the local label-audit cache into the committed seed file.
 *
 * The local cache (`.macrostack-cache/`) is gitignored and only exists on the
 * machine that ran `npm run warm-labels`. Serverless filesystems are read-only,
 * so a deployment with no committed seed re-audits every label on each cold
 * start, trips the provider rate limit, and silently degrades to mock readings.
 *
 * Run this after warming, then commit `src/lib/agent/label-audit-seed.json`.
 *
 * Usage:  npm run warm-labels && npm run save-label-cache
 */

import fs from 'node:fs';
import path from 'node:path';

const LOCAL = path.join(process.cwd(), '.macrostack-cache', 'label-audits.json');
const SEED = path.join(process.cwd(), 'src', 'lib', 'agent', 'label-audit-seed.json');

if (!fs.existsSync(LOCAL)) {
  console.error(
    `No local cache at ${LOCAL}.\nRun \`npm run dev\` and \`npm run warm-labels\` first.`,
  );
  process.exit(1);
}

const local = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
const existing = fs.existsSync(SEED) ? JSON.parse(fs.readFileSync(SEED, 'utf8')) : {};

// Merge rather than replace: the seed may already hold readings from another
// model, and those stay valid for anyone using that model.
const merged = { ...existing };
let added = 0;
let live = 0;

for (const [key, value] of Object.entries(local)) {
  if (value?.source !== 'LIVE_VISION_MODEL') continue; // never commit mock readings
  const modelKey = key.includes('::') ? key : `${value.modelId ?? 'unknown'}::${key}`;
  if (!(modelKey in merged)) added++;
  merged[modelKey] = value;
  live++;
}

fs.writeFileSync(SEED, `${JSON.stringify(merged, null, 2)}\n`);

const byModel = {};
for (const [key, value] of Object.entries(merged)) {
  const model = value.modelId ?? key.split('::')[0];
  byModel[model] = (byModel[model] ?? 0) + 1;
}

console.log(`Promoted ${live} live reading(s) (${added} new) into:`);
console.log(`  ${path.relative(process.cwd(), SEED)}`);
console.log('Seed now holds:');
for (const [model, count] of Object.entries(byModel)) {
  console.log(`  ${count.toString().padStart(3)}  ${model}`);
}
console.log('\nCommit that file so deployments start warm.');
