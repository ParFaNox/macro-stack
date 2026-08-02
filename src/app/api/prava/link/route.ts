import { checkAgentLink, loadAgent, startAgentLink } from '@/lib/prava/agent-link';

/**
 * POST /api/prava/link   — mint a keypair, return the URL a human must approve
 * GET  /api/prava/link   — has the human approved yet?
 *
 * Split because approving is a browser action on Prava's own domain and we
 * cannot observe it; the client polls GET until `linked` flips.
 */

export async function POST() {
  try {
    const { linkUrl, linkId } = await startAgentLink();
    return Response.json({ linkUrl, linkId, linked: false });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not reach Prava' },
      { status: 502 },
    );
  }
}

export async function GET() {
  const existing = loadAgent();
  if (!existing) return Response.json({ linked: false, started: false });

  try {
    const agent = await checkAgentLink();
    return Response.json({
      started: true,
      linked: Boolean(agent?.linked),
      agentId: agent?.agentId ?? null,
      linkUrl: agent?.linkUrl ?? null,
      linkedAt: agent?.linkedAt ?? null,
    });
  } catch (error) {
    return Response.json({
      started: true,
      linked: existing.linked,
      linkUrl: existing.linkUrl,
      error: error instanceof Error ? error.message : 'status check failed',
    });
  }
}
