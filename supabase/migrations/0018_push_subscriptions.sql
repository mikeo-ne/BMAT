-- ── Web push: one row per browser a person has installed ───────────────────
--
-- Alerts already leave by email, WhatsApp and SMS from the worker. Push is the
-- "it's in my pocket" channel SongBoost sells, and it belongs to the same
-- person: a subscription is tied to the signed-in profile, so an artist can
-- only ever register their own devices.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  failures int not null default 0
);

create index if not exists push_subscriptions_profile on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_own_read on public.push_subscriptions;
create policy push_own_read on public.push_subscriptions for select
  using (profile_id = auth.uid() or public.my_role() = 'cmo');

drop policy if exists push_own_insert on public.push_subscriptions;
create policy push_own_insert on public.push_subscriptions for insert
  with check (profile_id = auth.uid());

drop policy if exists push_own_update on public.push_subscriptions;
create policy push_own_update on public.push_subscriptions for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_delete on public.push_subscriptions for delete
  using (profile_id = auth.uid());

-- Called by /api/push/send when a push provider rejects a device (not 404/410).
create or replace function public.bump_push_failures(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions
     set failures = failures + 1
   where id = any(p_ids);
$$;

revoke all on function public.bump_push_failures(uuid[]) from public;
revoke all on function public.bump_push_failures(uuid[]) from anon, authenticated;
