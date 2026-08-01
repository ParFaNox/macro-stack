import crypto from 'node:crypto';

/**
 * Minimal account + session layer.
 *
 * Scope, stated honestly: passwords are scrypt-hashed with a per-user salt and
 * sessions are signed HMAC cookies, so this is not toy auth — but the store is
 * in-memory. Restart the server and accounts are gone, and it will not work
 * across multiple instances. Swapping the three `store` maps for a database is
 * the only change needed; nothing else in the app touches user state directly.
 *
 * It exists because /login and /signup previously did nothing at all, and
 * because order history has to belong to *someone* for the profile page to show
 * anything real.
 */

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

/** One completed purchase, attributed to a user. */
export interface UserOrder {
  orderId: string;
  productName: string;
  merchantName: string;
  chargedUSD: number;
  retailUSD: number;
  savedUSD: number;
  placedAt: string;
  cardLast4: string;
  environment: string;
}

/** One optimizer run, attributed to a user. */
export interface UserAudit {
  auditedAt: string;
  ingredients: string[];
  budgetUSD: number;
  retailUSD: number;
  discountedUSD: number;
  savedUSD: number;
  productCount: number;
}

interface AuthState {
  users: Map<string, User>;
  ordersByUser: Map<string, UserOrder[]>;
  auditsByUser: Map<string, UserAudit[]>;
}

// Pinned to globalThis for the same reason the merchant store is: Next
// recompiles route modules independently in dev, and module-scope state does
// not survive that.
const globalRef = globalThis as typeof globalThis & { __macrostackAuth?: AuthState };
const store: AuthState = (globalRef.__macrostackAuth ??= {
  users: new Map(),
  ordersByUser: new Map(),
  auditsByUser: new Map(),
});

export const SESSION_COOKIE = 'macrostack_session';

function sessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || 'macrostack-dev-session-secret';
}

// --- passwords ---------------------------------------------------------------

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, user: User): boolean {
  const candidate = Buffer.from(hashPassword(password, user.passwordSalt));
  const stored = Buffer.from(user.passwordHash);
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

// --- sessions ----------------------------------------------------------------

/** `userId.signature` — signed so a client cannot forge another user's id. */
export function issueSessionToken(userId: string): string {
  const sig = crypto.createHmac('sha256', sessionSecret()).update(userId).digest('base64url');
  return `${userId}.${sig}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx < 1) return null;

  const userId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', sessionSecret()).update(userId).digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return store.users.has(userId) ? userId : null;
}

// --- accounts ----------------------------------------------------------------

export function createUser(email: string, password: string): { user: User } | { error: string } {
  const normalized = email.trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return { error: 'Enter a valid email address.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if ([...store.users.values()].some((u) => u.email === normalized)) {
    return { error: 'An account with that email already exists.' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const user: User = {
    id: crypto.randomUUID(),
    email: normalized,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };

  store.users.set(user.id, user);
  return { user };
}

export function authenticate(email: string, password: string): { user: User } | { error: string } {
  const normalized = email.trim().toLowerCase();
  const user = [...store.users.values()].find((u) => u.email === normalized);

  // Same message either way — revealing which half was wrong helps enumeration.
  if (!user || !verifyPassword(password, user)) return { error: 'Email or password is incorrect.' };
  return { user };
}

export function getUser(userId: string): User | undefined {
  return store.users.get(userId);
}

// --- attributed history ------------------------------------------------------

export function recordOrders(userId: string, orders: UserOrder[]): void {
  const existing = store.ordersByUser.get(userId) ?? [];
  store.ordersByUser.set(userId, [...orders, ...existing]);
}

export function recordAudit(userId: string, audit: UserAudit): void {
  const existing = store.auditsByUser.get(userId) ?? [];
  store.auditsByUser.set(userId, [audit, ...existing].slice(0, 50));
}

export function getOrders(userId: string): UserOrder[] {
  return store.ordersByUser.get(userId) ?? [];
}

export function getAudits(userId: string): UserAudit[] {
  return store.auditsByUser.get(userId) ?? [];
}

export interface ProfileSummary {
  email: string;
  memberSince: string;
  totalSavedUSD: number;
  stacksAudited: number;
  ordersPlaced: number;
  totalSpentUSD: number;
  orders: UserOrder[];
  audits: UserAudit[];
}

/** Everything the profile page shows — all derived, none hardcoded. */
export function getProfileSummary(userId: string): ProfileSummary | null {
  const user = store.users.get(userId);
  if (!user) return null;

  const orders = getOrders(userId);
  const audits = getAudits(userId);

  return {
    email: user.email,
    memberSince: user.createdAt,
    // Savings realised at checkout, plus savings identified by audits that
    // haven't been purchased — counted separately would be misleading, so this
    // is purchases only.
    totalSavedUSD: Number(orders.reduce((s, o) => s + o.savedUSD, 0).toFixed(2)),
    stacksAudited: audits.length,
    ordersPlaced: orders.length,
    totalSpentUSD: Number(orders.reduce((s, o) => s + o.chargedUSD, 0).toFixed(2)),
    orders,
    audits,
  };
}
