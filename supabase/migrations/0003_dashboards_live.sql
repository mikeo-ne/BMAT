-- Everything the five dashboards need to run on live data.
-- Aggregate functions are SECURITY INVOKER (the default): they run under the
-- caller's RLS, so a label's "top tracks" can only ever count the label's rows.
-- The two public_* functions are SECURITY DEFINER but return only
-- non-sensitive aggregates (title, artist, spin counts) — never evidence.

-- ── Catalogue detail ───────────────────────────────────────────────────────
alter table public.recordings
  add column if not exists artist_name text,
  add column if not exists release_date date,
  add column if not exists composer text,
  add column if not exists publisher text,
  add column if not exists duration_sec int;

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  label_org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  genre text,
  created_at timestamptz not null default now()
);
alter table public.recordings add column if not exists artist_id uuid references public.artists (id);
alter table public.artists enable row level security;
create policy artists_read on public.artists for select
  using (public.my_role() = 'cmo' or (public.my_role() = 'label' and label_org_id = public.my_org()));
create policy artists_label_write on public.artists for insert
  with check (public.my_role() = 'label' and label_org_id = public.my_org());
create policy artists_label_update on public.artists for update
  using (public.my_role() = 'label' and label_org_id = public.my_org())
  with check (label_org_id = public.my_org());
create policy artists_label_delete on public.artists for delete
  using (public.my_role() = 'label' and label_org_id = public.my_org());

-- Labels may fix their own ISRC/UPC, but can never move a recording to another org.
drop policy if exists recordings_update_label on public.recordings;
create policy recordings_update_label on public.recordings for update
  using (public.my_role() = 'label' and label_org_id = public.my_org())
  with check (label_org_id = public.my_org());

-- ── Disputes: more context, staff-auditable resolution ─────────────────────
alter table public.disputes
  add column if not exists share_a numeric(5, 2),
  add column if not exists share_b numeric(5, 2),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles (id);
alter table public.disputes drop constraint if exists disputes_status_check;
alter table public.disputes add constraint disputes_status_check
  check (status in ('open', 'resolved_a', 'resolved_b', 'resolved_split', 'escalated'));

-- ── Broadcaster: ad bookings + aired spots ─────────────────────────────────
create table if not exists public.ad_bookings (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations (id) on delete cascade,
  advertiser text not null,
  spot text not null,
  daypart text,
  booked int not null check (booked >= 0),
  period_start date not null,
  period_end date not null,
  check (period_end >= period_start)
);
create table if not exists public.ad_spots (
  id bigint generated always as identity primary key,
  station_id uuid not null references public.stations (id) on delete cascade,
  booking_id uuid references public.ad_bookings (id) on delete set null,
  aired_at timestamptz not null,
  duration_sec int not null check (duration_sec > 0)
);
create index if not exists ad_spots_station_time on public.ad_spots (station_id, aired_at desc);
alter table public.ad_bookings enable row level security;
alter table public.ad_spots enable row level security;
create policy ad_bookings_read on public.ad_bookings for select using (
  public.my_role() = 'cmo' or exists (select 1 from public.stations s where s.id = station_id
    and public.my_role() = 'broadcaster' and s.broadcaster_org_id = public.my_org()));
create policy ad_spots_read on public.ad_spots for select using (
  public.my_role() = 'cmo' or exists (select 1 from public.stations s where s.id = station_id
    and public.my_role() = 'broadcaster' and s.broadcaster_org_id = public.my_org()));

-- ── Venue: listener nodes + DJ sets ────────────────────────────────────────
create table if not exists public.venue_nodes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  code text not null,
  location text not null,
  kind text check (kind in ('Bar', 'Club', 'Lounge', 'Rooftop', 'Other')),
  last_heartbeat timestamptz,
  unique (venue_id, code)
);
alter table public.detections add column if not exists node_id uuid references public.venue_nodes (id);
create table if not exists public.dj_sets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  dj text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
alter table public.venue_nodes enable row level security;
alter table public.dj_sets enable row level security;
create policy venue_nodes_read on public.venue_nodes for select using (
  public.my_role() = 'cmo' or exists (select 1 from public.venues v where v.id = venue_id
    and public.my_role() = 'venue' and v.venue_org_id = public.my_org()));
create policy dj_sets_read on public.dj_sets for select using (
  public.my_role() = 'cmo' or exists (select 1 from public.venues v where v.id = venue_id
    and public.my_role() = 'venue' and v.venue_org_id = public.my_org()));
create policy dj_sets_venue_write on public.dj_sets for insert with check (
  exists (select 1 from public.venues v where v.id = venue_id
    and public.my_role() = 'venue' and v.venue_org_id = public.my_org()));

-- ── Royalty statements (labels & artists) ──────────────────────────────────
create table if not exists public.royalty_statements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id),
  profile_id uuid references public.profiles (id),
  period date not null, -- first day of the month
  amount_ugx bigint not null check (amount_ugx >= 0),
  status text not null default 'estimated' check (status in ('estimated', 'final', 'paid')),
  check (num_nonnulls(org_id, profile_id) = 1)
);
alter table public.royalty_statements enable row level security;
create policy royalties_read on public.royalty_statements for select using (
  public.my_role() = 'cmo' or org_id = public.my_org() or profile_id = auth.uid());

