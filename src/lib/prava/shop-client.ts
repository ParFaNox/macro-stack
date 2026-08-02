import type { CatalogEntry } from '@/types/agent';
import { getAccessToken, pravaMcpUrl } from './oauth';

/**
 * Prava MCP shopping client — product discovery only.
 *
 * Calls `shop_search` and `shop_product` over the MCP's Streamable HTTP
 * transport with the OAuth token. These are read-only: they find products and
 * report prices, and cannot move money. `shop_checkout` is intentionally never
 * called — purchases run through our own checkout, where the Prava amount cap
 * and the passkey guardrail apply.
 */

interface McpToolResult {
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: { code: number; message: string };
}

let requestId = 0;

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Prava. Visit /api/prava/oauth/start to authorize.');

  const res = await fetch(pravaMcpUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Prava MCP ${name} failed (HTTP ${res.status}): ${text.slice(0, 200)}`);

  // The transport may answer as JSON or as a single SSE frame.
  const payload = text.startsWith('event:') || text.startsWith('data:')
    ? JSON.parse(text.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim() ?? '{}')
    : JSON.parse(text);

  const body = payload as McpToolResult;
  if (body.error) throw new Error(`Prava MCP ${name}: ${body.error.message}`);
  if (body.result?.isError) {
    throw new Error(`Prava MCP ${name}: ${body.result.content?.[0]?.text ?? 'tool error'}`);
  }

  const raw = body.result?.content?.[0]?.text;
  if (!raw) throw new Error(`Prava MCP ${name} returned no content`);

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Raw shopping hit, normalised downstream by the same LLM pass Bright Data uses. */
export interface PravaShopHit {
  title: string;
  price?: string;
  merchant?: string;
  link?: string;
  image?: string;
}

function pick(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') {
      const nested = (v as Record<string, unknown>).amount ?? (v as Record<string, unknown>).value;
      if (typeof nested === 'string' || typeof nested === 'number') return String(nested);
    }
  }
  return undefined;
}

/**
 * Searches real merchants through Prava.
 *
 * The response shape is not fully documented, so field names are probed
 * defensively rather than assumed — an unexpected key should degrade one field,
 * not throw away the whole result.
 */
export async function pravaShopSearch(query: string, limit = 10): Promise<PravaShopHit[]> {
  const data = await callTool('shop_search', { query, limit });

  const rows: unknown[] = Array.isArray(data)
    ? data
    : ((data as Record<string, unknown>)?.products as unknown[]) ??
      ((data as Record<string, unknown>)?.results as unknown[]) ??
      ((data as Record<string, unknown>)?.items as unknown[]) ??
      [];

  return rows.slice(0, limit).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      title: pick(row, 'title', 'name', 'product_name', 'productName') ?? '',
      price: pick(row, 'price', 'total_price', 'amount', 'price_usd'),
      merchant: pick(row, 'merchant', 'merchant_name', 'store', 'vendor', 'source'),
      link: pick(row, 'url', 'link', 'product_url', 'permalink'),
      image: pick(row, 'image', 'image_url', 'thumbnail'),
    };
  }).filter((h) => h.title);
}

export type { CatalogEntry };
