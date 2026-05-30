// Supabase Edge Function — RevenueCat webhook → Supabase `entitlements`.
//
// Fires on Apple (and future Android) subscription lifecycle events from RevenueCat, and mirrors the
// resulting premium status into public.entitlements (source = 'apple'). This is what lets someone who
// paid on iOS use Premium without limits on the web app and desktop app.
//
// Why this works: the app calls Purchases.logIn(<supabase user id>) (see src/lib/revenuecat.ts), so
// RevenueCat's app_user_id IS the Supabase user id. We read it off the event and upsert by user.
//
// Deployed with verify_jwt = false (RevenueCat sends no Supabase JWT). We authenticate instead by
// comparing the Authorization header to a shared secret you configure on both sides.
//
// Secrets to set:
//   REVENUECAT_WEBHOOK_AUTH   any random string; set the SAME value as the Authorization header in the
//                             RevenueCat dashboard webhook config.
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const expectedAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';

/** Our entitlement id in RevenueCat that unlocks premium. */
const PREMIUM_ENTITLEMENT = 'premium';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RCEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
};

/** Pick the Supabase user id (a UUID) from the event's id fields. */
function supabaseUserId(ev: RCEvent): string | null {
  const candidates = [ev.app_user_id, ...(ev.aliases ?? []), ev.original_app_user_id];
  return candidates.find((id): id is string => !!id && UUID_RE.test(id)) ?? null;
}

/** Whether this event concerns our premium entitlement (permissive when RC omits entitlement info). */
function concernsPremium(ev: RCEvent): boolean {
  if (Array.isArray(ev.entitlement_ids) && ev.entitlement_ids.length) {
    return ev.entitlement_ids.includes(PREMIUM_ENTITLEMENT);
  }
  if (ev.entitlement_id) return ev.entitlement_id === PREMIUM_ENTITLEMENT;
  return true;
}

/**
 * Decide active state from the event. Subscription events carry expiration_at_ms (access lasts until
 * then, even after a CANCELLATION), so future expiry = active. EXPIRATION lands in the past = inactive.
 * Returns null for events we shouldn't act on (e.g. TEST, alias/transfer with no expiry).
 */
function activeFromEvent(ev: RCEvent): boolean | null {
  if (ev.type === 'TEST') return null;
  if (typeof ev.expiration_at_ms === 'number') return ev.expiration_at_ms > Date.now();
  if (ev.type === 'EXPIRATION') return false;
  return null;
}

Deno.serve(async (req) => {
  // Shared-secret auth (constant-ish comparison; these are short config strings).
  const auth = req.headers.get('Authorization') ?? '';
  if (!expectedAuth || auth !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event: RCEvent;
  try {
    const body = await req.json();
    event = (body?.event ?? {}) as RCEvent;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // Always 200 for events we intentionally ignore, so RevenueCat doesn't retry them forever.
  if (!concernsPremium(event)) return Response.json({ received: true, ignored: 'not premium' });

  const active = activeFromEvent(event);
  if (active === null) return Response.json({ received: true, ignored: event.type ?? 'unknown' });

  const userId = supabaseUserId(event);
  if (!userId) return Response.json({ received: true, ignored: 'no supabase user id' });

  try {
    await admin.from('entitlements').upsert(
      {
        user_id: userId,
        source: 'apple',
        is_active: active,
        status: event.type ?? null,
        rc_app_user_id: event.app_user_id ?? null,
        current_period_end:
          typeof event.expiration_at_ms === 'number'
            ? new Date(event.expiration_at_ms).toISOString()
            : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,source' },
    );
    return Response.json({ received: true });
  } catch (e) {
    return new Response(`Handler error: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
