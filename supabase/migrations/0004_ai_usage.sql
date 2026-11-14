-- Server-side AI usage metering for the `ai` Edge Function.
--
-- Every AI request is counted here BEFORE the model is called, so the free tier and the abuse caps
-- hold no matter what the client does (reinstalling, clearing storage, or calling the endpoint
-- directly). Only the service role touches this table: RLS is on and there are no policies.
--
-- subject: 'user:<uuid>' for Supabase users (real accounts and the anonymous users the app creates
--          for signed-out readers).
-- bucket : what is being counted, e.g. 'free_chat' (lifetime) or 'chat:2026-11-14' (one day).

create table if not exists public.ai_usage (
  subject     text        not null,
  bucket      text        not null,
  count       integer     not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (subject, bucket)
);

alter table public.ai_usage enable row level security;

-- Atomically take one unit from a bucket. Returns true when the request is allowed (the count was
-- below p_limit and has been incremented) and false when the bucket is already full.
create or replace function public.ai_consume(p_subject text, p_bucket text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  if p_limit is null or p_limit <= 0 then
    return false;
  end if;

  insert into public.ai_usage as u (subject, bucket, count)
  values (p_subject, p_bucket, 1)
  on conflict (subject, bucket) do update
    set count = u.count + 1, updated_at = now()
    where u.count < p_limit
  returning u.count into new_count;

  return new_count is not null;
end;
$$;

-- Give one unit back. Used when the model call fails, so a failed answer doesn't burn a free question.
create or replace function public.ai_refund(p_subject text, p_bucket text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set count = greatest(count - 1, 0), updated_at = now()
   where subject = p_subject and bucket = p_bucket;
$$;

revoke all on function public.ai_consume(text, text, integer) from public, anon, authenticated;
revoke all on function public.ai_refund(text, text) from public, anon, authenticated;
grant execute on function public.ai_consume(text, text, integer) to service_role;
grant execute on function public.ai_refund(text, text) to service_role;
