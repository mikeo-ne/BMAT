-- ── Reach & impressions: audience data is declared, never invented ─────────
--
-- Advertisers ask "how many people heard this?" and the honest answer needs a
-- per-station audience figure we did not make up. So the figure lives on the
-- station with its provenance attached: who supplied it and when it was
-- measured. No source, no number — the UI then shows "no audience data"
-- instead of a plausible fiction.
--
-- Methodology: docs/reach-methodology.md.
--   impressions ≈ Σ (plays × station AQH × clip duration / 15 min)
-- AQH = average quarter-hour listeners, the metric radio stations already sell
-- advertising against, so a station can supply it from its own survey or
-- agency rate card.

alter table public.stations
  add column if not exists aqh int check (aqh is null or aqh >= 0),
  add column if not exists audience_source text,
  add column if not exists audience_as_of date;

comment on column public.stations.aqh is
  'Average quarter-hour listeners, declared by the station or its agency. NULL = unknown, never estimated.';
comment on column public.stations.audience_source is
  'Who supplied the audience figure (survey name, agency, broadcaster document).';
comment on column public.stations.audience_as_of is
  'Date the audience figure was measured. Impressions are labelled as estimates of that date.';

-- The monthly report now carries kind and the audience figure, so the CMO pack
-- and the reach section use one query.
drop function if exists public.station_month_report(date, date);

create function public.station_month_report(p_from date, p_to date)
returns table (
  station_id uuid,
  station text,
  region text,
  kind text,
  spins bigint,
  works bigint,
  artists bigint,
  with_evidence bigint,
  first_play timestamptz,
  last_play timestamptz,
  aqh int,
  listen_seconds bigint
)
language sql
stable
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.region,
    s.kind,
    count(d.id) as spins,
    count(distinct d.recording_id) as works,
    count(distinct r.artist_name) as artists,
    count(*) filter (where d.evidence_path is not null) as with_evidence,
    min(d.detected_at),
    max(d.detected_at),
    max(s.aqh) as aqh,
    coalesce(sum(d.duration_sec), 0) as listen_seconds
  from public.detections d
  join public.stations s on s.id = d.station_id
  left join public.recordings r on r.id = d.recording_id
  where d.detected_at >= (p_from::timestamp at time zone 'Africa/Kampala')
    and d.detected_at <  ((p_to + 1)::timestamp at time zone 'Africa/Kampala')
  group by s.id, s.name, s.region, s.kind
  order by count(d.id) desc, s.name
$$;

revoke all on function public.station_month_report(date, date) from public;
grant execute on function public.station_month_report(date, date) to authenticated;
