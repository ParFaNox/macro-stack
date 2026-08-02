/**
 * @macrostack/prava-adapter
 *
 * A reusable Prava payments adapter for autonomous agents: agent identity,
 * product discovery, and single-use amount-capped cards.
 *
 * Extracted from MacroStack AI, where every path here has been run against
 * Prava's sandbox end to end — including the failure modes, which is most of
 * what this package is actually worth. See README "Failure modes".
 */

export { PravaAdapter } from './client';
export type {
  PravaAdapterOptions,
  ProductHit,
  PurchaseSession,
  IssuedCard,
} from './client';

export { MemoryIdentityStore, signRequest } from './identity';
export type { AgentIdentity, AgentDescriptor, IdentityStore } from './identity';

export { FileIdentityStore } from './file-store';
