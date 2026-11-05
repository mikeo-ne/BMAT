-- Masters: upload a song with its details, then the worker learns to recognise it.
--
-- Until now the dashboard only analysed a file in the browser and had nowhere
-- to put it — no way to create a recording, nothing stored — so an upload was
-- lost on sign-out and the worker never heard the song.
--
-- Now: the browser creates the recording (title, artist, codes, credits),
-- uploads a small *reference copy* (mono, 11 kHz — exactly what the
-- fingerprinter uses, a few MB per song, never the full-quality master) to the
-- private `masters` bucket, and the worker enrols every recording that has a
-- reference but is not yet enrolled.
--
-- Who may do what:
--   Label    create / edit / delete recordings of its own organisation
--   Artist   create / edit / delete their own self-released recordings
--            (label releases stay with the label)
--   CMO      read everything (unchanged)
--   Worker   service-role key: reads references, marks them enrolled

alter table public.recordings
  add column if not exists featuring text,
  add column if not exists producer text,
  add column if not exists genre text,
  add column if not exists master_path text,
  add column if not exists enrolled_at timestamptz,
  add column if not exists enroll_error text;

-- Independent artists upload their own songs.
drop policy if exists recordings_write_artist on public.recordings;
create policy recordings_write_artist on public.recordings for insert
  with check (public.my_role() = 'artist' and artist_profile_id = auth.uid() and label_org_id is null);
drop policy if exists recordings_update_artist on public.recordings;
create policy recordings_update_artist on public.recordings for update
  using (public.my_role() = 'artist' and artist_profile_id = auth.uid() and label_org_id is null)
  with check (artist_profile_id = auth.uid() and label_org_id is null);

-- Mistakes can be removed (a recording with airplay history is kept: the
-- detections reference it, so the delete is refused).
drop policy if exists recordings_delete_label on public.recordings;
create policy recordings_delete_label on public.recordings for delete
  using (public.my_role() = 'label' and label_org_id = public.my_org());
drop policy if exists recordings_delete_artist on public.recordings;
create policy recordings_delete_artist on public.recordings for delete
  using (public.my_role() = 'artist' and artist_profile_id = auth.uid() and label_org_id is null);

-- Private bucket for reference copies. 25 MB is ~20 minutes of reference audio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('masters', 'masters', false, 26214400, array['audio/wav', 'audio/x-wav', 'audio/wave'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects live at <recording id>/<file>; whoever owns the recording owns the file.
create or replace function public.owns_master(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.recordings r
    where r.id::text = split_part(p_name, '/', 1) and (
         (public.my_role() = 'label' and r.label_org_id = public.my_org())
      or (public.my_role() = 'artist' and r.artist_profile_id = auth.uid() and r.label_org_id is null)
    ));
$$;
revoke all on function public.owns_master(text) from public;
grant execute on function public.owns_master(text) to authenticated;

drop policy if exists masters_owner_read on storage.objects;
create policy masters_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'masters' and (public.owns_master(name) or public.my_role() = 'cmo'));
drop policy if exists masters_owner_insert on storage.objects;
create policy masters_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'masters' and public.owns_master(name));
drop policy if exists masters_owner_update on storage.objects;
create policy masters_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'masters' and public.owns_master(name))
  with check (bucket_id = 'masters' and public.owns_master(name));
drop policy if exists masters_owner_delete on storage.objects;
create policy masters_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'masters' and public.owns_master(name));

-- Hardening flagged by the Supabase security advisor -------------------------
-- 1. Functions with a fixed search path, so a caller can't shadow `public`.
alter function public.mentions_review_only() set search_path = public;
alter function public.lock_profile_fields() set search_path = public;
-- 2. alert_wanted() reveals one person's alert switches; only the (definer)
--    alert functions need it, never an API caller.
revoke execute on function public.alert_wanted(uuid, text) from public, anon, authenticated;
