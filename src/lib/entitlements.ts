import { supabase } from './supabase';

/**
 * Reads the signed-in user's premium entitlement from Supabase.
 *
 * The `entitlements` table is the cross-platform source of truth: web Stripe purchases land here via
 * the stripe-webhook Edge Function, and (phase 2) iOS RevenueCat status will be mirrored here too.
 * Returns false when signed out, on error, or when there is no entitlement row yet.
 */
export async function fetchServerEntitlement(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('entitlements')
    .select('is_premium')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return false;
  return !!data?.is_premium;
}
