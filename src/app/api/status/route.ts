import { agentModelId, agentBaseUrl, keyCount } from '@/lib/agent/model-backend';
import { hasBrightDataCredentials, productSearchMode } from '@/lib/agent/product-search';
import { visionModelId } from '@/lib/agent/vision-auditor';
import { loadAgent } from '@/lib/prava/agent-link';
import { pravaEnvironment } from '@/lib/prava/sdk-client';

/**
 * One honest answer to "is this thing actually wired up?".
 *
 * Every field is derived from live configuration, never hardcoded — the point
 * is that a stranger can open /setup and see which parts are real on THIS
 * machine rather than taking the README's word for it.
 *
 * Nothing secret is returned: presence of a key, never its value.
 */

export type Health = 'live' | 'degraded' | 'off';

export interface Integration {
  id: string;
  name: string;
  health: Health;
  detail: string;
  /** What a user should do about it, when there is something to do. */
  action?: string;
}

export async function GET() {
  const agent = loadAgent();
  const searchMode = productSearchMode();

  const integrations: Integration[] = [
    {
      id: 'prava-agent',
      name: 'Prava agent link',
      health: agent?.linked ? 'live' : 'off',
      detail: agent?.linked
        ? `Linked as ${agent.agentId}. Signed with an Ed25519 key held only on this machine.`
        : 'Not linked. Product discovery falls back to the built-in catalog.',
      ...(agent?.linked ? {} : { action: 'Connect agent' }),
    },
    {
      id: 'products',
      name: 'Product discovery',
      health:
        searchMode === 'PRAVA_SHOP_SEARCH'
          ? 'live'
          : searchMode === 'LIVE_RETAIL_SEARCH'
            ? 'live'
            : 'degraded',
      detail:
        searchMode === 'PRAVA_SHOP_SEARCH'
          ? 'Real merchants via Prava shop search — live prices, real product pages.'
          : searchMode === 'LIVE_RETAIL_SEARCH'
            ? 'Live retailer listings via Bright Data.'
            : 'Built-in catalog of 15 example products. Works offline; not real listings.',
      ...(searchMode === 'SEED_CATALOG' ? { action: 'Connect agent' } : {}),
    },
    {
      id: 'agent-model',
      name: 'Agent reasoning',
      health: keyCount() > 0 ? 'live' : 'off',
      detail:
        keyCount() > 0
          ? `${agentModelId()} on ${new URL(agentBaseUrl()).host}, real tool calling.`
          : 'No AGENT_API_KEY. The agent cannot run; /compare still works.',
      ...(keyCount() > 0 ? {} : { action: 'Set AGENT_API_KEY' }),
    },
    {
      id: 'vision',
      name: 'Label auditing',
      health: process.env.VISION_API_KEY?.trim() ? 'live' : 'degraded',
      detail: process.env.VISION_API_KEY?.trim()
        ? `${visionModelId()} reads supplement facts panels. Free tier is 20 requests/min, so audits are paced.`
        : 'No VISION_API_KEY — labels use deterministic offline readings, clearly marked in results.',
    },
    {
      id: 'trust',
      name: 'Brand trust',
      health: process.env.SENSO_API_KEY?.trim() ? 'live' : 'degraded',
      detail: process.env.SENSO_API_KEY?.trim()
        ? 'Third-party verification records via Senso.'
        : 'No SENSO_API_KEY — brands rank as UNVERIFIED rather than getting a fabricated score.',
    },
    {
      id: 'payments',
      name: 'Payments',
      health: process.env.PRAVA_SECRET_KEY?.trim() ? 'live' : 'degraded',
      detail: process.env.PRAVA_SECRET_KEY?.trim()
        ? `Real Prava ${pravaEnvironment()} sessions. Cards are single-use and capped at the approved amount.`
        : 'No PRAVA_SECRET_KEY — cards are simulated and every result says so.',
    },
  ];

  const live = integrations.filter((i) => i.health === 'live').length;

  return Response.json({
    integrations,
    summary: { live, total: integrations.length },
    brightDataAvailable: hasBrightDataCredentials(),
  });
}
