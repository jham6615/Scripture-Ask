import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Lets the in-app browser hand control back after the OAuth redirect (no-op on native).
WebBrowser.maybeCompleteAuthSession();

/**
 * Sign in with Google via Supabase OAuth.
 * - Web: full-page redirect; Supabase reads the session back from the URL.
 * - Native: opens an in-app browser, then exchanges the returned code for a session.
 *   (Reliable in a real/dev build with the `biblefriend://` scheme; Expo Go's dynamic URL is flaky.)
 */
export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    // Return to a PATH (/auth), not the bare origin. Supabase's redirect allow-list uses
    // `https://<domain>/**`, which matches paths but NOT the bare domain — so redirecting to the bare
    // origin makes Supabase drop the auth code on the way back. A path reliably matches the wildcard.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: origin ? { redirectTo: `${origin}/auth` } : undefined,
    });
    if (error) throw error;
    // signInWithOAuth schedules window.location.assign(googleUrl) and returns synchronously.
    // If we resolved here, the caller would race the browser navigation by calling router.back() in
    // the SAME JS turn — history.back() lands before the browser fires the OAuth navigation, so the
    // user ends up on the previous page instead of Google. Block here forever: the page is about to
    // navigate away anyway, so a never-resolving promise is the right shape. useOAuthCallback
    // handles the round-trip back to /auth?code=... on the next page load.
    await new Promise<never>(() => {});
    return;
  }

  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // user cancelled or dismissed

  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : undefined;
  if (!code) throw new Error('Google sign-in did not complete.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}
