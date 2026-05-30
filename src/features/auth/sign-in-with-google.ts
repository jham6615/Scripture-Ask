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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: origin ? { redirectTo: origin } : undefined,
    });
    if (error) throw error;
    return; // the page redirects; the session is restored on return
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
