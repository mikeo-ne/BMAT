-- ── CMO distribution pack: per-station monthly report + monthly top works ──
--
-- UPRS (and any CMO) distributes money per station, per month. The numbers they
-- need are: how many plays each station generated, how many distinct works and
-- artists that represents, and how many of those plays carry an evidence clip.
--
-- Both functions are SECURITY INVOKER on purpose: whoever calls them sees only
-- the detections their RLS already allows. A CMO sees the whole panel; a label
-- sees its own catalogue; nobody sees more through the report than through the
-- dashboard. The feed endpoint uses the same rule.

create or replace function public.station_month_report(p_from date, p_to date)
returns table (
  station_id uuid,
  station text,
  region text,
  spins bigint,
  works bigint,
  artists bigint,
  with_evidence bigint,
  first_play timestamptz,
  last_play timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.region,
    count(d.id) as spins,
    count(distinct d.recording_id) as works,
    count(distinct r.artist_name) as artists,
    count(*) filter (where d.evidence_path is not null) as with_evidence,
    min(d.detected_at),
    max(d.detected_at)
  from public.detections d
  join public.stations s on s.id = d.station_id
  left join public.recordings r on r.id = d.recording_id
  where d.detected_at >= (p_from::timestamp at time zone 'Africa/Kampala')
    and d.detected_at <  ((p_to + 1)::timestamp at time zone 'Africa/Kampala')
  group by s.id, s.name, s.region
  order by count(d.id) desc, s.name
$$;

create or replace function public.month_top_works(p_from date, p_to date, p_limit int default 20)
returns table (rank bigint, title text, artist text, owner text, spins bigint, stations bigint)
language sql
stable
set search_path = public
as $$
  select row_number() over (order by count(*) desc, r.title),
         r.title,
         r.artist_name,
         o.name,
         count(*),
         count(distinct d.station_id)
  from public.detections d
  join public.recordings r on r.id = d.recording_id
  left join public.organizations o on o.id = r.label_org_id
  where d.detected_at >= (p_from::timestamp at time zone 'Africa/Kampala')
    and d.detected_at <  ((p_to + 1)::timestamp at time zone 'Africa/Kampala')
  group by r.id, r.title, r.artist_name, o.name
  order by count(*) desc, r.title
  limit least(greatest(p_limit, 1), 100)
$$;

revoke all on function public.station_month_report(date, date) from public;
revoke all on function public.month_top_works(date, date, int) from public;
grant execute on function public.station_month_report(date, date) to authenticated;
grant execute on function public.month_top_works(date, date, int) to authenticated;
