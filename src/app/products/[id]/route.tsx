import { ImageResponse } from 'next/og';

import { findCatalogEntryById } from '@/lib/agent/catalog';

/**
 * Renders a product image for a catalog item.
 *
 * Generated rather than shipped, for the same reason the labels are: these
 * products are ours, so there is no real packaging photo to use, and lifting a
 * real brand's product shot would be someone else's artwork. This draws a
 * recognisable tub so the results read as products rather than rows in a table.
 *
 * Swap for `entry.imageUrl` the moment products come from live search — real
 * listings carry a real photo.
 */

export const runtime = 'nodejs';

const FAMILY_TINT: Record<string, [string, string]> = {
  Creatine: ['#0e7490', '#155e75'],
  'L-Citrulline': ['#7c3aed', '#5b21b6'],
  'Whey Protein': ['#0369a1', '#075985'],
  'Beta-Alanine': ['#b45309', '#92400e'],
  Electrolytes: ['#047857', '#065f46'],
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entry = findCatalogEntryById(id);
  if (!entry) return new Response(`No product ${id}`, { status: 404 });

  const [from, to] = FAMILY_TINT[entry.ingredientFamily] ?? ['#334155', '#1e293b'];
  const size = entry.productName.match(/\(([^)]+)\)/)?.[1] ?? '';
  const isBlend = Boolean(entry.proprietaryBlend);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#0b0b0f',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        {/* The tub */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 300,
            height: 400,
            borderRadius: 28,
            background: `linear-gradient(160deg, ${from}, ${to})`,
            border: '2px solid rgba(255,255,255,0.16)',
            padding: 26,
            justifyContent: 'space-between',
          }}
        >
          {/* Lid */}
          <div
            style={{
              display: 'flex',
              alignSelf: 'center',
              width: 190,
              height: 26,
              borderRadius: 10,
              background: 'rgba(0,0,0,0.30)',
              marginTop: -12,
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 17,
                letterSpacing: 3,
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              {entry.brand.toUpperCase()}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 34,
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.12,
                marginTop: 8,
              }}
            >
              {entry.ingredientFamily}
            </div>
            {size ? (
              <div
                style={{
                  display: 'flex',
                  alignSelf: 'flex-start',
                  marginTop: 14,
                  padding: '5px 12px',
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.28)',
                  color: '#ffffff',
                  fontSize: 17,
                  fontWeight: 700,
                }}
              >
                {size}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 14,
                color: 'rgba(255,255,255,0.82)',
              }}
            >
              {entry.servingsPerContainer} servings
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 12,
                color: isBlend ? '#fde68a' : 'rgba(255,255,255,0.6)',
                marginTop: 5,
              }}
            >
              {isBlend ? 'Proprietary blend' : 'Full dose disclosure'}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 420,
      height: 520,
      headers: { 'Cache-Control': 'public, max-age=3600, immutable' },
    },
  );
}
