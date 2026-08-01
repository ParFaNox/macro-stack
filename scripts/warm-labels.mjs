/**
 * Prewarms the label-audit cache.
 *
 * Gemini's free tier caps requests per minute, and a 5-ingredient stack needs
 * 15 label audits at once — more than the cap allows however you pace them
 * inside a single request. This walks the catalog slowly, one label at a time,
 * so every audit lands as a real live reading. Results are cached to disk by
 * the auditor, so after this runs once the app is instant, fully live-audited
 * and costs zero quota.
 *
 * Usage:  npm run dev   (in another terminal)
 *         npm run warm-labels
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
// Free tier allows 20 requests/minute. 3.5s spacing = ~17/min, comfortably
// under the cap, and the auditor is run with retries off so each label costs
// exactly one request.
const DELAY_MS = Number(process.env.WARM_DELAY_MS ?? 3500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const modeRes = await fetch(`${BASE}/api/audit-label`).catch(() => null);
  if (!modeRes?.ok) {
    console.error(`Cannot reach ${BASE}. Start the dev server first:  npm run dev`);
    process.exit(1);
  }
  const mode = await modeRes.json();
  if (mode.visionMode !== 'LIVE_VISION_MODEL') {
    console.error(
      'VISION_API_KEY is not set, so there is nothing to warm — the auditor is\n' +
        'already instant in mock mode. Add your key to .env.local and restart the\n' +
        'dev server if you want real Gemini readings.',
    );
    process.exit(1);
  }

  const listRes = await fetch(`${BASE}/api/optimize`);
  const { availableIngredients } = await listRes.json();
  console.log(`Model: ${mode.model}`);
  console.log(`Ingredient families: ${availableIngredients.join(', ')}\n`);

  // Ask the app which labels exist rather than duplicating the catalog here.
  const idsRes = await fetch(`${BASE}/api/labels`);
  const { labelUrls, liveCachedAudits } = await idsRes.json();
  if (liveCachedAudits > 0) {
    console.log(`${liveCachedAudits} label(s) already cached live — those are skipped instantly.\n`);
  }

  let live = 0;
  let cachedOrFailed = 0;

  for (const [i, url] of labelUrls.entries()) {
    const started = Date.now();
    const res = await fetch(`${BASE}/api/audit-label`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageUrl: url }),
    });
    const body = await res.json();
    const source = body?.audit?.source ?? 'ERROR';
    const ok = source === 'LIVE_VISION_MODEL';
    if (ok) live++;
    else cachedOrFailed++;

    const took = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[${String(i + 1).padStart(2)}/${labelUrls.length}] ${ok ? '✓ live' : '✗ mock'}  ${took}s  ${url}`,
    );
    if (!ok && body?.audit?.notes) console.log(`         ${body.audit.notes}`);

    if (i < labelUrls.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\nLive readings cached: ${live}/${labelUrls.length}`);
  if (cachedOrFailed > 0) {
    console.log(
      `${cachedOrFailed} still un-cached — re-run \`npm run warm-labels\` to pick them up,\n` +
        'or raise the spacing with WARM_DELAY_MS=12000.',
    );
  } else {
    console.log('Every label has a real Gemini reading. The app is now instant and quota-free.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
