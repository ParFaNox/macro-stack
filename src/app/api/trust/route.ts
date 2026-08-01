import { SUPPLEMENT_CATALOG } from '@/lib/agent/catalog';
import { getBrandTrust, hasSensoKey, trustCacheStats, trustGrade } from '@/lib/agent/trust-signal';

/**
 * GET /api/trust            → cache status and the brands in the catalog
 * GET /api/trust?brand=X    → the trust verdict for one brand
 *
 * The single-brand form is what `npm run warm-trust` walks, one brand at a time,
 * so the scoring model isn't hit with every brand at once.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const brand = new URL(request.url).searchParams.get('brand');
  const brands = [...new Set(SUPPLEMENT_CATALOG.map((e) => e.brand))];

  if (!brand) {
    const stats = trustCacheStats();
    return Response.json({
      trustSignal: hasSensoKey() ? 'Senso' : 'disabled',
      brands,
      cached: stats.cached,
      verified: stats.verified,
    });
  }

  const trust = await getBrandTrust(brand);
  return Response.json({ ...trust, grade: trustGrade(trust.score) });
}
