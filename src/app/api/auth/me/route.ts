import { cookies } from 'next/headers';

import { SESSION_COOKIE, getUser, verifySessionToken } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Next 16: cookies() is async.
  const store = await cookies();
  const userId = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return Response.json({ signedIn: false });

  const user = getUser(userId);
  return Response.json({ signedIn: true, email: user?.email });
}
