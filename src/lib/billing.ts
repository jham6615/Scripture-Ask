import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Web-only Stripe Checkout. Calls the `create-checkout` Edge Function (which authenticates the user
 * via their Supabase JWT, creates a Stripe Checkout Session, and returns its hosted URL), then does a
 * full-page redirect to Stripe. On success Stripe redirects back to PUBLIC_SITE_URL/?checkout=success,
 * where the app refreshes the entitlement (see useWebCheckoutReturn).
 *
 * Native (iOS/Android) purchasing goes through RevenueCat instead — see src/lib/revenuecat.ts.
 */
export async function startWebCheckout(): Promise<{ ok: boolean; message?: string }> {
  if (Platform.OS !== 'web') {
    return { ok: false, message: 'Web checkout is only available in the browser app.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Please sign in first to subscribe.' };

  const { data, error } = await supabase.functions.invoke('create-checkout', { body: {} });
  if (error) return { ok: false, message: error.message };

  const url = (data as { url?: string } | null)?.url;
  if (!url) return { ok: false, message: 'Could not start checkout. Please try again.' };

  // Full-page redirect to Stripe-hosted checkout.
  (globalThis as unknown as { location: { href: string } }).location.href = url;
  return { ok: true };
}
