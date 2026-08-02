import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';

/**
 * Agent identity for Prava.
 *
 * Prava's shopping API is not OAuth-gated. It authenticates the *agent* with an
 * Ed25519 keypair: you register the public half, a human approves once in a
 * browser, and every later request is signed over (timestamp + raw body).
 *
 * The private key never leaves the process that generated it, which is the
 * point — a stolen link id cannot act as the agent.
 *
 * Storage is injected rather than assumed. The reference app writes to disk;
 * a serverless deployment should hand in something backed by a secret store.
 */

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

export interface IdentityStore {
  load(): AgentIdentity | null | Promise<AgentIdentity | null>;
  save(identity: AgentIdentity): void | Promise<void>;
}

/** Keeps an identity in memory only. Fine for a single long-lived process. */
export class MemoryIdentityStore implements IdentityStore {
  private current: AgentIdentity | null = null;
  load() {
    return this.current;
  }
  save(identity: AgentIdentity) {
    this.current = identity;
  }
}

export interface AgentDescriptor {
  name: string;
  platform: string;
  description: string;
}

/**
 * Canonical message for the link-create signature.
 *
 * Alphabetical by short key (d, iat, n, p, pk), each value percent-encoded.
 * This must match Prava's verifier byte for byte — any reordering or missing
 * encode produces a 401 with no explanation of why.
 */
function canonicalCreateMessage(p: {
  description: string;
  iat: number;
  name: string;
  platform: string;
  publicKey: string;
}): string {
  const enc = encodeURIComponent;
  // No `lid` at create time — the server issues it, so it cannot be signed here.
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

/** Signs a wallet request: the signature covers timestamp + the exact body bytes. */
export function signRequest(privateKey: string, timestamp: string, body: string): string {
  return signWith(privateKey, timestamp + body, false);
}

/**
 * Registers a fresh keypair and returns the URL a human must approve.
 *
 * Always mints a new key rather than reusing one: a link id expires in 15
 * minutes, and silently handing back a stale URL is worse than a new one.
 */
export async function startAgentLink(
  store: IdentityStore,
  descriptor: AgentDescriptor,
  apiUrl: string,
  dashboardUrl: string,
): Promise<{ linkUrl: string; linkId: string }> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

  const iat = Math.floor(Date.now() / 1000);
  const sig = signWith(
    priv,
    canonicalCreateMessage({ ...descriptor, iat, publicKey: pub }),
    true,
  );

  const res = await fetch(`${apiUrl}/v1/agents/link/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Skill-Name': 'prava-pay' },
    body: JSON.stringify({
      public_key: pub,
      name: descriptor.name,
      platform: descriptor.platform,
      description: descriptor.description,
      iat,
      sig,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    lid?: string;
    error?: { message?: string };
  };

  if (!res.ok || !body.lid) {
    throw new Error(body.error?.message ?? `Prava link/create failed (HTTP ${res.status})`);
  }

  const linkUrl = `${dashboardUrl}/link-agent?lid=${encodeURIComponent(body.lid)}`;

  await store.save({
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
 * Checks whether the human has approved yet, recording the agent id if so.
 * Safe to call repeatedly — once linked it short-circuits.
 */
export async function checkAgentLink(
  store: IdentityStore,
  apiUrl: string,
): Promise<AgentIdentity | null> {
  const agent = await store.load();
  if (!agent) return null;
  if (agent.linked && agent.agentId) return agent;

  const res = await fetch(
    `${apiUrl}/v1/agents/link/status?lid=${encodeURIComponent(agent.linkId)}`,
    { headers: { 'X-Skill-Name': 'prava-pay' } },
  );
  const body = (await res.json().catch(() => ({}))) as { agent_id?: string; agentId?: string };

  const agentId = body.agent_id ?? body.agentId;
  if (!agentId) return agent;

  const updated: AgentIdentity = {
    ...agent,
    linked: true,
    agentId,
    linkedAt: new Date().toISOString(),
  };
  await store.save(updated);
  return updated;
}
