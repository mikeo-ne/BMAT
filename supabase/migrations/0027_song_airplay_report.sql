-- Per-song airplay report for rights holders, keyed by ISRC/UPC so a distributor
-- or label can match it to their own catalogue. Owner-scoped like
-- artist_airplay_insights: only songs the caller owns (owns_recording).

create or replace function public.song_airplay_report(p_days integer default 30)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with span as (select greatest(1, least(coalesce(p_days, 30), 365)) as days),
  mine as (
    select r.id, r.title, r.artist_name, r.featuring, r.isrc, r.upc
      from recordings r
     where owns_recording(r.id)
  ),
  plays as (
    select d.recording_id, d.station_id, d.detected_at, d.share_token
      from detections d, span
     where d.recording_id in (select id from mine)
       and d.detected_at > now() - make_interval(days => span.days)
  )
  select json_build_object(
    'days', (select days from span),
    'songs', coalesce((
      select json_agg(x order by x.plays desc, x.title)
        from (
          select m.id, m.title, m.artist_name as artist, m.featuring, m.isrc, m.upc,
                 count(p.station_id) as plays,
                 count(distinct p.station_id) as stations,
                 min(p.detected_at) as first_play,
                 max(p.detected_at) as last_play,
                 coalesce((select json_agg(distinct s.region) from plays p2 join stations s on s.id = p2.station_id
                            where p2.recording_id = m.id and s.region is not null), '[]'::json) as regions,
                 coalesce((select json_agg(t) from (
                            select s.name, count(*) as plays
                              from plays p3 join stations s on s.id = p3.station_id
                             where p3.recording_id = m.id
                             group by s.name order by count(*) desc, s.name limit 3) t), '[]'::json) as top_stations,
                 (select p4.share_token from plays p4 where p4.recording_id = m.id and p4.share_token is not null
                   order by p4.detected_at desc limit 1) as proof_token
            from mine m
            left join plays p on p.recording_id = m.id
           group by m.id, m.title, m.artist_name, m.featuring, m.isrc, m.upc) x), '[]'::json)
  );
$$;
revoke all on function public.song_airplay_report(integer) from public, anon;
grant execute on function public.song_airplay_report(integer) to authenticated;