-- ── Evidence clips: readable exactly when the detection is readable ────────
-- The subquery runs under the caller's RLS on detections/unmatched_clips.
drop policy if exists evidence_cmo_read on storage.objects;
create policy evidence_read on storage.objects for select using (
  bucket_id = 'evidence' and (
    exists (select 1 from public.detections d where d.evidence_path = name)
    or exists (select 1 from public.unmatched_clips u where u.evidence_path = name)
  ));

-- ── Aggregates (SECURITY INVOKER → caller's RLS applies) ───────────────────
create or replace function public.recording_spins(p_days int default 30)
returns table (recording_id uuid, spins bigint, last_7 bigint, prev_7 bigint, stations bigint)
language sql stable set search_path = public as $$
  select d.recording_id,
         count(*) filter (where d.detected_at >= now() - make_interval(days => p_days)),
         count(*) filter (where d.detected_at >= now() - interval '7 days'),
         count(*) filter (where d.detected_at >= now() - interval '14 days' and d.detected_at < now() - interval '7 days'),
         count(distinct d.station_id) filter (where d.detected_at >= now() - make_interval(days => p_days))
  from public.detections d
  where d.recording_id is not null and d.detected_at >= now() - make_interval(days => greatest(p_days, 14))
  group by d.recording_id
$$;

create or replace function public.daily_spins(p_recording uuid, p_days int default 14)
returns table (day date, spins bigint)
language sql stable set search_path = public as $$
  select g.day::date, count(d.id)
  from generate_series((now() at time zone 'Africa/Kampala')::date - (p_days - 1), (now() at time zone 'Africa/Kampala')::date, interval '1 day') g(day)
  left join public.detections d
    on d.recording_id = p_recording and (d.detected_at at time zone 'Africa/Kampala')::date = g.day::date
  group by g.day order by g.day
$$;

create or replace function public.top_chart(p_days int default 7, p_region text default null, p_limit int default 100)
returns table (rank bigint, recording_id uuid, title text, artist text, owner text, spins bigint, stations bigint)
language sql stable set search_path = public as $$
  select row_number() over (order by count(*) desc, r.title), r.id, r.title, r.artist_name, o.name,
         count(*), count(distinct d.station_id)
  from public.detections d
  join public.recordings r on r.id = d.recording_id
  left join public.organizations o on o.id = r.label_org_id
  left join public.stations s on s.id = d.station_id
  where d.detected_at >= now() - make_interval(days => p_days)
    and (p_region is null or s.region = p_region)
  group by r.id, r.title, r.artist_name, o.name
  order by count(*) desc, r.title
  limit least(greatest(p_limit, 1), 500)
$$;

create or replace function public.detection_heatmap(p_days int default 7)
returns table (region text, dow int, block int, detections bigint)
language sql stable set search_path = public as $$
  select s.region,
         extract(isodow from d.detected_at at time zone 'Africa/Kampala')::int,
         (extract(hour from d.detected_at at time zone 'Africa/Kampala')::int / 4),
         count(*)
  from public.detections d join public.stations s on s.id = d.station_id
  where d.detected_at >= now() - make_interval(days => p_days) and s.region is not null
  group by 1, 2, 3
$$;

-- ── Public site (SECURITY DEFINER, aggregates only) ────────────────────────
create or replace function public.public_top_chart(p_region text default null, p_days int default 7)
returns table (rank bigint, title text, artist text, spins bigint)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by count(*) desc, r.title), r.title, r.artist_name, count(*)
  from public.detections d
  join public.recordings r on r.id = d.recording_id
  left join public.stations s on s.id = d.station_id
  where d.detected_at >= now() - make_interval(days => least(greatest(p_days, 1), 31))
    and (p_region is null or s.region = p_region)
  group by r.id, r.title, r.artist_name
  order by count(*) desc, r.title
  limit 10
$$;

create or replace function public.public_platform_stats()
returns table (streams_online bigint, venues bigint, detections_24h bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.stations where stream_status = 'online'),
         (select count(*) from public.venues),
         (select count(*) from public.detections where detected_at >= now() - interval '24 hours')
$$;

revoke execute on function public.public_top_chart(text, int) from public;
revoke execute on function public.public_platform_stats() from public;
grant execute on function public.public_top_chart(text, int) to anon, authenticated;
grant execute on function public.public_platform_stats() to anon, authenticated;

-- Artists see the whole split sheet of recordings they own (not just their own line).
drop policy if exists splits_read on public.split_shares;
create policy splits_read on public.split_shares for select using (
  public.my_role() = 'cmo'
  or party_profile_id = auth.uid()
  or exists (select 1 from public.recordings r where r.id = recording_id and (
       (public.my_role() = 'label' and r.label_org_id = public.my_org())
    or (public.my_role() = 'artist' and r.artist_profile_id = auth.uid())))
);

-- The ingest worker reports 'failed' for a stream it can't read at all.
alter table public.stations drop constraint if exists stations_stream_status_check;
alter table public.stations add constraint stations_stream_status_check
  check (stream_status in ('starting', 'online', 'reconnecting', 'no_stream_url', 'failed', 'disabled'));
