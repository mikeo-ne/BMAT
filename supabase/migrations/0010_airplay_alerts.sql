-- ── Airplay alerts: every play, daily summary, settings that actually apply ──
--
-- 1. Two new alert kinds:
--      play   one message per detected play (off by default: a hit song can
--             be played dozens of times a day)
--      daily  one summary per person per day: yesterday's plays, by song and
--             station (on by default)
-- 2. Fix: the settings screen saves `firstSpin`, but alert_wanted() looked up
--    `firstspin`, so switching first-spin alerts off had no effect.
-- 3. Links point at the dashboard of the person's own role.
--
-- Delivery stays outside Postgres (the monitoring worker, or /api/cron/alerts).

alter table public.alert_outbox drop constraint if exists alert_outbox_kind_check;
alter table public.alert_outbox add constraint alert_outbox_kind_check
  check (kind in ('firstspin', 'play', 'daily', 'chart', 'dispute', 'payout'));

-- Settings keys as the dashboard saves them → the kind used here.
create or replace function public.alert_wanted(p_profile uuid, p_kind text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(events ->> p_kind,
                     events ->> case p_kind when 'firstspin' then 'firstSpin' when 'play' then 'everyPlay'
                                            when 'daily' then 'dailySummary' else p_kind end)::boolean
     from public.alert_prefs where profile_id = p_profile),
    p_kind not in ('payout', 'play')
  )
$$;
revoke execute on function public.alert_wanted(uuid, text) from public, anon, authenticated;

create or replace function public.alert_link(p_role public.app_role)
returns text language sql immutable set search_path = public as $$
  select case p_role when 'label' then '/dashboard/label' when 'cmo' then '/dashboard/cmo'
                     when 'broadcaster' then '/dashboard/broadcaster' when 'venue' then '/dashboard/venue'
                     else '/dashboard/artist' end
$$;

