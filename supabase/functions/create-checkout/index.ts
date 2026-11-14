// Supabase Edge Function — create a Stripe Checkout Session for the signed-in user.
//
// The web app calls this (with the user's Supabase JWT attached by supabase.functions.invoke) when
// they tap "Subscribe". It finds-or-creates a Stripe customer for the account, opens a subscription
// Checkout Session stamped with the user's id, and returns the hosted checkout URL for redirect.
//
// Body: { plan?: 'annual' | 'monthly' } (defaults to monthly, which is what older web builds send).
// The annual plan includes a free trial for customers who have never subscribed before.
//
// Secrets to set (Supabase dashboard → Edge Functions → Secrets, or `supabase secrets set`):
//   STRIPE_SECRET_KEY         sk_test_... / sk_live_...
//   STRIPE_PRICE_ID           price_...        (the monthly Premium price)
//   STRIPE_PRICE_ID_ANNUAL    price_...        (the annual Premium price)
//   STRIPE_ANNUAL_TRIAL_DAYS  optional, default 7 (0 turns the trial off)
//   PUBLIC_SITE_URL           https://<vercel-domain>   (used for success/cancel redirects)
// Auto-injected by Supabase (do NOT set): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'npm:stripe@^17';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Identify the caller from their forwarded Supabase JWT.
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
    // Anonymous users (created for a signed-out reader's free question) can't buy: a subscription has
    // to belong to a real account so it unlocks Premium on every platform.
    if (userErr || !user || user.is_anonymous) {
      return Response.json({ error: 'Not signed in' }, { status: 401, headers: cors });
    }

    const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
    const annual = plan === 'annual';
    const priceId = annual ? Deno.env.get('STRIPE_PRICE_ID_ANNUAL') : Deno.env.get('STRIPE_PRICE_ID');
    if (!priceId) {
      return Response.json(
        { error: `The ${annual ? 'annual' : 'monthly'} plan isn't set up yet.` },
        { status: 500, headers: cors },
      );
    }
    const trialDaysRaw = Number.parseInt(Deno.env.get('STRIPE_ANNUAL_TRIAL_DAYS') ?? '7', 10);
    const annualTrialDays = Number.isFinite(trialDaysRaw) && trialDaysRaw > 0 ? trialDaysRaw : 0;

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    // Use the calling site's Origin for the post-checkout redirect so it always returns to the right
    // place (no PUBLIC_SITE_URL secret required). Falls back to the secret, then localhost for dev.
    const siteUrl =
      req.headers.get('origin') ?? Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:8081';

    // Reuse the Stripe customer we already linked to this account, if any (one customer per user).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ent } = await admin
      .from('entitlements')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .eq('source', 'stripe')
      .maybeSingle();

    let customerId = ent?.stripe_customer_id ?? undefined;
    let firstTimeCustomer = true;
    if (customerId) {
      // One trial per customer: anyone who has ever had a subscription pays from day one.
      const prior = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 });
      firstTimeCustomer = prior.data.length === 0;
    } else {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
    }
    const trialDays = annual && firstTimeCustomer ? annualTrialDays : 0;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: {
        metadata: { user_id: user.id },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      allow_promotion_codes: true,
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
    });

    return Response.json({ url: session.url }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
