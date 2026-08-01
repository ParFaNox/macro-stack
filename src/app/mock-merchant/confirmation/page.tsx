import { Suspense } from 'react';

import Client from './confirmation-client';

/**
 * Server shell.
 *
 * The client component reads `useSearchParams`, so this route must render at
 * request time. Left static, Next prerenders it with an empty query string and
 * then hydrates with the real one, which is a hydration mismatch.
 */
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>Loading…</main>}>
      <Client />
    </Suspense>
  );
}
