-- ── Public coverage: how much of Uganda we actually listen to ─────────────
--
-- The marketing claim that matters against global services ("26 stations
-- across four regions, not two or three in Kampala") has to be answerable
-- without a login, and without exposing station names or stream URLs.
--
-- Counts only: how many stations per region, how many are monitored right now,
-- and when the worker last checked in.

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
      count(*) filter (where stream_status in ('starting', 'online', 'reconnecting')) as monitored,
      count(*) filter (where stream_status = 'online') as live
    from public.stations
    group by 1
  )
  select json_build_object(
    'stations',   (select count(*) from public.stations),
    'monitored',  (select count(*) from public.stations
                    where stream_status in ('starting', 'online', 'reconnecting')),
    'live',       (select count(*) from public.stations where stream_status = 'online'),
    'regions',    (select coalesce(json_agg(json_build_object(
                     'region', region, 'stations', stations,
                     'monitored', monitored, 'live', live
                   ) order by region), '[]'::json) from per_region),
    'last_heartbeat', (select max(last_heartbeat) from public.stations),
    'last_detection', (select max(detected_at) from public.detections)
  );
$$;

revoke all on function public.public_coverage() from public;
grant execute on function public.public_coverage() to anon, authenticated;