create or replace function public.kampala_time(p_at timestamptz)
returns text language sql immutable set search_path = public as $$
  select to_char(p_at at time zone 'Africa/Kampala', 'HH24:MI')
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
  -- Recent plays of catalogue songs, each with "is this the first time on this station?".
  create temporary table if not exists _recent_plays (
    detection_id bigint, recording_id uuid, station_id uuid, detected_at timestamptz,
    duration_sec int, title text, station text, first_on_station boolean
  ) on commit drop;
  truncate _recent_plays;
  insert into _recent_plays
  select d.id, d.recording_id, d.station_id, d.detected_at, d.duration_sec, rec.title,
         coalesce(st.name, 'a monitored station') || coalesce(' ' || nullif(st.frequency, ''), ''),
         not exists (
           select 1 from public.detections e
           where e.recording_id = d.recording_id and e.station_id = d.station_id
             and (e.detected_at < d.detected_at or (e.detected_at = d.detected_at and e.id < d.id)))
  from public.detections d
  join public.recordings rec on rec.id = d.recording_id
  left join public.stations st on st.id = d.station_id
  where d.recording_id is not null and d.station_id is not null and d.detected_at >= v_since
  order by d.detected_at
  limit p_limit;

  -- Every play (for people who asked for it). Says so when it is a first spin,
  -- and replaces the separate first-spin message for them.
  insert into public.alert_outbox (profile_id, kind, title, body, link, dedupe_key)
  select distinct p.id, 'play',
         'Played on ' || f.station || ': ' || f.title,
         f.title || ' was played on ' || f.station || ' at ' || public.kampala_time(f.detected_at) || ' (Kampala time)'
           || case when f.duration_sec >= 60 then ', ' || (f.duration_sec / 60) || ' min ' || (f.duration_sec % 60) || ' s.'
                   else ', ' || f.duration_sec || ' s.' end
           || case when f.first_on_station then ' This is its first play on this station.' else '' end,
         public.alert_link(p.role),
         'play:' || f.detection_id
  from _recent_plays f
  join public.recordings r on r.id = f.recording_id
  join public.profiles p on p.approved and (p.id = r.artist_profile_id or p.org_id = r.label_org_id)
  where public.alert_wanted(p.id, 'play')
  on conflict (profile_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- First spin on a station: the first time this song is heard there.
  insert into public.alert_outbox (profile_id, kind, title, body, link, dedupe_key)
  select distinct p.id, 'firstspin',
         'First play on ' || f.station || ': ' || f.title,
         f.title || ' was just played on ' || f.station || ' for the first time, at '
           || public.kampala_time(f.detected_at) || ' (Kampala time).',
         public.alert_link(p.role),
         'firstspin:' || f.recording_id || ':' || f.station_id
  from _recent_plays f
  join public.recordings r on r.id = f.recording_id
  join public.profiles p on p.approved and (p.id = r.artist_profile_id or p.org_id = r.label_org_id)
  where f.first_on_station
    and public.alert_wanted(p.id, 'firstspin')
    and not public.alert_wanted(p.id, 'play')
  on conflict (profile_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- A dispute names two claimants: both sides hear about it immediately.
  insert into public.alert_outbox (profile_id, kind, title, body, link, dedupe_key)
  select distinct p.id, 'dispute',
         'Ownership dispute opened',
         coalesce(rec.title, 'A recording') || ' now has two claimants. An auditor will review the split before any royalty is paid.',
         public.alert_link(p.role),
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
         public.alert_link(p.role),
         'payout:' || s.id
  from public.royalty_statements s
  join public.profiles p on p.approved and (p.id = s.profile_id or p.org_id = s.org_id)
  where s.created_at >= v_since
    and public.alert_wanted(p.id, 'payout')
  on conflict (profile_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end $$;

-- ── Daily summary: yesterday in Kampala, per person ───────────────────────
-- Safe to call any number of times: one row per person per day.
create or replace function public.enqueue_daily_alerts(p_day date default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Kampala')::date - 1);
  v_from timestamptz := (v_day::timestamp at time zone 'Africa/Kampala');
  v_to timestamptz := ((v_day + 1)::timestamp at time zone 'Africa/Kampala');
  v_total int;
begin
  with plays as (
    select p.id as profile_id, p.role, d.recording_id, rec.title,
           coalesce(st.name, v.name, 'a venue') as station, d.venue_id is not null as at_venue
    from public.detections d
    join public.recordings rec on rec.id = d.recording_id
    left join public.stations st on st.id = d.station_id
    left join public.venues v on v.id = d.venue_id
    join public.profiles p on p.approved and (p.id = rec.artist_profile_id or p.org_id = rec.label_org_id)
    where d.detected_at >= v_from and d.detected_at < v_to
  ), by_station as (
    select profile_id, recording_id, title, station, count(*) as n
    from plays group by 1, 2, 3, 4
  ), by_song as (
    select profile_id, recording_id, title, sum(n) as n,
           string_agg(station || ' ' || n, ', ' order by n desc, station) as stations
    from by_station group by 1, 2, 3
  ), per_person as (
    select s.profile_id, sum(s.n)::int as plays,
           (select count(distinct station) from plays x where x.profile_id = s.profile_id and not x.at_venue) as stations,
           (select count(distinct station) from plays x where x.profile_id = s.profile_id and x.at_venue) as venues,
           string_agg('• ' || s.title || ' — ' || s.n || case when s.n = 1 then ' play (' else ' plays (' end || s.stations || ')',
                      E'\n' order by s.n desc, s.title) as lines
    from by_song s group by 1
  )
  insert into public.alert_outbox (profile_id, kind, title, body, link, dedupe_key)
  select pp.profile_id, 'daily',
         'Your airplay for ' || to_char(v_day, 'FMDy FMDD FMMon') || ': ' || pp.plays || case when pp.plays = 1 then ' play' else ' plays' end,
         'Yesterday your music was played ' || pp.plays || case when pp.plays = 1 then ' time' else ' times' end
           || ' on ' || concat_ws(' and ',
                nullif(pp.stations || case when pp.stations = 1 then ' station' else ' stations' end, '0 stations'),
                nullif(pp.venues || case when pp.venues = 1 then ' venue' else ' venues' end, '0 venues')) || '.'
           || E'\n\n' || left(pp.lines, 700),
         public.alert_link(pr.role),
         'daily:' || v_day
  from per_person pp
  join public.profiles pr on pr.id = pp.profile_id
  where public.alert_wanted(pp.profile_id, 'daily')
  on conflict (profile_id, dedupe_key) do nothing;
  get diagnostics v_total = row_count;
  return v_total;
end $$;

-- Delivery is server-side only.
revoke execute on function public.enqueue_alerts(timestamptz, int) from public, anon, authenticated;
revoke execute on function public.enqueue_daily_alerts(date) from public, anon, authenticated;
grant execute on function public.enqueue_alerts(timestamptz, int) to service_role;
grant execute on function public.enqueue_daily_alerts(date) to service_role;
