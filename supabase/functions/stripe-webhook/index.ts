// Supabase Edge Function — Stripe webhook → Supabase `entitlements`.
//
// Stripe calls this on subscription lifecycle events. We verify the Stripe signature (NOT a Supabase
// JWT — this function is deployed with verify_jwt = false, see supabase/config.toml) and mirror the
// resulting premium status into public.entitlements using the service role (bypasses RLS).
//
// Secrets to set:
//   STRIPE_SECRET_KEY      sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET  whsec_...   (from the Stripe webhook endpoint you create)
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'npm:stripe@^17';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

/** Subscription statuses that grant premium access. */
const PREMIUM_STATUSES = new Set(['active', 'trialing']);

const customerId = (c: string | Stripe.Customer | Stripe.DeletedCustomer): string =>
  typeof c === 'string' ? c : c.id;

async function upsertFromSubscription(userId: string, sub: Stripe.Subscription): Promise<void> {
  await admin.from('entitlements').upsert(
    {
      user_id: userId,
      is_premium: PREMIUM_STATUSES.has(sub.status),
      source: 'stripe',
      status: sub.status,
      stripe_customer_id: customerId(sub.customer),
      stripe_subscription_id: sub.id,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}

/** Resolve our user id from a Stripe customer: first our table, then the customer's metadata. */
async function userIdForCustomer(custId: string): Promise<string | null> {
  const { data } = await admin
    .from('entitlements')
    .select('user_id')
    .eq('stripe_customer_id', custId)
    .maybeSingle();
  if (data?.user_id) return data.user_id;

  const customer = await stripe.customers.retrieve(custId);
  if (customer.deleted) return null;
  return (customer as Stripe.Customer).metadata?.user_id ?? null;
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing stripe-signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    // Async variant is required in Deno (uses the Web Crypto API under the hood).
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (e) {
    return new Response(`Invalid signature: ${e instanceof Error ? e.message : e}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertFromSubscription(userId, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id ?? (await userIdForCustomer(customerId(sub.customer)));
        if (userId) await upsertFromSubscription(userId, sub);
        break;
      }
      default:
        // Ignore other event types.
        break;
    }
    return Response.json({ received: true });
  } catch (e) {
    return new Response(`Handler error: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
