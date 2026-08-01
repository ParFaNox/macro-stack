import { ImageResponse } from 'next/og';

import { findCatalogEntryById } from '@/lib/agent/catalog';

/**
 * Renders a supplement-facts panel as a real PNG, generated from catalog data.
 *
 * Why generate rather than ship image files: the vision auditor needs a genuine
 * image to read, but committing photographed labels of real products would mean
 * shipping someone else's packaging artwork. These panels are synthetic and
 * follow the standard US supplement-facts layout, so the model has to do real
 * OCR and real layout reasoning — including spotting the proprietary blends,
 * which are rendered exactly as a deceptive label would print them: a single
 * blend total with the components listed in descending weight order and no
 * per-ingredient amounts.
 *
 * Uses next/og (Satori + Resvg), which is built into Next — no extra
 * dependency and no binary assets in the repo. Satori supports flexbox only.
 */

export const runtime = 'nodejs';

const GREY = '#4a4a4a';
const BLACK = '#000000';

function rule(width: number, marginY = 4) {
  return {
    display: 'flex',
    width: '100%',
    height: width,
    backgroundColor: BLACK,
    marginTop: marginY,
    marginBottom: marginY,
  } as const;
}

export async function GET(
  _request: Request,
  // Next 16: route params arrive as a Promise and must be awaited.
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entry = findCatalogEntryById(id);

  if (!entry) {
    return new Response(`No catalog product with id "${id}"`, { status: 404 });
  }

  const declaredGrams = entry.activeIngredients.reduce(
    (s, i) => s + i.amountPerServingGrams,
    0,
  );
  const servingSize = entry.servingSizeGrams ?? Number((declaredGrams * 1.06).toFixed(1));
  const blend = entry.proprietaryBlend;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          padding: 36,
          fontFamily: 'sans-serif',
          color: BLACK,
        }}
      >
        {/* Brand / product header */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 10 }}>
          <div style={{ fontSize: 22, letterSpacing: 2, color: GREY }}>
            {entry.brand.toUpperCase()}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, marginTop: 2 }}>{entry.productName}</div>
        </div>

        {/* Facts panel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: `3px solid ${BLACK}`,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 700 }}>Supplement Facts</div>
          <div style={rule(2)} />

          <div style={{ display: 'flex', fontSize: 22 }}>
            Serving Size: {servingSize} g ({entry.servingUnit ?? '1 scoop'})
          </div>
          <div style={{ display: 'flex', fontSize: 22, marginTop: 2 }}>
            Servings Per Container: {entry.servingsPerContainer}
          </div>

          <div style={rule(8)} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 20, fontWeight: 700 }}>
            Amount Per Serving
          </div>
          <div style={rule(2)} />

          {blend ? (
            /* Deceptive layout: one blend total, no individual amounts. */
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 23 }}>
                <div style={{ display: 'flex', fontWeight: 700 }}>{blend.name}</div>
                <div style={{ display: 'flex', fontWeight: 700 }}>
                  {blend.totalMg.toLocaleString('en-US')} mg †
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 19,
                  color: GREY,
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                {blend.components.join(', ')}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {entry.activeIngredients.map((ing) => (
                <div key={ing.name} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 23 }}
                  >
                    <div style={{ display: 'flex', fontWeight: 700 }}>{ing.name}</div>
                    <div style={{ display: 'flex', fontWeight: 700 }}>
                      {ing.amountPerServingGrams >= 1
                        ? `${ing.amountPerServingGrams} g`
                        : `${Math.round(ing.amountPerServingGrams * 1000)} mg`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', fontSize: 18, color: GREY, marginBottom: 6 }}>
                    ({ing.purityPercentage}% assay purity)
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={rule(2, 8)} />
          <div style={{ display: 'flex', fontSize: 17, color: GREY }}>
            † Daily Value not established.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 18,
            color: GREY,
            marginTop: 12,
            lineHeight: 1.4,
          }}
        >
          Other Ingredients: {(entry.otherIngredients ?? ['Silicon dioxide']).join(', ')}.
        </div>

        <div style={{ display: 'flex', fontSize: 14, color: '#8a8a8a', marginTop: 'auto' }}>
          Synthetic label generated by MacroStack for demonstration — not a real product.
        </div>
      </div>
    ),
    {
      width: 820,
      height: 1000,
      headers: {
        // Deterministic output, so it is safe to cache hard.
        'Cache-Control': 'public, max-age=3600, immutable',
      },
    },
  );
}
