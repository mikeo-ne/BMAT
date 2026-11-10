-- ── Self-serve station onboarding ─────────────────────────────────────────
--
-- A broadcaster signing up had no way to say "this is my station" — the
-- dashboard just told them to ask East Sound. That is a dead end at the exact
-- moment someone is willing to work.
--
-- So a broadcaster can now submit a request: claim a station already in the
-- panel, or add a new one (with its stream URL). Approval stays with the CMO,
-- because linking an organisation to a station is a rights decision, not a
-- self-service toggle — and because a wrong link would expose someone else's
-- playout data.

create table if not exists public.station_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  station_id uuid references public.stations (id) on delete set null,
  name text,
  frequency text,
  region text,
  kind text not null default 'radio' check (kind in ('radio', 'tv')),
  stream_url text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  constraint station_request_target check (
    station_id is not null or (name is not null and length(btrim(name)) > 1)
  )
);

create index if not exists station_requests_status on public.station_requests (status, created_at desc);
create index if not exists station_requests_profile on public.station_requests (profile_id);

alter table public.station_requests enable row level security;

drop policy if exists station_requests_own_insert on public.station_requests;
create policy station_requests_own_insert on public.station_requests for insert
  with check (profile_id = auth.uid() and status = 'pending');

drop policy if exists station_requests_read on public.station_requests;
create policy station_requests_read on public.station_requests for select
  using (profile_id = auth.uid() or public.my_role() = 'cmo');

drop policy if exists station_requests_own_cancel on public.station_requests;
create policy station_requests_own_cancel on public.station_requests for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and status = 'cancelled');

-- Stations nobody has claimed yet. Name, region and frequency are public
-- information; a broadcaster cannot read the stations table directly, so this
-- SECURITY DEFINER function exposes exactly the fields needed to recognise
-- their own station — no stream URLs, no playout data.
create or replace function public.claimable_stations()
returns table (id uuid, name text, region text, frequency text, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.region, s.frequency, s.kind
  from public.stations s
  where s.broadcaster_org_id is null
    and coalesce(s.stream_status, '') <> 'disabled'
  order by s.name
  limit 500
$$;

revoke all on function public.claimable_stations() from public;
grant execute on function public.claimable_stations() to authenticated;

-- Approving links the station to the requesting organisation (or creates it),
-- then marks the request approved. Only a CMO can do this.
create or replace function public.approve_station_request(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.station_requests;
  new_id uuid;
  new_slug text;
begin
  if public.my_role() is distinct from 'cmo' then
    raise exception 'only a CMO can approve a station request';
  end if;

  select * into r from public.station_requests where id = p_id for update;
  if not found then
    raise exception 'station request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'station request is already %', r.status;
  end if;

  if r.station_id is not null then
    update public.stations
       set broadcaster_org_id = coalesce(r.org_id, broadcaster_org_id),
           stream_url = coalesce(nullif(btrim(r.stream_url), ''), stream_url)
     where id = r.station_id
     returning id into new_id;
    if new_id is null then
      raise exception 'the station no longer exists';
    end if;
  else
    new_slug := btrim(lower(regexp_replace(coalesce(r.name, '') || ' ' || coalesce(r.frequency, ''), '[^a-zA-Z0-9]+', '-', 'g')), '-');
    insert into public.stations (name, slug, frequency, region, kind, stream_url, broadcaster_org_id, stream_status)
    values (
      btrim(r.name),
      new_slug,
      nullif(btrim(coalesce(r.frequency, '')), ''),
      nullif(btrim(coalesce(r.region, '')), ''),
      coalesce(r.kind, 'radio'),
      nullif(btrim(coalesce(r.stream_url, '')), ''),
      r.org_id,
      case when nullif(btrim(coalesce(r.stream_url, '')), '') is null then 'no_stream_url' else 'starting' end
    )
    on conflict (slug) do update
      set broadcaster_org_id = coalesce(excluded.broadcaster_org_id, public.stations.broadcaster_org_id),
          stream_url = coalesce(excluded.stream_url, public.stations.stream_url)
    returning id into new_id;
  end if;

  update public.station_requests
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;

  return new_id;
end $$;

create or replace function public.reject_station_request(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() is distinct from 'cmo' then
    raise exception 'only a CMO can reject a station request';
  end if;
  update public.station_requests
     set status = 'rejected', review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'no pending station request with that id';
  end if;
end $$;

revoke all on function public.approve_station_request(uuid) from public;
revoke all on function public.reject_station_request(uuid, text) from public;
grant execute on function public.approve_station_request(uuid) to authenticated;
grant execute on function public.reject_station_request(uuid, text) to authenticated;
