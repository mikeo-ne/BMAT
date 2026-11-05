-- Public ingest health: counts and timestamps only, for /setup and /api/health.
--
-- Those pages run with the anon key, and row-level security (correctly) hides
-- every station and detection from an anonymous caller — so without this the
-- readiness board always reported "no stations" and "no detections" on a
-- perfectly healthy deployment. This function answers the two questions the
-- board needs and nothing more: no names, no stream URLs, no rows.

create or replace function public.public_ingest_health()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'stations',       (select count(*) from public.stations),
    'monitored',      (select count(*) from public.stations
                        where stream_status in ('starting', 'online', 'reconnecting')),
    'last_heartbeat', (select max(last_heartbeat) from public.stations),
    'last_detection', (select max(detected_at) from public.detections)
  );
$$;

revoke all on function public.public_ingest_health() from public;
grant execute on function public.public_ingest_health() to anon, authenticated;
