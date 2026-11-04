-- Demo data for a STAGING project. Run in the SQL editor AFTER these five
-- accounts have signed up through the app (each with its matching use case):
--   cmo@demo.eastsound.ug          CMO / Auditor   (then set profiles.approved = true)
--   label@demo.eastsound.ug        Record Label
--   artist@demo.eastsound.ug       Independent Artist
--   broadcaster@demo.eastsound.ug  Broadcaster
--   venue@demo.eastsound.ug        Venue Operator
-- A second label/broadcaster/venue ("rival") is created to prove isolation.
-- All names are fictional. Safe to re-run: it deletes its own rows first.

do $$
declare
  u_label uuid := (select id from auth.users where email = 'label@demo.eastsound.ug');
  u_artist uuid := (select id from auth.users where email = 'artist@demo.eastsound.ug');
  u_bc uuid := (select id from auth.users where email = 'broadcaster@demo.eastsound.ug');
  u_venue uuid := (select id from auth.users where email = 'venue@demo.eastsound.ug');
  o_label uuid; o_bc uuid; o_venue uuid; o_rival_label uuid; o_rival_bc uuid;
  st_home uuid; st_rival uuid; st_west uuid; st_north uuid;
  v_home uuid; n1 uuid; n2 uuid;
  a1 uuid; a2 uuid; a3 uuid;
  r record; i int; t timestamptz; rec_ids uuid[]; stations uuid[];
