import { SUPPLEMENT_CATALOG } from '@/lib/agent/catalog';
import { auditCacheStats, hasVisionKey, visionModelId } from '@/lib/agent/vision-auditor';

/**
 * GET /api/labels
 *
 * Lists every generated supplement-facts panel plus how much of the audit cache
 * is warm. Used by `npm run warm-labels` and handy for eyeballing the labels:
 * open any `labelUrl` in a browser to see the rendered PNG.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = auditCacheStats();

  return Response.json({
    visionMode: hasVisionKey() ? 'LIVE_VISION_MODEL' : 'DETERMINISTIC_MOCK',
    ...(hasVisionKey() ? { model: visionModelId() } : {}),
    totalLabels: SUPPLEMENT_CATALOG.length,
    cachedAudits: stats.cached,
    liveCachedAudits: stats.live,
    labelUrls: SUPPLEMENT_CATALOG.map((e) => e.labelImageUrl),
    labels: SUPPLEMENT_CATALOG.map((e) => ({
      id: e.id,
      brand: e.brand,
      productName: e.productName,
      labelUrl: e.labelImageUrl,
      ingredientFamily: e.ingredientFamily,
    })),
  });
}
