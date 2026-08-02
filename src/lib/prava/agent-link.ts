import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';

import { readCache, writeCache } from '@/lib/cache';

/**
 * Agent identity for Prava's wallet API.
 *
 * This REPLACES the OAuth 2.1 client we had. Prava's shopping API is not
 * OAuth-gated — it authenticates the *agent* with an Ed25519 keypair:
 *
 *   1. we generate a keypair and register the public half, signed, at
 *      /v1/agents/link/create — the server hands back an opaque link id
 *   2. the human opens pay.prava.space/link-agent?lid=... and approves
 *   3. /v1/agents/link/status starts returning an agent_id
 *   4. every later request carries X-Agent-Id + X-Timestamp + X-Signature,
 *      where the signature is over (timestamp + raw body)
 *
 * The private key never leaves this machine, which is the point: approval is
 * bound to a key the user's browser never sees, so a stolen link id is not
 * enough to act as the agent.
 *
 * Shapes here were taken from Prava's own published CLI
 * (github.com/Prava-Payments/prava-skills), not guessed — in particular the
 * canonical signing string, which is order-sensitive and fails silently as a
 * 401 if you get it wrong.
 */

const API_URL = process.env.PRAVA_AGENT_API?.trim() || 'https://api.prava.space';
const WALLET_URL = process.env.PRAVA_WALLET_API?.trim() || 'https://pay-api.prava.space';
const DASHBOARD_URL = process.env.PRAVA_DASHBOARD_URL?.trim() || 'https://pay.prava.space';

const CACHE_KEY = 'prava-agent';

export interface AgentIdentity {
  publicKey: string;
  privateKey: string;
  linkId: string;
  linkUrl: string;
  linked: boolean;
  agentId?: string;
  linkedAt?: string;
  createdAt: string;
}

export function loadAgent(): AgentIdentity | null {
  return readCache<AgentIdentity>(CACHE_KEY);
}

function saveAgent(agent: AgentIdentity): void {
  writeCache(CACHE_KEY, agent);
}

export function isLinked(): boolean {
  const agent = loadAgent();
  return Boolean(agent?.linked && agent.agentId);
}

/**
 * Canonical message for the link-create signature.
 *
 * Alphabetical by short key (d, iat, n, p, pk) with each value
 * percent-encoded. This must match Prava's verifier byte for byte — any
 * reordering or missing encode produces a 401 with no explanation.
 */
function canonicalCreateMessage(p: {
  description: string;
  iat: number;
  name: string;
  platform: string;
  publicKey: string;
}): string {
  const enc = encodeURIComponent;
  return (
    `d=${enc(p.description)}` +
    `&iat=${p.iat}` +
    `&n=${enc(p.name)}` +
    `&p=${enc(p.platform)}` +
    `&pk=${enc(p.publicKey)}`
  );
}

function signWith(privateKeyBase64: string, message: string, urlSafe: boolean): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(message, 'utf-8'), key);
  return urlSafe ? signature.toString('base64url').replace(/=+$/, '') : signature.toString('base64');
}

const AGENT_NAME = 'MacroStack';
const AGENT_PLATFORM = 'claude-code';
const AGENT_DESCRIPTION = 'Autonomous supplement buying agent — cost per active gram, label audits';

/**
 * Registers a fresh keypair and returns the URL a human must approve.
 *
 * Always mints a new key rather than reusing one: a link id expires in 15
 * minutes, and silently handing back a stale URL is worse than a new one.
 */
export async function startAgentLink(): Promise<{ linkUrl: string; linkId: string }> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

  const iat = Math.floor(Date.now() / 1000);
  const sig = signWith(
    priv,
    canonicalCreateMessage({
      description: AGENT_DESCRIPTION,
      iat,
      name: AGENT_NAME,
      platform: AGENT_PLATFORM,
      publicKey: pub,
    }),
    true,
  );

  const res = await fetch(`${API_URL}/v1/agents/link/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Skill-Name': 'prava-pay' },
    body: JSON.stringify({
      public_key: pub,
      name: AGENT_NAME,
      platform: AGENT_PLATFORM,
      description: AGENT_DESCRIPTION,
      iat,
      sig,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    lid?: string;
    error?: { code?: string; message?: string };
  };

  if (!res.ok || !body.lid) {
    throw new Error(
      body.error?.message ?? `Prava link/create failed (HTTP ${res.status})`,
    );
  }

  const linkUrl = `${DASHBOARD_URL}/link-agent?lid=${encodeURIComponent(body.lid)}`;

  saveAgent({
    publicKey: pub,
    privateKey: priv,
    linkId: body.lid,
    linkUrl,
    linked: false,
    createdAt: new Date().toISOString(),
  });

  return { linkUrl, linkId: body.lid };
}

/**
 * Checks whether the human has approved yet, and records the agent id if so.
 *
 * Safe to call repeatedly — once linked it short-circuits, so the UI can poll
 * without hammering Prava.
 */
export async function checkAgentLink(): Promise<AgentIdentity | null> {
  const agent = loadAgent();
  if (!agent) return null;
  if (agent.linked && agent.agentId) return agent;

  const res = await fetch(
    `${API_URL}/v1/agents/link/status?lid=${encodeURIComponent(agent.linkId)}`,
    { headers: { 'X-Skill-Name': 'prava-pay' } },
  );

  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    linked?: boolean;
    agent_id?: string;
    agentId?: string;
  };

  const agentId = body.agent_id ?? body.agentId;
  if (agentId) {
    const updated: AgentIdentity = {
      ...agent,
      linked: true,
      agentId,
      linkedAt: new Date().toISOString(),
    };
    saveAgent(updated);
    return updated;
  }

  return agent;
}

/**
 * Signed POST to the wallet API.
 *
 * The signature covers the exact bytes we send, so the body is stringified
 * once and reused — re-serialising would change key order on some shapes and
 * invalidate the signature.
 */
export async function walletPost<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<T> {
  const agent = loadAgent();
  if (!agent?.linked || !agent.agentId) {
    throw new Error('Prava agent is not linked. Visit /setup to connect it.');
  }

  const payload = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${WALLET_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Skill-Name': 'prava-shopping',
        'X-Agent-Id': agent.agentId,
        'X-Timestamp': timestamp,
        'X-Signature': signWith(agent.privateKey, timestamp + payload, false),
      },
      body: payload,
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as T & {
      error?: { code?: string; message?: string };
    };

    if (!res.ok) {
      throw new Error(
        data.error?.message ?? data.error?.code ?? `Prava wallet ${path} failed (HTTP ${res.status})`,
      );
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Stable pseudo-id for a product that has no usable id of its own. */
export function stableId(prefix: string, seed: string): string {
  return `${prefix}_${createHash('sha1').update(seed).digest('hex').slice(0, 10)}`;
}

export function dashboardUrl(): string {
  return DASHBOARD_URL;
}
