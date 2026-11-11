-- Which build is running?

alter table public.stations add column if not exists worker_build text;

comment on column public.stations.worker_build is
  'Commit the ingest worker was built from (Railway injects the SHA) at its last heartbeat. Answers "did my deploy actually land?" without opening the logs.';

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
    'stream_errors',  (select count(*) from public.stations
                        where stream_error is not null
                          and coalesce(stream_status, '') <> 'online'),
    'sample_error',   (select left(regexp_replace(stream_error, 'https?://\S+', '<stream>', 'gi'), 200)
                        from public.stations
                        where stream_error is not null
                        order by stream_error_at desc nulls last
                        limit 1),
    'worker_build',   (select worker_build from public.stations
                        where worker_build is not null
                        order by last_heartbeat desc nulls last
                        limit 1),
    'last_heartbeat', (select max(last_heartbeat) from public.stations),
    'last_detection', (select max(detected_at) from public.detections)
  );
$$;

revoke all on function public.public_ingest_health() from public;
grant execute on function public.public_ingest_health() to anon, authenticated;
