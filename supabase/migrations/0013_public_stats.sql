-- Public, aggregate-only numbers for the website (no rows, no names, no audio).
-- Security definer so anonymous visitors can read the counts without seeing any table.
create or replace function public.public_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'stations_live',  (select count(*) from stations where stream_status = 'online' and last_heartbeat > now() - interval '15 minutes'),
    'stations_total', (select count(*) from stations where stream_status is distinct from 'disabled'),
    'songs',          (select count(*) from recordings where enrolled_at is not null),
    'plays_7d',       (select count(*) from detections where detected_at > now() - interval '7 days'),
    'clips_24h',      (select count(*) from unmatched_clips where heard_at > now() - interval '24 hours'),
    'as_of',          now()
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
