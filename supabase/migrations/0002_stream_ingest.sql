-- Stream-ingest support: monitored stations, richer detections, unmatched queue,
-- private evidence bucket. The ingest worker writes with the service-role key
-- (bypasses RLS); dashboards read through the RLS policies below.

-- Stations can now be monitored before the broadcaster signs up as a client.
alter table public.stations alter column broadcaster_org_id drop not null;
alter table public.stations
  add column if not exists slug text unique,
  add column if not exists stream_url text,
  add column if not exists stream_status text check (stream_status in ('starting', 'online', 'reconnecting', 'no_stream_url', 'disabled')),
  add column if not exists now_playing text,
  add column if not exists last_heartbeat timestamptz;

alter table public.detections
  add column if not exists ended_at timestamptz,
  add column if not exists match_score int,
  add column if not exists track_offset_sec numeric(8, 1),
  add column if not exists matched_title text,
  add column if not exists matched_artist text,
  add column if not exists source text not null default 'stream' check (source in ('stream', 'fm', 'venue', 'manual'));

-- A play can't end before it starts; detections are append-only facts.
alter table public.detections add constraint detections_time_order check (ended_at is null or ended_at >= detected_at);
create index if not exists detections_detected_at on public.detections (detected_at desc);

create table if not exists public.unmatched_clips (
  id bigint generated always as identity primary key,
  station_id uuid references public.stations (id),
  heard_at timestamptz not null,
  evidence_path text not null,
  rms numeric(5, 3),
  status text not null default 'open' check (status in ('open', 'matched', 'discarded')),
  matched_recording_id uuid references public.recordings (id),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz
);
alter table public.unmatched_clips enable row level security;

-- Unmatched audio is CMO-only (it may contain anyone's music).
create policy unmatched_cmo_read on public.unmatched_clips for select using (public.my_role() = 'cmo');
create policy unmatched_cmo_update on public.unmatched_clips for update using (public.my_role() = 'cmo');

-- Monitored stations with no broadcaster client yet are visible to CMO only
-- (covered by the existing stations_read policy, which requires a matching org).

-- Private bucket for 10-second evidence clips. Dashboards get short-lived signed
-- URLs from a server route; nobody reads the bucket directly except CMO.
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false)
on conflict (id) do nothing;

create policy evidence_cmo_read on storage.objects for select
  using (bucket_id = 'evidence' and public.my_role() = 'cmo');
