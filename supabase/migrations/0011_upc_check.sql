-- ── UPC sanity check for the upload form ──────────────────────────────────
-- A UPC identifies one release (single/EP/album), so every track on it has the
-- same main artist — unless it's a compilation. RLS hides other accounts'
-- songs, so the form can't see a clash itself. This answers one yes/no
-- question and reveals nothing else (no titles, owners or ids).
create or replace function public.upc_used_by_other_artist(p_upc text, p_artist text, p_exclude uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.recordings r
    where r.upc = nullif(trim(p_upc), '')
      and (p_exclude is null or r.id <> p_exclude)
      and lower(trim(coalesce(r.artist_name, ''))) <> lower(trim(coalesce(p_artist, '')))
  )
$$;
revoke execute on function public.upc_used_by_other_artist(text, text, uuid) from public, anon;
grant execute on function public.upc_used_by_other_artist(text, text, uuid) to authenticated;
