-- ── Alert outbox: from a detected play to a WhatsApp/email message ─────────
--
-- The database decides *who* should hear about something and writes a row per
-- recipient. Delivery (WhatsApp Cloud API, email) happens outside Postgres in
-- `/api/cron/alerts`, which can retry safely because every row is idempotent
-- per recipient.

create table if not exists public.alert_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('firstspin', 'chart', 'dispute', 'payout')),
  title text not null,
  body text not null,
  link text,
  -- e.g. 'firstspin:<recording>:<station>' — one alert per person per event,
  -- no matter how many times the enqueue function runs.
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  channel text check (channel in ('whatsapp', 'email')),
  attempts int not null default 0,
  last_error text,
  unique (profile_id, dedupe_key)
);
create index if not exists alert_outbox_pending_idx
  on public.alert_outbox (created_at) where sent_at is null;

alter table public.alert_outbox enable row level security;

-- People can read their own alert history; nobody writes from the browser.
drop policy if exists alert_outbox_self on public.alert_outbox;
create policy alert_outbox_self on public.alert_outbox for select using (profile_id = auth.uid());

-- Statements need to know when they appeared, so a new one can be announced.
alter table public.royalty_statements add column if not exists created_at timestamptz not null default now();

-- ── Per-person switches ───────────────────────────────────────────────────
-- An absent row (or an absent key) means the default: plays, charts and
-- disputes on; statements off. That matches the settings screen.
create or replace function public.alert_wanted(p_profile uuid, p_kind text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (events ->> p_kind)::boolean from public.alert_prefs where profile_id = p_profile),
    p_kind <> 'payout'
  )
$$;

-- ── Enqueue everything that happened since `p_since` ──────────────────────
create or replace function public.enqueue_alerts(p_since timestamptz default null, p_limit int default 200)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := coalesce(p_since, now() - interval '1 hour');
  v_total int := 0;
  v_n int;
begin
  -- First spin on a station: the first time this track is heard there.
  insert into public.alert_outbox (profile_id, kind, title, body, link, dedupe_key)
  select distinct p.id, 'firstspin',
         'First spin on ' || f.station,
         f.title || ' was just detected on ' || f.station || '. That is a new station for this recording.',
         '/dashboard/artist',
         'firstspin:' || f.recording_id || ':' || f.station_id
  from (
    select d.recording_id, d.station_id, rec.title,
           coalesce(st.name, 'a monitored stream') as station
    from public.detections d
    join public.recordings rec on rec.id = d.recording_id
    left join public.stations st on st.id = d.station_id
    where d.recording_id is not null
      and d.station_id is not null
      and d.detected_at >= v_since
      and not exists (
        select 1 from public.detections e
        where e.recording_id = d.recording_id
          and e.station_id = d.station_id
          and (e.detected_at < d.detected_at or (e.detected_at = d.detected_at and e.id < d.id))
      )
    limit p_limit
  ) f
  join public.profiles p on p.approved and (p.id = (select artist_profile_id from public.recordings where id = f.recording_id)
    or p.org_id = (select label_org_id from public.recordings where id = f.recording_id))
  where public.alert_wanted(p.id, 'firstspin')
  on conflict (profile_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- A dispute names two claimants: both sides hear about it immediately.
  insert into public.alert_outbox (profile_id, kind, title, body, link, dedupe_key)
  select distinct p.id, 'dispute',
         'Ownership dispute opened',
         coalesce(rec.title, 'A recording') || ' now has two claimants. An auditor will review the split before any royalty is paid.',
         '/dashboard/label',
         'dispute:' || d.id
  from public.disputes d
  left join public.recordings rec on rec.id = d.recording_id
  join public.profiles p on p.approved and (p.org_id = d.claimant_a or p.org_id = d.claimant_b)
  where d.opened_at >= v_since
    and public.alert_wanted(p.id, 'dispute')
  on conflict (profile_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- A new royalty statement is a money event; nobody wants to miss it.
  insert into public.alert_outbox (profile_id, kind, title, body, link, dedupe_key)
  select distinct p.id, 'payout',
         'Royalty statement ready',
         'Your statement for ' || to_char(s.period, 'FMMonth YYYY') || ' is ready: '
           || to_char(s.amount_ugx, 'FM999,999,999') || ' UGX (' || s.status || ').',
         '/dashboard/label',
         'payout:' || s.id
  from public.royalty_statements s
  join public.profiles p on p.approved and (p.id = s.profile_id or p.org_id = s.org_id)
  where s.created_at >= v_since
    and public.alert_wanted(p.id, 'payout')
  on conflict (profile_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end $$;

-- ── Weekly chart movement ─────────────────────────────────────────────────
-- Run once a week (not hourly): compares this week with last week and tells
-- rights holders about new entries and climbers.
create or replace function public.enqueue_chart_alerts(p_now timestamptz default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_week text := to_char(coalesce(p_now, now()), 'IYYY-IW');
  v_total int;
begin
  with cur as (
    select d.recording_id, count(*)::int as spins
    from public.detections d
    where d.recording_id is not null and d.detected_at >= v_now - interval '7 days'
    group by 1
  ), prev as (
    select d.recording_id, count(*)::int as spins
    from public.detections d
    where d.recording_id is not null
      and d.detected_at >= v_now - interval '14 days'
      and d.detected_at < v_now - interval '7 days'
    group by 1
  ), ranked as (
    select c.recording_id, rank() over (order by c.spins desc) as pos, c.spins,
           coalesce(p.spins, 0) as prev_spins
    from cur c left join prev p on p.recording_id = c.recording_id
  )
  insert into public.alert_outbox (profile_id, kind, title, body, link, dedupe_key)
  select distinct pr.id, 'chart',
         'Chart entry: ' || r.title,
         r.title || ' is #' || k.pos || ' this week with ' || k.spins || ' plays'
           || case when k.prev_spins = 0 then ' — a new entry.' else ' (up from ' || k.prev_spins || ').' end,
         '/dashboard/artist',
         'chart:' || k.recording_id || ':' || v_week
  from ranked k
  join public.recordings r on r.id = k.recording_id
  join public.profiles pr on pr.approved
    and (pr.id = r.artist_profile_id or pr.org_id = r.label_org_id)
  where k.pos <= 100
    and k.spins > k.prev_spins
    and public.alert_wanted(pr.id, 'chart')
  on conflict (profile_id, dedupe_key) do nothing;
  get diagnostics v_total = row_count;
  return v_total;
end $$;

-- Delivery is server-side only: the anon/authenticated roles cannot enqueue.
revoke execute on function public.enqueue_alerts(timestamptz, int) from public, anon, authenticated;
revoke execute on function public.enqueue_chart_alerts(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_alerts(timestamptz, int) to service_role;
grant execute on function public.enqueue_chart_alerts(timestamptz) to service_role;
