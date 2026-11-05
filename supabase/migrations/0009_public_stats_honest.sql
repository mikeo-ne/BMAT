-- Public numbers on the homepage must reflect reality.
--
-- public_platform_stats() counted any station whose last status was 'online',
-- so if the ingest worker stopped, the homepage would still claim those
-- stations were live. Count only stations that reported in the last 10 minutes.
create or replace function public.public_platform_stats()
returns table (streams_online bigint, venues bigint, detections_24h bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.stations
           where stream_status = 'online' and last_heartbeat > now() - interval '10 minutes'),
         (select count(*) from public.venues),
         (select count(*) from public.detections where detected_at >= now() - interval '24 hours')
$$;
revoke execute on function public.public_platform_stats() from public;
grant execute on function public.public_platform_stats() to anon, authenticated;

-- owns_master() is only used by storage policies for signed-in users; Supabase
-- grants new functions to anon by default, so take that back explicitly.
revoke execute on function public.owns_master(text) from anon;
