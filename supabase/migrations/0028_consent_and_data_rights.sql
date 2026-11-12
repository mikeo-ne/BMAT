-- Consent, copyright reports and data-subject rights (Data Protection and Privacy Act 2019).
--
-- 1. profiles record which version of the Terms / Privacy Notice a person
--    accepted, when, and whether they consented to their data being stored
--    outside Uganda. Set at sign-up (from the sign-up form) or later via
--    accept_terms(). Users cannot back-date or edit these columns directly.
-- 2. copyright_reports: anyone can report a song they believe is uploaded
--    without the right to it. Write-only for the public; read by East Sound staff.
-- 3. my_data_export(): everything East Sound holds about the caller, as JSON.
-- 4. request_account_deletion() / cancel_account_deletion(): the request is
--    recorded and actioned by staff within 30 days (audio files live in storage,
--    which SQL must not delete directly).

alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists offshore_consent_at timestamptz,
  add column if not exists deletion_requested_at timestamptz;

-- Copy the consent captured on the sign-up form into the new profile row.
create or replace function public.profile_consent_from_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb;
begin
  select raw_user_meta_data into meta from auth.users where id = new.id;
  if meta ? 'terms_version' and coalesce((meta ->> 'terms_accepted')::boolean, false) then
    new.terms_version := left(meta ->> 'terms_version', 20);
    new.terms_accepted_at := now();
    if coalesce((meta ->> 'offshore_consent')::boolean, false) then
      new.offshore_consent_at := now();
    end if;
  end if;
  return new;
end $$;
revoke all on function public.profile_consent_from_signup() from public, anon, authenticated;

drop trigger if exists profile_consent_from_signup on public.profiles;
create trigger profile_consent_from_signup before insert on public.profiles
  for each row execute function public.profile_consent_from_signup();

-- Consent and deletion columns change only through the functions below.
create or replace function public.lock_consent_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.terms_version is distinct from old.terms_version
      or new.terms_accepted_at is distinct from old.terms_accepted_at
      or new.offshore_consent_at is distinct from old.offshore_consent_at
      or new.deletion_requested_at is distinct from old.deletion_requested_at)
     and coalesce(current_setting('east_sound.consent_write', true), '') <> 'on'
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'consent and deletion fields can only be changed through East Sound''s consent screens';
  end if;
  return new;
end $$;

drop trigger if exists lock_consent_fields on public.profiles;
create trigger lock_consent_fields before update on public.profiles
  for each row execute function public.lock_consent_fields();

create or replace function public.accept_terms(p_version text, p_offshore boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'bad version'; end if;
  perform set_config('east_sound.consent_write', 'on', true);
  update profiles
     set terms_version = p_version,
         terms_accepted_at = now(),
         offshore_consent_at = case when p_offshore then coalesce(offshore_consent_at, now()) else null end
   where id = auth.uid();
end $$;
revoke all on function public.accept_terms(text, boolean) from public, anon;
grant execute on function public.accept_terms(text, boolean) to authenticated;

create or replace function public.request_account_deletion() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  perform set_config('east_sound.consent_write', 'on', true);
  update profiles set deletion_requested_at = coalesce(deletion_requested_at, now())
   where id = auth.uid() returning deletion_requested_at into t;
  return t;
end $$;
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.cancel_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  perform set_config('east_sound.consent_write', 'on', true);
  update profiles set deletion_requested_at = null where id = auth.uid();
end $$;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- Everything held about the caller (right of access under the DPPA 2019).
create or replace function public.my_data_export() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'exported_at', now(),
    'account', (select json_build_object('id', u.id, 'email', u.email)
                  from auth.users u where u.id = auth.uid()),
    'profile', (select to_json(p) from profiles p where p.id = auth.uid()),
    'organisation', (select to_json(o) from organizations o join profiles p on p.org_id = o.id where p.id = auth.uid()),
    'alert_preferences', (select to_json(a) from alert_prefs a where a.profile_id = auth.uid()),
    'songs', coalesce((select json_agg(json_build_object('id', r.id, 'title', r.title, 'artist', r.artist_name, 'featuring', r.featuring,
                         'isrc', r.isrc, 'upc', r.upc, 'composer', r.composer, 'publisher', r.publisher, 'producer', r.producer,
                         'genre', r.genre, 'release_date', r.release_date, 'created_at', r.created_at))
                        from recordings r where owns_recording(r.id)), '[]'::json),
    'plays', coalesce((select json_agg(x order by x.detected_at desc) from (
                select d.detected_at, d.duration_sec, d.confidence, r.title, s.name as station, d.share_token is not null as shared
                  from detections d join recordings r on r.id = d.recording_id left join stations s on s.id = d.station_id
                 where owns_recording(d.recording_id)
                 order by d.detected_at desc limit 5000) x), '[]'::json)
  )
  where auth.uid() is not null;
$$;
revoke all on function public.my_data_export() from public, anon;
grant execute on function public.my_data_export() to authenticated;

create table if not exists public.copyright_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reporter_name text not null check (length(reporter_name) between 2 and 120),
  reporter_email text not null check (reporter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(reporter_email) <= 200),
  reporter_role text check (reporter_role in ('owner', 'authorised_agent', 'other')),
  work_title text not null check (length(work_title) between 1 and 200),
  where_on_east_sound text not null check (length(where_on_east_sound) between 1 and 500),
  details text not null check (length(details) between 10 and 4000),
  good_faith boolean not null check (good_faith),
  status text not null default 'new' check (status in ('new', 'reviewing', 'actioned', 'rejected')),
  reporter_id uuid default auth.uid()
);
alter table public.copyright_reports enable row level security;
drop policy if exists copyright_reports_submit on public.copyright_reports;
create policy copyright_reports_submit on public.copyright_reports
  for insert to anon, authenticated
  with check (status = 'new' and (reporter_id is null or reporter_id = auth.uid()));
-- No select/update policies: only East Sound staff (service role) read and action reports.
revoke all on public.copyright_reports from anon, authenticated;
grant insert (reporter_name, reporter_email, reporter_role, work_title, where_on_east_sound, details, good_faith) on public.copyright_reports to anon, authenticated;
