-- ── Panel size in the public stats ─────────────────────────────────────────
--
-- public_platform_stats() is deliberately strict about "monitoring": a station
-- only counts as live if its worker heartbeat is under ten minutes old (0009).
-- That is the right rule, but it left the header reading "0 Stations Monitored
-- Live" whenever the worker was between runs — true, and useless to a visitor
-- deciding whether to sign up.
--
-- So the same call now also reports two build-out facts that hold whether or
-- not a worker is running: how many stations are in the panel, and how many
-- have a stream URL we can read. The header shows the live figure when it
-- exists and the panel figure when it does not. Nothing here claims a play has
-- been heard; detections_24h still answers that, and it is still zero.

drop function if exists public.public_platform_stats();

create function public.public_platform_stats()
returns table (
  streams_online bigint,
  venues bigint,
  detections_24h bigint,
  panel_stations bigint,
  stream_ready bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.stations
           where stream_status = 'online'
             and last_heartbeat > now() - interval '10 minutes'),
         (select count(*) from public.venues),
         (select count(*) from public.detections
           where detected_at >= now() - interval '24 hours'),
         (select count(*) from public.stations
           where coalesce(stream_status, '') <> 'disabled'),
         (select count(*) from public.stations
           where coalesce(stream_status, '') <> 'disabled'
             and nullif(btrim(coalesce(stream_url, '')), '') is not null)
$$;

revoke execute on function public.public_platform_stats() from public;
grant execute on function public.public_platform_stats() to anon, authenticated;

-- The readiness board made the same mistake in a different place: it read
-- `monitored` (a settable status column) and reported "25 streaming" while no
-- worker was running. Expose the stream-URL count so the board can describe
-- the panel without implying anyone is listening.
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
    'stream_ready',   (select count(*) from public.stations
                        where nullif(btrim(coalesce(stream_url, '')), '') is not null),
    'last_heartbeat', (select max(last_heartbeat) from public.stations),
    'last_detection', (select max(detected_at) from public.detections)
  );
$$;

revoke all on function public.public_ingest_health() from public;
grant execute on function public.public_ingest_health() to anon, authenticated;
