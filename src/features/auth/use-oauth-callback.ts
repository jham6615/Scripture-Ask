import { router } from 'expo-router';
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
 * session, and then send the user to the reader. No-op on native.
 */
export function useOAuthCallback(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const g = globalThis as unknown as WebGlobals;
    const url = new URL(g.location.href);
    const code = url.searchParams.get('code');
    if (!code) return;

    const cleanCodeFromUrl = () => {
      url.searchParams.delete('code');
      g.history.replaceState({}, '', url.toString());
    };

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          console.error('[oauth] code exchange failed:', error.message);
          cleanCodeFromUrl();
        } else {
          // Signed in — leave the /auth callback landing and go straight to the reader.
          router.replace('/');
        }
      })
      .catch((e) => {
        console.error('[oauth] code exchange threw:', e);
        cleanCodeFromUrl();
      });
  }, []);
}
