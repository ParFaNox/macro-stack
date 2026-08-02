import { exchangeCode } from '@/lib/prava/oauth';

/** OAuth redirect target. Exchanges the code, then returns the user to /agent. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';

  if (oauthError) {
    return Response.redirect(`${base}/agent?prava=${encodeURIComponent(oauthError)}`, 302);
  }
  if (!code || !state) {
    return Response.json({ error: 'Missing code or state in callback' }, { status: 400 });
  }

  try {
    await exchangeCode(code, state);
    return Response.redirect(`${base}/agent?prava=connected`, 302);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Token exchange failed' },
      { status: 502 },
    );
  }
}
