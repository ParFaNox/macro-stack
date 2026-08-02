import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny on-disk JSON cache under .macrostack-cache/ (gitignored).
 *
 * Exists because Next's dev server recompiles modules on every edit, which
 * discards module-scope state. Anything that must survive that — an agent
 * keypair, an OAuth token — has to hit the filesystem.
 *
 * Written 0600: these files hold private keys.
 */

const DIR = path.join(process.cwd(), '.macrostack-cache');

export function readCache<T>(key: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${key}.json`), 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${key}.json`), JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  } catch {
    /* a cache that cannot be written should not take the request down */
  }
}

export function clearCache(key: string): void {
  try {
    fs.unlinkSync(path.join(DIR, `${key}.json`));
  } catch {
    /* already gone */
  }
}
