-- Airplay insights for rights holders, and shareable proof-of-play links.
--
-- 1. artist_airplay_insights(days): for the songs the caller owns (artist or
--    label, via owns_recording), which stations play them, which monitored
--    stations do not, what hours they are played, and the latest plays with
--    their evidence clip. Station names are returned only in that context;
--    the stations table itself stays closed to artists and labels.
-- 2. share_detection / unshare_detection: an owner can publish one play as a
--    link (/proof/<token>). proof_by_token returns that one play to anyone with
--    the token, and storage lets anyone read that one clip — nothing else.

alter table public.detections add column if not exists share_token text;
create unique index if not exists detections_share_token_key on public.detections (share_token) where share_token is not null;

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
        from (select m.id, r.title, s.name as station, s.frequency, m.detected_at, m.duration_sec,
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

create or replace function public.share_detection(p_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec uuid;
  v_token text;
begin
  select recording_id, share_token into v_rec, v_token from detections where id = p_id;
  if v_rec is null or not owns_recording(v_rec) then
    raise exception 'You can only share plays of your own songs.' using errcode = '42501';
  end if;
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '');
    update detections set share_token = v_token where id = p_id;
  end if;
  return v_token;
end;
$$;
revoke all on function public.share_detection(bigint) from public, anon;
grant execute on function public.share_detection(bigint) to authenticated;

create or replace function public.unshare_detection(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec uuid;
begin
  select recording_id into v_rec from detections where id = p_id;
  if v_rec is null or not owns_recording(v_rec) then
    raise exception 'You can only change plays of your own songs.' using errcode = '42501';
  end if;
  update detections set share_token = null where id = p_id;
end;
$$;
revoke all on function public.unshare_detection(bigint) from public, anon;
grant execute on function public.unshare_detection(bigint) to authenticated;

-- One shared play, for the public proof page. Tokens are 32 hex characters.
create or replace function public.proof_by_token(p_token text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'title', r.title, 'artist', r.artist_name, 'featuring', r.featuring, 'isrc', r.isrc,
    'station', s.name, 'frequency', s.frequency, 'region', s.region,
    'detected_at', d.detected_at, 'duration_sec', d.duration_sec, 'confidence', d.confidence,
    'evidence_path', d.evidence_path)
    from detections d
    join recordings r on r.id = d.recording_id
    left join stations s on s.id = d.station_id
   where p_token ~ '^[0-9a-f]{32}$'
     and d.share_token = p_token
$$;
revoke all on function public.proof_by_token(text) from public;
grant execute on function public.proof_by_token(text) to anon, authenticated;

create or replace function public.is_shared_evidence(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from detections where evidence_path = p_name and share_token is not null)
$$;
revoke all on function public.is_shared_evidence(text) from public;
grant execute on function public.is_shared_evidence(text) to anon, authenticated;

drop policy if exists evidence_shared_read on storage.objects;
create policy evidence_shared_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'evidence' and public.is_shared_evidence(name));
