-- Recent plays in artist_airplay_insights carry the artist name, so a label can
-- see which roster artist each play belongs to. Same function otherwise.

create or replace function public.artist_airplay_insights(p_days integer default 30)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select d.id, d.station_id, d.detected_at, d.duration_sec, d.confidence, d.evidence_path, d.share_token, d.recording_id
      from detections d
     where d.recording_id is not null
       and d.detected_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
       and owns_recording(d.recording_id)
  )
  select json_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'plays', (select count(*) from mine),
    'stations_playing', (select count(distinct station_id) from mine),
    'stations_monitored', (select count(*) from stations where stream_status = 'online'),
    'by_station', coalesce((
      select json_agg(x order by x.plays desc, x.name)
        from (select s.name, s.region, count(*) as plays, max(m.detected_at) as last_play
                from mine m join stations s on s.id = m.station_id
               group by s.id, s.name, s.region) x), '[]'::json),
    'not_playing', coalesce((
      select json_agg(json_build_object('name', s.name, 'region', coalesce(s.region, 'Other')) order by s.region, s.name)
        from stations s
       where s.stream_status = 'online'
         and not exists (select 1 from mine m where m.station_id = s.id)), '[]'::json),
    'by_hour', (
      select json_agg(coalesce(z.c, 0) order by h)
        from generate_series(0, 23) h
        left join (select extract(hour from detected_at at time zone 'Africa/Kampala')::int as hr, count(*) as c
                     from mine group by 1) z on z.hr = h),
    'by_weekday', (
      select json_agg(coalesce(z.c, 0) order by dow)
        from generate_series(1, 7) dow
        left join (select extract(isodow from detected_at at time zone 'Africa/Kampala')::int as d, count(*) as c
                     from mine group by 1) z on z.d = dow),
    'recent', coalesce((
      select json_agg(x order by x.detected_at desc)
        from (select m.id, r.title, r.artist_name as artist, s.name as station, s.frequency, m.detected_at, m.duration_sec,
                     m.evidence_path, m.share_token
                from mine m
                join recordings r on r.id = m.recording_id
                left join stations s on s.id = m.station_id
               order by m.detected_at desc
               limit 20) x), '[]'::json)
  );
$$;
revoke all on function public.artist_airplay_insights(integer) from public, anon;
grant execute on function public.artist_airplay_insights(integer) to authenticated;
