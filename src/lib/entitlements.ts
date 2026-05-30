import { supabase } from './supabase';

/**
 * Reads the signed-in user's premium entitlement from Supabase.
 *
 * The `entitlements` table is the cross-platform source of truth: web Stripe purchases land here via
 * the stripe-webhook Edge Function, and iOS Apple subscriptions via the revenuecat-webhook. There is
 * one row per source ('apple' / 'stripe'); the account is premium if ANY row is active. Returns false
 * when signed out, on error, or when there are no entitlement rows yet.
 */
export async function fetchServerEntitlement(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('entitlements')
    .select('is_active')
    .eq('user_id', user.id);

  if (error) return false;
  return (data ?? []).some((row) => row.is_active === true);
}
