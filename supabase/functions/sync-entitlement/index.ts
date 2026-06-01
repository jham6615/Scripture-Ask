// Supabase Edge Function — pull the authoritative subscription status from Stripe and update the
// user's entitlement. Called by the app on checkout return (and can be called any time). This is the
// robust path: webhook events can be delayed, mis-selected, or capture a transient "incomplete" state,
// so instead of trusting event delivery we ask Stripe directly for the customer's current subscription.
//
// Secrets used: STRIPE_SECRET_KEY. Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import Stripe from 'npm:stripe@^17';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PREMIUM_STATUSES = new Set(['active', 'trialing']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return Response.json({ error: 'Not signed in' }, { status: 401, headers: cors });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Find the Stripe customer: our entitlement row first, else search Stripe by the user_id metadata
    // we stamp at customer creation (see create-checkout).
    const { data: ent } = await admin
      .from('entitlements')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .eq('source', 'stripe')
      .maybeSingle();

    let customerId = ent?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const found = await stripe.customers.search({ query: `metadata['user_id']:'${user.id}'`, limit: 1 });
      customerId = found.data[0]?.id;
    }
    if (!customerId) return Response.json({ premium: false, status: 'no_customer' }, { headers: cors });

    // Pull the customer's subscriptions and pick the best (prefer an active/trialing one).
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
    const best = subs.data.find((s) => PREMIUM_STATUSES.has(s.status)) ?? subs.data[0];
    const isPremium = best ? PREMIUM_STATUSES.has(best.status) : false;

    if (best) {
      await admin.from('entitlements').upsert(
        {
          user_id: user.id,
          source: 'stripe',
          is_active: isPremium,
          status: best.status,
          stripe_customer_id: customerId,
          stripe_subscription_id: best.id,
          current_period_end: best.current_period_end
            ? new Date(best.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,source' },
      );
    }

    return Response.json({ premium: isPremium, status: best?.status ?? 'none' }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
