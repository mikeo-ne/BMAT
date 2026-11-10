-- ── TV ingest: a station is now radio *or* television ─────────────────────
--
-- The monitor already pulls any stream ffmpeg can decode, so a TV channel is a
-- station row with `kind = 'tv'` and an HLS/RTMP URL. Keeping one table means
-- charts, evidence, alerts and the CMO pack work for TV without a second
-- pipeline — and the homepage can stop promising "TV next" once a channel is
-- actually in the panel.

alter table public.stations
  add column if not exists kind text not null default 'radio';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stations_kind_check') then
    alter table public.stations
      add constraint stations_kind_check check (kind in ('radio', 'tv'));
  end if;
end $$;

create index if not exists stations_kind on public.stations (kind);

-- TV plays are recorded with their own source so reports can separate them
-- from radio without guessing from the station name.
alter table public.detections drop constraint if exists detections_source_check;
alter table public.detections
  add constraint detections_source_check
  check (source in ('stream', 'fm', 'venue', 'manual', 'tv'));

-- Coverage now reports radio and TV separately: "28 stations, 25 reporting"
-- is less useful than "25 radio, 3 TV".
create or replace function public.public_coverage()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with per_region as (
    select
      coalesce(region, 'Unspecified') as region,
      count(*) as stations,
      count(*) filter (where kind = 'tv') as tv,
      count(*) filter (where stream_status in ('starting', 'online', 'reconnecting')) as monitored,
      count(*) filter (where stream_status = 'online') as live
    from public.stations
    group by 1
  )
  select json_build_object(
    'stations',   (select count(*) from public.stations),
    'radio',      (select count(*) from public.stations where kind = 'radio'),
    'tv',         (select count(*) from public.stations where kind = 'tv'),
    'monitored',  (select count(*) from public.stations
                    where stream_status in ('starting', 'online', 'reconnecting')),
    'live',       (select count(*) from public.stations where stream_status = 'online'),
    'regions',    (select coalesce(json_agg(json_build_object(
                     'region', region, 'stations', stations, 'tv', tv,
                     'monitored', monitored, 'live', live
                   ) order by region), '[]'::json) from per_region),
    'last_heartbeat', (select max(last_heartbeat) from public.stations),
    'last_detection', (select max(detected_at) from public.detections)
  );
$$;

revoke all on function public.public_coverage() from public;
grant execute on function public.public_coverage() to anon, authenticated;