begin
  if u_label is null or u_artist is null or u_bc is null or u_venue is null then
    raise exception 'Sign up the demo accounts first (see header).';
  end if;
  select org_id into o_label from public.profiles where id = u_label;
  select org_id into o_bc from public.profiles where id = u_bc;
  select org_id into o_venue from public.profiles where id = u_venue;

  -- clean previous demo rows
  delete from public.detections where station_id in (select id from public.stations where slug like 'demo-%')
    or venue_id in (select id from public.venues where venue_org_id = o_venue or name = 'Rival Lounge (demo)')
    or recording_id in (select id from public.recordings where isrc like 'UG-DEM-%' or title like '% (demo)');
  delete from public.ad_spots where station_id in (select id from public.stations where slug like 'demo-%');
  delete from public.ad_bookings where station_id in (select id from public.stations where slug like 'demo-%');
  delete from public.unmatched_clips where station_id in (select id from public.stations where slug like 'demo-%');
  delete from public.disputes where recording_id in (select id from public.recordings where isrc like 'UG-DEM-%');
  delete from public.split_shares where recording_id in (select id from public.recordings where isrc like 'UG-DEM-%');
  delete from public.recordings where isrc like 'UG-DEM-%' or (isrc is null and title like '% (demo)');
  delete from public.artists where label_org_id = o_label;
  delete from public.royalty_statements where org_id = o_label or profile_id = u_artist;
  delete from public.dj_sets where venue_id in (select id from public.venues where venue_org_id = o_venue);
  delete from public.venue_nodes where venue_id in (select id from public.venues where venue_org_id = o_venue);
  delete from public.venues where venue_org_id = o_venue or name = 'Rival Lounge (demo)';
  delete from public.stations where slug like 'demo-%';
  delete from public.organizations where name in ('Rival Records (demo)', 'Rival Radio (demo)', 'Rival Venues (demo)');

  insert into public.organizations (name, kind) values ('Rival Records (demo)', 'label') returning id into o_rival_label;
  insert into public.organizations (name, kind) values ('Rival Radio (demo)', 'broadcaster') returning id into o_rival_bc;

  -- stations: one owned by the demo broadcaster, others monitored/rival
  insert into public.stations (slug, name, frequency, region, broadcaster_org_id, stream_status, last_heartbeat)
    values ('demo-home-fm', 'Home FM (demo)', '91.3', 'Central', o_bc, 'online', now()) returning id into st_home;
  insert into public.stations (slug, name, frequency, region, broadcaster_org_id, stream_status, last_heartbeat)
    values ('demo-rival-fm', 'Rival FM (demo)', '88.8', 'Central', o_rival_bc, 'online', now()) returning id into st_rival;
  insert into public.stations (slug, name, frequency, region, stream_status, last_heartbeat)
    values ('demo-west-fm', 'West FM (demo)', '95.4', 'Western', 'online', now()) returning id into st_west;
  insert into public.stations (slug, name, frequency, region, stream_status, last_heartbeat)
    values ('demo-north-fm', 'North FM (demo)', '97.0', 'Northern', 'reconnecting', now() - interval '3 minutes') returning id into st_north;
  stations := array[st_home, st_rival, st_west, st_north];

  -- label roster + catalogue
  insert into public.artists (label_org_id, name, genre) values (o_label, 'Nalu Akello', 'Afrobeat') returning id into a1;
  insert into public.artists (label_org_id, name, genre) values (o_label, 'Kato Soul', 'R&B') returning id into a2;
  insert into public.artists (label_org_id, name, genre) values (o_label, 'Zawadi B', 'Dancehall') returning id into a3;

  insert into public.recordings (title, artist_name, artist_id, isrc, upc, label_org_id, release_date, composer, publisher, duration_sec, fingerprint) values
    ('Kampala Nights', 'Nalu Akello', a1, 'UG-DEM-26-00011', '196589000117', o_label, '2026-03-14', 'N. Akello', 'Demo Publishing', 214, 'fp'),
    ('Lake Breeze', 'Nalu Akello', a1, 'UG-DEM-26-00012', '196589000117', o_label, '2026-03-14', 'N. Akello', 'Demo Publishing', 188, 'fp'),
    ('Masaka Groove', 'Kato Soul', a2, 'UG-DEM-26-00020', '196589000209', o_label, '2026-06-02', 'K. Ssali', 'Demo Publishing', 201, 'fp'),
    ('Boda Love (demo)', 'Zawadi B', a3, null, null, o_label, '2026-11-20', 'Z. Birungi', 'Demo Publishing', 196, null);
  insert into public.recordings (title, artist_name, isrc, artist_profile_id, release_date, composer, duration_sec, fingerprint) values
    ('Gulu Gold', 'Lamaro Grace', 'UG-DEM-26-00401', u_artist, '2026-05-01', 'G. Lamaro', 199, 'fp'),
    ('Rwenzori Rain', 'Lamaro Grace', 'UG-DEM-25-00377', u_artist, '2025-09-12', 'G. Lamaro', 224, 'fp');
  insert into public.recordings (title, artist_name, isrc, label_org_id, release_date, duration_sec, fingerprint) values
    ('Rival Anthem', 'Rival Star', 'UG-DEM-26-00900', o_rival_label, '2026-02-01', 180, 'fp'),
    ('Nile Fever', 'Okello Prime', 'UG-DEM-26-00102', o_rival_label, '2026-04-04', 205, 'fp');

  select array_agg(id order by title) into rec_ids from public.recordings where isrc like 'UG-DEM-%';

  -- 14 days of detections, weighted by recording and time of day
  for i in 1..1400 loop
    t := now() - (random() * interval '14 days');
    insert into public.detections (recording_id, station_id, detected_at, ended_at, duration_sec, confidence, match_score, matched_title, source)
    select rid, stations[1 + floor(random() * 4)::int], t, t + interval '200 seconds', 200, 90 + random() * 9.9, 40 + floor(random() * 80)::int, null, 'stream'
    from (select rec_ids[1 + floor(power(random(), 1.6) * array_length(rec_ids, 1))::int] as rid) x;
  end loop;
  update public.detections d set matched_title = rec.title from public.recordings rec where rec.id = d.recording_id and d.matched_title is null;

  -- ads on the demo broadcaster's station
  insert into public.ad_bookings (station_id, advertiser, spot, daypart, booked, period_start, period_end) values
    (st_home, 'Telecom Co.', 'Data bundle 30s', '06:00–10:00', 24, date_trunc('week', now())::date, (date_trunc('week', now()) + interval '6 days')::date),
    (st_home, 'Beverage Ltd', 'Weekend promo 45s', '16:00–20:00', 18, date_trunc('week', now())::date, (date_trunc('week', now()) + interval '6 days')::date),
    (st_home, 'CleanHome', 'Detergent 15s', '10:00–14:00', 30, date_trunc('week', now())::date, (date_trunc('week', now()) + interval '6 days')::date);
  for r in select id, booked from public.ad_bookings where station_id = st_home loop
    for i in 1..greatest(1, r.booked - floor(random() * 6)::int) loop
      insert into public.ad_spots (station_id, booking_id, aired_at, duration_sec)
      values (st_home, r.id, date_trunc('week', now()) + random() * (now() - date_trunc('week', now())), 30);
    end loop;
  end loop;
  insert into public.ad_spots (station_id, aired_at, duration_sec) values (st_rival, now() - interval '1 hour', 30);

  -- splits, disputes, unmatched
  insert into public.split_shares (recording_id, party_name, party_profile_id, share_pct)
    select id, 'Lamaro Grace (writer/performer)', u_artist, 60 from public.recordings where isrc = 'UG-DEM-26-00401'
    union all select id, 'Producer — Beats by Opio', null, 25 from public.recordings where isrc = 'UG-DEM-26-00401'
    union all select id, 'Co-writer — A. Nakato', null, 15 from public.recordings where isrc = 'UG-DEM-26-00401'
    union all select id, 'Demo Publishing', null, 50 from public.recordings where isrc = 'UG-DEM-26-00011'
    union all select id, 'Nalu Akello', null, 50 from public.recordings where isrc = 'UG-DEM-26-00011';
  insert into public.disputes (recording_id, claimant_a, claimant_b, share_a, share_b, status)
    select id, o_rival_label, o_label, 100, 60, 'open' from public.recordings where isrc = 'UG-DEM-26-00102'
    union all select id, o_label, o_rival_label, 70, 50, 'open' from public.recordings where isrc = 'UG-DEM-26-00020';
  for i in 1..6 loop
    insert into public.unmatched_clips (station_id, heard_at, evidence_path, rms)
    values (stations[1 + (i % 4)], now() - (i * interval '3 hours'), 'unmatched/demo/' || i || '.mp3', 0.05);
  end loop;

  -- venue
  insert into public.venues (venue_org_id, name, uprs_licence, licence_expires)
    values (o_venue, 'Kololo Lounge (demo)', 'UPRS-PP-2026-1132', '2027-03-31') returning id into v_home;
  insert into public.venue_nodes (venue_id, code, location, kind, last_heartbeat) values
    (v_home, 'N-K01', 'Main floor', 'Club', now() - interval '12 seconds') returning id into n1;
  insert into public.venue_nodes (venue_id, code, location, kind, last_heartbeat) values
    (v_home, 'N-K02', 'Rooftop', 'Rooftop', now() - interval '3 hours') returning id into n2;
  insert into public.venues (venue_org_id, name) values (o_rival_bc, 'Rival Lounge (demo)');
  for i in 1..40 loop
    t := now() - (random() * interval '20 hours');
    insert into public.detections (recording_id, venue_id, node_id, detected_at, duration_sec, confidence, source)
    values (rec_ids[1 + floor(random() * array_length(rec_ids, 1))::int], v_home, case when i % 3 = 0 then n2 else n1 end, t, 190, 95, 'venue');
  end loop;
  insert into public.dj_sets (venue_id, dj, starts_at, ends_at) values
    (v_home, 'DJ Wakiso', now() - interval '3 days 2 hours', now() - interval '2 days 22 hours'),
    (v_home, 'Selector Amani', now() - interval '1 day 3 hours', now() - interval '1 day');

  -- royalties
  for i in 0..5 loop
    insert into public.royalty_statements (org_id, period, amount_ugx, status)
      values (o_label, (date_trunc('month', now()) - make_interval(months => i))::date, 8000000 + floor(random() * 6000000)::bigint, case when i = 0 then 'estimated' else 'paid' end);
    insert into public.royalty_statements (profile_id, period, amount_ugx, status)
      values (u_artist, (date_trunc('month', now()) - make_interval(months => i))::date, 200000 + floor(random() * 400000)::bigint, case when i = 0 then 'estimated' else 'paid' end);
  end loop;
end $$;
