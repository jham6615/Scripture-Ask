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
 * URL, exchange it for a session, then strip the param. On success the auth listener picks up the
 * new session and the app updates. No-op on native (which exchanges the code in sign-in-with-google).
 */
export function useOAuthCallback(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const g = globalThis as unknown as WebGlobals;
    const url = new URL(g.location.href);
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
