-- East Sound Technologies — core schema with strict role isolation (RLS).
-- Isolation layer 3: even a hand-crafted API call with a valid JWT can only
-- read rows that belong to the caller's role and organisation.

create type public.app_role as enum ('cmo', 'label', 'artist', 'broadcaster', 'venue');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.app_role not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  org_id uuid references public.organizations (id),
  display_name text,
  -- CMO accounts see everything, so they start unapproved and are activated by staff.
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Helpers (security definer so policies don't recurse through profiles RLS) ──
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and approved
$$;

create or replace function public.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;

-- ── New-user trigger: role comes from sign-up metadata, validated here ──
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  requested text := new.raw_user_meta_data ->> 'requested_role';
  r public.app_role;
  org uuid;
begin
  if requested not in ('cmo', 'label', 'artist', 'broadcaster', 'venue') then
    raise exception 'invalid role %', requested;
  end if;
  r := requested::public.app_role;
  if r <> 'artist' then
    insert into public.organizations (name, kind)
    values (coalesce(new.raw_user_meta_data ->> 'display_name', new.email), r)
    returning id into org;
  end if;
  insert into public.profiles (id, role, org_id, display_name, approved)
  values (new.id, r, org, new.raw_user_meta_data ->> 'display_name', r <> 'cmo');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may edit their display name, never their role / org / approval.
create or replace function public.lock_profile_fields() returns trigger
language plpgsql as $$
begin
  if new.role <> old.role or new.org_id is distinct from old.org_id or new.approved <> old.approved then
    if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
      raise exception 'role, organisation and approval can only be changed by East Sound staff';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_lock before update on public.profiles
  for each row execute function public.lock_profile_fields();

-- ── Domain tables ──
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  broadcaster_org_id uuid not null references public.organizations (id),
  name text not null,
  frequency text,
  region text check (region in ('Central', 'Western', 'Eastern', 'Northern'))
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  venue_org_id uuid not null references public.organizations (id),
  name text not null,
  uprs_licence text,
  licence_expires date
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  isrc text unique,
  upc text,
  label_org_id uuid references public.organizations (id),
  artist_profile_id uuid references public.profiles (id),
  fingerprint text,
  created_at timestamptz not null default now()
);

create table public.detections (
  id bigint generated always as identity primary key,
  recording_id uuid references public.recordings (id),
  station_id uuid references public.stations (id),
  venue_id uuid references public.venues (id),
  detected_at timestamptz not null,
  duration_sec int,
  confidence numeric(5, 2),
  evidence_path text, -- Supabase Storage key of the 10s clip
  check (num_nonnulls(station_id, venue_id) = 1)
);
create index on public.detections (recording_id, detected_at desc);
create index on public.detections (station_id, detected_at desc);

create table public.split_shares (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  party_name text not null,
  party_profile_id uuid references public.profiles (id),
  share_pct numeric(5, 2) not null check (share_pct > 0 and share_pct <= 100)
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings (id),
  claimant_a uuid references public.organizations (id),
  claimant_b uuid references public.organizations (id),
  status text not null default 'open',
  opened_at timestamptz not null default now()
);

create table public.alert_prefs (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  whatsapp_e164 text check (whatsapp_e164 ~ '^\+2567\d{8}$'),
  events jsonb not null default '{}'::jsonb
);

-- ── RLS ──
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.venues enable row level security;
alter table public.recordings enable row level security;
alter table public.detections enable row level security;
alter table public.split_shares enable row level security;
alter table public.disputes enable row level security;
alter table public.alert_prefs enable row level security;

-- Profiles: own row only (CMO may read all for the registry).
create policy profiles_self on public.profiles for select using (id = auth.uid() or public.my_role() = 'cmo');
create policy profiles_self_update on public.profiles for update using (id = auth.uid());

create policy orgs_read on public.organizations for select using (id = public.my_org() or public.my_role() = 'cmo');

-- Stations / venues: owner org or CMO.
create policy stations_read on public.stations for select
  using (public.my_role() = 'cmo' or (public.my_role() = 'broadcaster' and broadcaster_org_id = public.my_org()));
create policy venues_read on public.venues for select
  using (public.my_role() = 'cmo' or (public.my_role() = 'venue' and venue_org_id = public.my_org()));

-- Recordings: CMO all; label its own; artist their own.
create policy recordings_read on public.recordings for select using (
  public.my_role() = 'cmo'
  or (public.my_role() = 'label' and label_org_id = public.my_org())
  or (public.my_role() = 'artist' and artist_profile_id = auth.uid())
);
create policy recordings_write_label on public.recordings for insert
  with check (public.my_role() = 'label' and label_org_id = public.my_org());
create policy recordings_update_label on public.recordings for update
  using (public.my_role() = 'label' and label_org_id = public.my_org());

-- Detections: visible only through something the caller owns.
create policy detections_read on public.detections for select using (
  public.my_role() = 'cmo'
  or exists (select 1 from public.recordings r where r.id = recording_id and (
       (public.my_role() = 'label' and r.label_org_id = public.my_org())
    or (public.my_role() = 'artist' and r.artist_profile_id = auth.uid())))
  or exists (select 1 from public.stations s where s.id = station_id
       and public.my_role() = 'broadcaster' and s.broadcaster_org_id = public.my_org())
  or exists (select 1 from public.venues v where v.id = venue_id
       and public.my_role() = 'venue' and v.venue_org_id = public.my_org())
);

create policy splits_read on public.split_shares for select using (
  public.my_role() = 'cmo'
  or party_profile_id = auth.uid()
  or exists (select 1 from public.recordings r where r.id = recording_id
       and public.my_role() = 'label' and r.label_org_id = public.my_org())
);

create policy disputes_read on public.disputes for select using (
  public.my_role() = 'cmo' or claimant_a = public.my_org() or claimant_b = public.my_org()
);
create policy disputes_cmo_update on public.disputes for update using (public.my_role() = 'cmo');

create policy alerts_self on public.alert_prefs for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
