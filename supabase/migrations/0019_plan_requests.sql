-- ── Self-serve plans: the request a person makes, not a payment we pretend ─
--
-- SongBoost's advantage is a $10 button. Ours is the same price point in
-- shillings, but money only moves once a mobile-money collection account is
-- live. Until then the honest product is a request that reaches a human with
-- everything needed to bill: plan, amount, number, reference.
--
-- When the MoMo API credentials exist, `status` moves pending → active from the
-- payment callback and nothing else in the app has to change.

create table if not exists public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  profile_id uuid references public.profiles (id) on delete set null,
  org_id uuid references public.organizations (id) on delete set null,
  plan text not null check (plan in ('artist', 'label', 'broadcaster', 'venue', 'cmo')),
  billing text not null default 'monthly' check (billing in ('monthly', 'annual')),
  amount_ugx int not null check (amount_ugx >= 0),
  msisdn text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plan_requests_status on public.plan_requests (status, created_at desc);
create index if not exists plan_requests_profile on public.plan_requests (profile_id);

alter table public.plan_requests enable row level security;

drop policy if exists plan_requests_own_read on public.plan_requests;
create policy plan_requests_own_read on public.plan_requests for select
  using (profile_id = auth.uid() or public.my_role() = 'cmo');

drop policy if exists plan_requests_own_insert on public.plan_requests;
create policy plan_requests_own_insert on public.plan_requests for insert
  with check (profile_id = auth.uid() and status = 'pending');

drop policy if exists plan_requests_own_cancel on public.plan_requests;
create policy plan_requests_own_cancel on public.plan_requests for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and status = 'cancelled');

drop policy if exists plan_requests_cmo_update on public.plan_requests;
create policy plan_requests_cmo_update on public.plan_requests for update
  using (public.my_role() = 'cmo');
