-- Cross-platform premium entitlement. The source of truth for "is this account premium?" across
-- web (Stripe), iOS (Apple via RevenueCat), and future desktop.
--
-- ONE ROW PER (user, source): a user may hold an 'apple' row and/or a 'stripe' row independently, and
-- premium access = ANY row with is_active = true. This keeps the two platforms from clobbering each
-- other (e.g. an Apple expiration must not revoke an active Stripe subscription).
--
-- Only server-side code (Edge Functions using the service role) writes here; clients read their own rows.

create table if not exists public.entitlements (
  user_id                 uuid not null references auth.users(id) on delete cascade,
  source                  text not null,           -- 'stripe' | 'apple'
  is_active               boolean not null default false,
  status                  text,                    -- stripe sub status, or RevenueCat event type
  stripe_customer_id      text,
  stripe_subscription_id  text,
  rc_app_user_id          text,                    -- RevenueCat app_user_id (apple source)
  current_period_end      timestamptz,
  updated_at              timestamptz not null default now(),
  primary key (user_id, source)
);

-- Fast lookup from a Stripe webhook when only the customer id is known.
create index if not exists entitlements_stripe_customer_idx on public.entitlements (stripe_customer_id);

alter table public.entitlements enable row level security;

-- Clients may read ONLY their own rows. No client write policy exists, so writes require the service
-- role key (used by the stripe-webhook and revenuecat-webhook Edge Functions).
drop policy if exists "read own entitlement" on public.entitlements;
create policy "read own entitlement" on public.entitlements
  for select using (auth.uid() = user_id);
