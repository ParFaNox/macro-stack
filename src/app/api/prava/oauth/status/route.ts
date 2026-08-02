import { connectionStatus, disconnect } from '@/lib/prava/oauth';

/** GET reports whether Prava shopping is connected. DELETE disconnects. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(connectionStatus());
}

export async function DELETE() {
  disconnect();
  return Response.json({ connected: false });
}
