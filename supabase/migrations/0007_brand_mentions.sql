-- Brand mentions: brands spoken on air (live reads, presenter shout-outs),
-- found by the ingest worker's speech recognition. Pre-recorded adverts are
-- caught more reliably by fingerprinting (enroll the ad like a song).
--
-- Who sees what:
--   CMO          manages the tracked-brand list; sees and reviews every mention
--   Broadcaster  sees mentions on its own stations (read-only)
--   everyone else nothing
-- The worker writes with the service-role key.

create table if not exists public.tracked_keywords (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (length(trim(brand)) between 1 and 80),
  -- how people say it, e.g. {mtn, "m t n", "em tee en"}
  terms text[] not null default '{}' check (cardinality(terms) between 1 and 20),
  -- how the recogniser has misheard it, confirmed by a reviewer, e.g. {"mt and"}
  aliases text[] not null default '{}' check (cardinality(aliases) <= 50),
  active boolean not null default true,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists tracked_keywords_brand on public.tracked_keywords (lower(brand));

create table if not exists public.mentions (
  id bigint generated always as identity primary key,
  station_id uuid not null references public.stations (id) on delete cascade,
  keyword_id uuid references public.tracked_keywords (id) on delete set null,
  brand text not null,
  heard_at timestamptz not null,
  heard text not null,                       -- the words that matched
  transcript text not null check (length(transcript) <= 1000),
  score int check (score between 0 and 100),
  evidence_path text,
  status text not null default 'unreviewed' check (status in ('unreviewed', 'confirmed', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz
);
create index if not exists mentions_station_time on public.mentions (station_id, heard_at desc);
create index if not exists mentions_time on public.mentions (heard_at desc);

alter table public.tracked_keywords enable row level security;
alter table public.mentions enable row level security;

create policy tracked_keywords_cmo_read on public.tracked_keywords for select using (public.my_role() = 'cmo');
create policy tracked_keywords_cmo_insert on public.tracked_keywords for insert with check (public.my_role() = 'cmo');
create policy tracked_keywords_cmo_update on public.tracked_keywords for update
  using (public.my_role() = 'cmo') with check (public.my_role() = 'cmo');

create policy mentions_read on public.mentions for select using (
  public.my_role() = 'cmo'
  or exists (select 1 from public.stations s where s.id = station_id
             and public.my_role() = 'broadcaster' and s.broadcaster_org_id = public.my_org())
);
create policy mentions_cmo_review on public.mentions for update
  using (public.my_role() = 'cmo') with check (public.my_role() = 'cmo');

-- A review may change the verdict only — never the evidence itself.
create or replace function public.mentions_review_only() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') and (
       new.station_id <> old.station_id or new.brand <> old.brand or new.heard_at <> old.heard_at
       or new.heard <> old.heard or new.transcript <> old.transcript
       or new.evidence_path is distinct from old.evidence_path or new.keyword_id is distinct from old.keyword_id) then
    raise exception 'only the review status of a mention can be changed';
  end if;
  return new;
end $$;
drop trigger if exists mentions_review_only on public.mentions;
create trigger mentions_review_only before update on public.mentions
  for each row execute function public.mentions_review_only();

-- Evidence clips: readable exactly when the detection, unmatched clip or mention is.
drop policy if exists evidence_read on storage.objects;
create policy evidence_read on storage.objects for select using (
  bucket_id = 'evidence' and (
    exists (select 1 from public.detections d where d.evidence_path = name)
    or exists (select 1 from public.unmatched_clips u where u.evidence_path = name)
    or exists (select 1 from public.mentions m where m.evidence_path = name)
  ));

-- Starter list (the CMO edits it in the dashboard). Names only; no claims about sponsorship.
insert into public.tracked_keywords (brand, terms, aliases, created_by) values
  ('MTN', '{mtn,"m t n","em tee en"}', '{"mt and","empty n"}', null),
  ('Airtel', '{airtel,"air tel"}', '{}', null),
  ('Stanbic Bank', '{stanbic,"stanbic bank"}', '{}', null),
  ('Nile Special', '{"nile special"}', '{}', null),
  ('Club Pilsener', '{"club pilsener","club pilsner"}', '{}', null),
  ('Bell Lager', '{"bell lager"}', '{}', null),
  ('Uganda Waragi', '{"uganda waragi",waragi}', '{}', null),
  ('Coca-Cola', '{"coca cola",coke}', '{}', null),
  ('Mukwano', '{mukwano}', '{}', null),
  ('Rwenzori Water', '{rwenzori}', '{}', null)
on conflict do nothing;
