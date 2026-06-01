import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type WebGlobals = {
  location: { href: string };
  history: { replaceState: (data: unknown, unused: string, url: string) => void };
};

/**
 * Web-only: completes the OAuth (and email-confirmation) PKCE handshake.
 *
 * Supabase's automatic detectSessionInUrl is disabled (see lib/supabase.ts) because it runs during
 * client construction and reads the code-verifier from AsyncStorage before it's ready on web, failing
 * the exchange. Here we run after mount — when storage is ready — read the `?code=` from the return
 * URL (the sign-in returns to /auth so it matches Supabase's `…/**` redirect rule), exchange it for a
 * session, then strip the param. The auth state listener picks up the new session and the UI updates.
 *
 * NOTE: deliberately does NOT navigate after the exchange. Navigating here (router.replace) raced the
 * async session persist and dropped the session. The user lands on /auth signed in; the Done button
 * (auth.tsx) takes them to the reader. No-op on native.
 */
export function useOAuthCallback(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const g = globalThis as unknown as WebGlobals;
    const url = new URL(g.location.href);

    // DIAGNOSTIC: print exactly what the auth redirect lands on, so we can see the real cause.
    if (url.search || url.hash) {
      console.log('[oauth] RETURN →', JSON.stringify({ path: url.pathname, search: url.search, hash: url.hash }));
    }
    const errParam = url.searchParams.get('error') || url.searchParams.get('error_code');
    if (errParam) {
      console.error('[oauth] PROVIDER ERROR →', errParam, '::', url.searchParams.get('error_description'));
    }

    const code = url.searchParams.get('code');
    if (!code) return;

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) console.error('[oauth] code exchange failed:', error.message);
      })
      .catch((e) => console.error('[oauth] code exchange threw:', e))
      .finally(() => {
        url.searchParams.delete('code');
        g.history.replaceState({}, '', url.toString());
      });
  }, []);
}
