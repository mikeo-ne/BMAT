-- Realtime: let dashboards hear about new airplay the moment it is detected,
-- instead of waiting for the next poll.
--
-- Realtime honours RLS, so a label still only receives rows it could select.
-- Every block is idempotent: Supabase projects already have a
-- `supabase_realtime` publication, while a bare PostgreSQL (the CI shim) does
-- not — that case is a no-op rather than an error.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['detections', 'stations', 'unmatched_clips'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
