-- ── More than one songwriter, more than one feature ───────────────────────
--
-- `recordings.composer` and `recordings.featuring` were single text fields, so
-- a song with three writers had to be typed as one blob ("A, B & C") and a
-- cue sheet printed that blob as if it were a person's name. UPRS distributes
-- to people, so the writer list is not a display detail — it is the royalty
-- claim.
--
-- Credits now live in their own table: one row per person, with a role and an
-- order. The two old text columns are still written (joined with "; ") because
-- the worker, the cue-sheet generator, the broadcaster timeline and the CSV
-- exports all read them — that keeps this additive instead of a migration of
-- every consumer.

create table if not exists public.recording_credits (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  role text not null check (role in ('songwriter', 'featured')),
  name text not null check (length(btrim(name)) > 0),
  -- Set when the person has an East Sound account, so a writer can later see
  -- their own credits. Null is normal: most writers are typed in by name.
  profile_id uuid references public.profiles (id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- The same person cannot be credited twice in the same role on one song,
-- whatever the capitalisation ("Nalu" vs "nalu").
create unique index if not exists recording_credits_unique
  on public.recording_credits (recording_id, role, lower(btrim(name)));
create index if not exists recording_credits_recording
  on public.recording_credits (recording_id, role, position);

-- Who may edit credits: exactly who may edit the recording itself.
create or replace function public.owns_recording(p_recording uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.recordings r
     where r.id = p_recording
       and (
            (public.my_role() = 'label'  and r.label_org_id = public.my_org())
         or (public.my_role() = 'artist' and r.artist_profile_id = auth.uid() and r.label_org_id is null)
       )
  )
$$;
revoke all on function public.owns_recording(uuid) from public;
grant execute on function public.owns_recording(uuid) to authenticated;

alter table public.recording_credits enable row level security;

-- The owner, their label, the CMO — and a writer whose account is credited.
drop policy if exists recording_credits_read on public.recording_credits;
create policy recording_credits_read on public.recording_credits for select using (
  public.my_role() = 'cmo'
  or public.owns_recording(recording_id)
  or profile_id = auth.uid()
);

drop policy if exists recording_credits_write on public.recording_credits;
create policy recording_credits_write on public.recording_credits for insert
  with check (public.owns_recording(recording_id));

drop policy if exists recording_credits_update on public.recording_credits;
create policy recording_credits_update on public.recording_credits for update
  using (public.owns_recording(recording_id))
  with check (public.owns_recording(recording_id));

drop policy if exists recording_credits_delete on public.recording_credits;
create policy recording_credits_delete on public.recording_credits for delete
  using (public.owns_recording(recording_id));
