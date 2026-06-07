import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Sign in with Apple via Supabase (iOS only).
 *
 * Required by App Review (Guideline 4.8) as an equivalent option alongside Google. The native Apple
 * Authentication flow returns an OIDC identity token, which Supabase exchanges for a session via
 * signInWithIdToken — no browser round-trip needed.
 *
 * Apple only returns the user's full name on the FIRST sign-in for a given Apple ID. When present,
 * we persist it to user_metadata so the email-fallback isn't the only identifying info on the account.
 */
export async function signInWithApple(): Promise<void> {
  if (Platform.OS !== 'ios') throw new Error('Sign in with Apple is iOS only.');

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  if (credential.fullName) {
    const parts = [
      credential.fullName.givenName,
      credential.fullName.middleName,
      credential.fullName.familyName,
    ].filter((p): p is string => !!p);
    if (parts.length > 0) {
      await supabase.auth.updateUser({
        data: {
          full_name: parts.join(' '),
          given_name: credential.fullName.givenName ?? null,
          family_name: credential.fullName.familyName ?? null,
        },
      });
    }
  }
}

/** True only on iOS when the device supports Sign in with Apple (iOS 13+). */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

/** Re-export so the auth screen can render the official Apple button. */
export { AppleAuthentication };
