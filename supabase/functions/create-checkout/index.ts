// Supabase Edge Function — create a Stripe Checkout Session for the signed-in user.
//
// The web app calls this (with the user's Supabase JWT attached by supabase.functions.invoke) when
// they tap "Subscribe". It finds-or-creates a Stripe customer for the account, opens a subscription
// Checkout Session stamped with the user's id, and returns the hosted checkout URL for redirect.
//
// Secrets to set (Supabase dashboard → Edge Functions → Secrets, or `supabase secrets set`):
//   STRIPE_SECRET_KEY   sk_test_... / sk_live_...
//   STRIPE_PRICE_ID     price_...        (the monthly Premium price)
//   PUBLIC_SITE_URL     https://<vercel-domain>   (used for success/cancel redirects)
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
    if (userErr || !user) {
      return Response.json({ error: 'Not signed in' }, { status: 401, headers: cors });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    const priceId = Deno.env.get('STRIPE_PRICE_ID')!;
    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:8081';

    // Reuse the Stripe customer we already linked to this account, if any (one customer per user).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ent } = await admin
      .from('entitlements')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .eq('source', 'stripe')
      .maybeSingle();

    let customerId = ent?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
    });

    return Response.json({ url: session.url }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
