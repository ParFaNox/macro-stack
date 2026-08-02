import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * OAuth 2.1 client for Prava's MCP server.
 *
 * Prava's MCP issues no API keys — the docs are explicit: "No API keys, no
 * manual registration". It uses OAuth 2.1 with dynamic client registration
 * (RFC 7591) and PKCE, so a server integration has to register itself, send the
 * user through a browser sign-in once, and then hold the resulting token.
 *
 * SAFETY: we request `payments:read` ONLY. `checkout:run` and `payments:write`
 * are deliberately not requested, so this token cannot buy anything even if it
 * leaked. We use Prava's MCP purely for product discovery; purchases go through
 * the sandbox REST API and our own checkout, where the amount cap and the
 * passkey guardrail live.
 */

const DEFAULT_MCP_URL = 'https://mcp.pay.prava.space/mcp';

/** Read-only. Deliberately excludes checkout:run — see the note above. */
const SCOPES = 'payments:read';

export function pravaMcpUrl(): string {
  return process.env.PRAVA_MCP_URL?.trim() || DEFAULT_MCP_URL;
}

function issuerBase(): string {
  return new URL(pravaMcpUrl()).origin;
}

export function oauthRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
  return `${base}/api/prava/oauth/callback`;
}

interface AuthServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
}

export async function discoverAuthServer(): Promise<AuthServerMetadata> {
  const res = await fetch(`${issuerBase()}/.well-known/oauth-authorization-server`);
  if (!res.ok) throw new Error(`Prava OAuth discovery failed (HTTP ${res.status})`);
  return res.json();
}

// --- token + client persistence ---------------------------------------------
//
// A file, not memory: the token must survive the dev-server restarts that
// happen constantly while building, and re-doing a browser sign-in on every
// reload would make this unusable. Gitignored alongside the other caches.

const STORE_FILE = path.join(process.cwd(), '.macrostack-cache', 'prava-oauth.json');

interface OAuthStore {
  clientId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  /** Transient, keyed by state, cleared once the callback consumes it. */
  pending?: Record<string, { verifier: string; createdAt: number }>;
}

function readStore(): OAuthStore {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as OAuthStore;
  } catch {
    return {};
  }
}

function writeStore(store: OAuthStore): void {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  } catch {
    // Read-only filesystem: the flow still works for the life of the process.
  }
}

export function isConnected(): boolean {
  const s = readStore();
  return Boolean(s.accessToken);
}

export function connectionStatus(): {
  connected: boolean;
  expiresAt?: string;
  scopes: string;
  mcpUrl: string;
} {
  const s = readStore();
  return {
    connected: Boolean(s.accessToken),
    ...(s.expiresAt ? { expiresAt: new Date(s.expiresAt).toISOString() } : {}),
    scopes: SCOPES,
    mcpUrl: pravaMcpUrl(),
  };
}

export function disconnect(): void {
  writeStore({});
}

// --- registration ------------------------------------------------------------

async function ensureClientId(): Promise<string> {
  const store = readStore();
  if (store.clientId) return store.clientId;

  const meta = await discoverAuthServer();
  const res = await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'MacroStack',
      redirect_uris: [oauthRedirectUri()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    throw new Error(`Prava dynamic client registration failed (HTTP ${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  writeStore({ ...store, clientId: body.client_id });
  return body.client_id as string;
}

// --- authorization -----------------------------------------------------------

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Builds the URL the user visits to approve read-only access. */
export async function buildAuthorizationUrl(): Promise<string> {
  const [clientId, meta] = await Promise.all([ensureClientId(), discoverAuthServer()]);

  // PKCE S256 — the only method the server advertises.
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const store = readStore();
  const pending = store.pending ?? {};
  // Drop anything older than 10 minutes so this can't grow unbounded.
  for (const [k, v] of Object.entries(pending)) {
    if (Date.now() - v.createdAt > 600_000) delete pending[k];
  }
  pending[state] = { verifier, createdAt: Date.now() };
  writeStore({ ...store, pending });

  const url = new URL(meta.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', oauthRedirectUri());
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // RFC 8707 resource indicator. MCP requires it and rejects the request with
  // `invalid_target — resource must equal the canonical MCP URI` without it.
  // The canonical value is published at /.well-known/oauth-protected-resource.
  url.searchParams.set('resource', pravaMcpUrl());

  return url.toString();
}

/** Exchanges the callback code for a token. Consumes the state single-use. */
export async function exchangeCode(code: string, state: string): Promise<void> {
  const store = readStore();
  const pending = store.pending?.[state];

  if (!pending) throw new Error('Unknown or already-used OAuth state — restart the connection.');
  delete store.pending![state];

  const meta = await discoverAuthServer();
  const clientId = store.clientId;
  if (!clientId) throw new Error('No registered client id — restart the connection.');

  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: oauthRedirectUri(),
      client_id: clientId,
      code_verifier: pending.verifier,
      // Must match the authorize request, or the token endpoint rejects it.
      resource: pravaMcpUrl(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Prava token exchange failed (HTTP ${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  writeStore({
    ...store,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? Date.now() + Number(body.expires_in) * 1000 - 30_000 : undefined,
  });
}

async function refresh(): Promise<string | null> {
  const store = readStore();
  if (!store.refreshToken || !store.clientId) return null;

  const meta = await discoverAuthServer();
  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: store.refreshToken,
      client_id: store.clientId,
      resource: pravaMcpUrl(),
    }),
  });
  if (!res.ok) return null;

  const body = await res.json();
  writeStore({
    ...store,
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? store.refreshToken,
    expiresAt: body.expires_in ? Date.now() + Number(body.expires_in) * 1000 - 30_000 : undefined,
  });
  return body.access_token as string;
}

/** A usable access token, refreshed if it has expired. Null when not connected. */
export async function getAccessToken(): Promise<string | null> {
  const store = readStore();
  if (!store.accessToken) return null;
  if (store.expiresAt && Date.now() >= store.expiresAt) return refresh();
  return store.accessToken;
}
