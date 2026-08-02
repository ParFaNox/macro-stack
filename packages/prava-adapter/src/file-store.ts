import fs from 'node:fs';
import path from 'node:path';

import type { AgentIdentity, IdentityStore } from './identity';

/**
 * Persists the agent identity to disk, mode 0600.
 *
 * Written because the alternative — module-scope state — is silently destroyed
 * by any dev-server recompile or serverless cold start, and the symptom is not
 * an error but a quiet fallback to unlinked. Deployments without a writable
 * filesystem should implement IdentityStore against a secret store instead.
 */
export class FileIdentityStore implements IdentityStore {
  constructor(private readonly file = path.join(process.cwd(), '.prava', 'agent.json')) {}

  load(): AgentIdentity | null {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as AgentIdentity;
    } catch {
      return null;
    }
  }

  save(identity: AgentIdentity): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(identity, null, 2), { mode: 0o600 });
  }
}
