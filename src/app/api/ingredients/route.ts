import { suggestIngredients } from '@/lib/agent/ingredient-index';

/**
 * GET /api/ingredients?q=whe
 *
 * Ranked autocomplete for the stack builder. Server-side so it can later be
 * backed by live product search instead of a static index without the UI
 * changing.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  return Response.json({ suggestions: suggestIngredients(q, 6) });
}
