-- One shared admission gate across all website instances, for MusicBrainz lookups.
-- No direct table access: authenticated artists/labels can only take a slot.
create table public.catalog_lookup_gate (
  provider text primary key,
  last_admitted_at timestamptz not null
);
alter table public.catalog_lookup_gate enable row level security;
revoke all on public.catalog_lookup_gate from public, anon, authenticated;

create or replace function public.take_musicbrainz_lookup_slot()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.my_role() is null
     or public.my_role() not in ('artist', 'label') then
    return false;
  end if;
  insert into public.catalog_lookup_gate (provider, last_admitted_at)
    values ('musicbrainz', clock_timestamp())
  on conflict (provider) do update
    set last_admitted_at = clock_timestamp()
    where catalog_lookup_gate.last_admitted_at <= clock_timestamp() - interval '2 seconds';
  return found;
end;
$$;
revoke all on function public.take_musicbrainz_lookup_slot() from public, anon;
grant execute on function public.take_musicbrainz_lookup_slot() to authenticated;

-- Audiomack's approved quota is not yet known; use a conservative shared
-- minimum interval until a provider-specific agreement says otherwise.
create or replace function public.take_audiomack_lookup_slot()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.my_role() is null
     or public.my_role() not in ('artist', 'label') then
    return false;
  end if;
  insert into public.catalog_lookup_gate (provider, last_admitted_at)
    values ('audiomack', clock_timestamp())
  on conflict (provider) do update
    set last_admitted_at = clock_timestamp()
    where catalog_lookup_gate.last_admitted_at <= clock_timestamp() - interval '2 seconds';
  return found;
end;
$$;
revoke all on function public.take_audiomack_lookup_slot() from public, anon;
grant execute on function public.take_audiomack_lookup_slot() to authenticated;
