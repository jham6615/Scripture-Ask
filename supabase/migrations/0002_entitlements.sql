-- Cross-platform premium entitlement, keyed by user. This is the source of truth for "is this account
-- premium?" across web (Stripe), iOS (RevenueCat/Apple, mirrored in a later phase), and future desktop.
-- Only server-side code (Edge Functions using the service role) writes here; clients read their own row.

create table if not exists public.entitlements (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  is_premium              boolean not null default false,
  source                  text,            -- 'stripe' | 'apple'
  status                  text,            -- stripe subscription status: active | trialing | canceled | past_due | ...
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_end      timestamptz,
  updated_at              timestamptz not null default now()
);

-- Fast lookup from a Stripe webhook when only the customer id is known.
create index if not exists entitlements_stripe_customer_idx on public.entitlements (stripe_customer_id);

alter table public.entitlements enable row level security;

-- Clients may read ONLY their own entitlement. There is deliberately no client INSERT/UPDATE/DELETE
-- policy, so writes are possible only with the service role key (used by the stripe-webhook function).
drop policy if exists "read own entitlement" on public.entitlements;
create policy "read own entitlement" on public.entitlements
  for select using (auth.uid() = user_id);
