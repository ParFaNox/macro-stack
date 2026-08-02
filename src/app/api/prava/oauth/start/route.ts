import { buildAuthorizationUrl } from '@/lib/prava/oauth';

/**
 * GET /api/prava/oauth/start
 *
 * Sends the user to Prava to approve read-only shopping access. One browser
 * sign-in; the token is then held server-side and refreshed automatically.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.redirect(await buildAuthorizationUrl(), 302);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not start Prava authorization' },
      { status: 502 },
    );
  }
}
