-- ── Why a station is not being recorded ────────────────────────────────────
--
-- On 11 November every one of the 25 streaming stations sat at `reconnecting`
-- while the worker heartbeated happily. The reason existed only in the Railway
-- log tail ("Connection refused", "Server returned 403 Forbidden", …), which is
-- exactly nowhere when you are holding a phone. A panel that says "reconnecting"
-- forever is indistinguishable from a panel that is working.
--
-- So the worker now writes the last thing ffmpeg said. It is diagnostic text,
-- not content: no audio, no URLs of subscriber streams, just the sentence that
-- explains the silence.

alter table public.stations add column if not exists stream_error text;
alter table public.stations add column if not exists stream_error_at timestamptz;

comment on column public.stations.stream_error is
  'Last capture error reported by the worker (ffmpeg stderr, trimmed). Null while monitoring is healthy.';

-- The readiness board should be able to say "26 stations are configured and
-- none can be read, and here is the sentence that explains why" in one call.
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
    'last_heartbeat', (select max(last_heartbeat) from public.stations),
    'last_detection', (select max(detected_at) from public.detections)
  );
$$;

revoke all on function public.public_ingest_health() from public;
grant execute on function public.public_ingest_health() to anon, authenticated;
