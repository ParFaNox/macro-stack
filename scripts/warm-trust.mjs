/**
 * Warms the brand-trust cache one brand at a time.
 *
 * Each verdict costs a Senso search plus one small scoring call. Firing them all
 * at once trips the model provider's per-minute limit (Gemini's free tier allows
 * 20/min), so this paces them. Results are cached, then promoted into the
 * committed seed with `npm run save-trust-cache`.
 *
 * Usage:  npm run dev   (in another terminal)
 *         npm run warm-trust && npm run save-trust-cache
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
const DELAY_MS = Number(process.env.WARM_DELAY_MS ?? 4000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const status = await fetch(`${BASE}/api/trust`).catch(() => null);
if (!status?.ok) {
  console.error(`Cannot reach ${BASE}. Start the dev server first:  npm run dev`);
  process.exit(1);
}
const { trustSignal, brands, verified } = await status.json();
if (trustSignal === 'disabled') {
  console.error('SENSO_API_KEY is not set — nothing to warm. Add it to .env.local.');
  process.exit(1);
}
console.log(`${brands.length} brand(s), ${verified} already verified.\n`);

let ok = 0;
for (const [i, brand] of brands.entries()) {
  const res = await fetch(`${BASE}/api/trust?brand=${encodeURIComponent(brand)}`);
  const t = await res.json();
  const verifiedNow = t.source === 'SENSO_VERIFIED';
  if (verifiedNow) ok++;
  console.log(
    `[${String(i + 1).padStart(2)}/${brands.length}] ${verifiedNow ? `✓ ${t.grade}  ${String(t.score).padEnd(5)}` : '✗ unverified'}  ${brand}`,
  );
  if (!verifiedNow && t.notes) console.log(`          ${t.notes.slice(0, 140)}`);
  if (i < brands.length - 1) await sleep(DELAY_MS);
}

console.log(`\n${ok}/${brands.length} verified.`);
console.log(ok === brands.length
  ? 'Run `npm run save-trust-cache` to commit these.'
  : 'Re-run to pick up the rest, or raise spacing with WARM_DELAY_MS=8000.');
