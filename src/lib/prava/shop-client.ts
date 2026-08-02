import type { CatalogEntry } from '@/types/agent';

import { isLinked, walletPost } from './agent-link';

/**
 * Product discovery through Prava's wallet API.
 *
 * This replaces an earlier MCP/OAuth client. Prava's shopping endpoints are not
 * OAuth-gated — they authenticate the linked agent with an Ed25519 signature
 * (see agent-link.ts). Same products, one less protocol.
 *
 * Two calls matter:
 *   shop/search   title, merchant, price, one image
 *   shop/product  description, every image, and the variant list
 *
 * The second call is worth its latency: variant labels carry the serving count
 * ("30 servings", "100 servings") as *data*, so the container size is read
 * rather than guessed by a model, and the image list usually contains an actual
 * supplement-facts panel — which is the thing our auditor needs to read.
 */

export interface PravaShopHit {
  title: string;
  price?: string;
  merchant?: string;
  link?: string;
  image?: string;
  /** Supplement-facts panel when the merchant published one. */
  labelImage?: string;
  description?: string;
  productId?: string;
  /** Read off the chosen variant's option label, when it states one. */
  servings?: number;
}

export function isPravaShoppingConnected(): boolean {
  return isLinked();
}

interface SearchResponse {
  data?: {
    results?: Array<{
      product_id?: string;
      merchant?: string;
      title?: string;
      price_estimate?: { amount?: string; currency?: string };
      image_url?: string;
    }>;
  };
}

interface ProductResponse {
  data?: {
    product?: {
      description?: string;
      images?: string[];
      variants?: Array<{
        id?: string;
        label?: string;
        priceAmount?: number;
        available?: boolean;
        options?: string[];
      }>;
    };
  };
}

/**
 * Picks the supplement-facts panel out of a merchant's image set.
 *
 * Merchants name these fairly consistently ("creatinesfp.jpg",
 * "supplement-facts", "nutrition-panel"). Returns undefined rather than a
 * guess when nothing matches — feeding a hero shot to a label auditor and
 * calling it a label is how you get confident nonsense.
 */
function findLabelImage(images: string[]): string | undefined {
  const patterns = /(sfp|supp[-_]?facts|supplement[-_]?facts|nutrition|panel|facts|label|ingredients)/i;
  return images.find((url) => patterns.test(url.split('/').pop() ?? ''));
}

/** "30 servings" / "100 Servings" / "90ct" → 30 / 100 / 90. */
function servingsFromLabel(label: string): number | undefined {
  const m = label.match(/(\d+)\s*(servings?|ct\b|count)/i);
  if (m) return Number(m[1]);
  return undefined;
}

/** Real, working page on the real store — their own search for this product. */
function merchantProductUrl(merchant: string, title: string): string {
  const domain = merchant.replace(/\.myshopify\.com$/, '.com');
  return `https://${domain}/search?q=${encodeURIComponent(title)}`;
}

async function enrich(
  productId: string,
  merchant: string,
  title: string,
): Promise<{ description?: string; labelImage?: string; servings?: number; price?: number }> {
  try {
    const res = await walletPost<ProductResponse>(
      '/v1/wallet/shop/product',
      { product_id: productId, merchant },
      20_000,
    );
    const product = res.data?.product;
    if (!product) return {};

    const variants = (product.variants ?? []).filter((v) => v.available !== false);

    // Prefer a variant that states its serving count; ties broken by the
    // cheapest, since that is the one a buyer would actually reach for.
    const withServings = variants
      .map((v) => ({
        v,
        servings: servingsFromLabel([...(v.options ?? []), v.label ?? ''].join(' ')),
      }))
      .filter((x) => x.servings !== undefined)
      .sort((a, b) => (a.v.priceAmount ?? 0) - (b.v.priceAmount ?? 0));

    const chosen = withServings[0] ?? { v: variants[0], servings: undefined };

    return {
      description: product.description,
      labelImage: findLabelImage(product.images ?? []),
      servings: chosen.servings,
      // priceAmount is in cents.
      price: chosen.v?.priceAmount ? chosen.v.priceAmount / 100 : undefined,
    };
  } catch {
    // Enrichment is a bonus. A search hit without it is still a real product.
    return {};
  }
}

/**
 * Searches real merchants through Prava.
 *
 * Enrichment runs in parallel and only for the top few hits: each one is a
 * round-trip, and the agent audits a shortlist, not the whole result set.
 */
export async function pravaShopSearch(query: string, limit = 10): Promise<PravaShopHit[]> {
  const res = await walletPost<SearchResponse>('/v1/wallet/shop/search', {
    query,
    limit: Math.min(limit, 20),
  });

  const rows = (res.data?.results ?? []).filter((r) => r.title);

  const enriched = await Promise.all(
    rows.slice(0, limit).map(async (r, i) => {
      const merchant = r.merchant ?? '';
      const title = r.title ?? '';

      const extra =
        i < 4 && r.product_id && merchant
          ? await enrich(r.product_id, merchant, title)
          : {};

      return {
        title,
        price: String(extra.price ?? r.price_estimate?.amount ?? ''),
        merchant,
        link: merchant ? merchantProductUrl(merchant, title) : '',
        image: r.image_url,
        labelImage: extra.labelImage,
        description: extra.description,
        productId: r.product_id,
        servings: extra.servings,
      } satisfies PravaShopHit;
    }),
  );

  return enriched.filter((h) => h.title && h.price);
}

export type { CatalogEntry };
