import { z } from 'zod';

import { SESSION_COOKIE, authenticate, issueSessionToken } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({ email: z.string().min(3), password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Email and password are required.' }, { status: 400 });

  const result = authenticate(parsed.data.email, parsed.data.password);
  if ('error' in result) return Response.json({ error: result.error }, { status: 401 });

  const res = Response.json({ email: result.user.email });
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${issueSessionToken(result.user.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
  );
  return res;
}
