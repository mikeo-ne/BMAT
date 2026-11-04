"""Role-isolation test for the Supabase schema, on a real PostgreSQL server.

  PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres python3 supabase/tests/test_rls.py

Creates a fresh database, applies the Supabase shim + every migration, signs up
the demo accounts (through the real new-user trigger), loads demo data with
rival organisations, then checks — as each user — what they can read and
which writes are refused.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = os.environ.get("RLS_TEST_DB", "est_rls_suite")
EMAILS = {
    "cmo": "cmo@demo.eastsound.ug",
    "label": "label@demo.eastsound.ug",
    "artist": "artist@demo.eastsound.ug",
    "broadcaster": "broadcaster@demo.eastsound.ug",
    "venue": "venue@demo.eastsound.ug",
}
FAILS: list[str] = []


def psql(sql: str, db: str = DB, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", sql],
                          capture_output=True, text=True, check=check)


def psql_file(path: Path) -> None:
    r = subprocess.run(["psql", "-d", DB, "-v", "ON_ERROR_STOP=1", "-qX", "-f", str(path)], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"{path.name} failed:\n{r.stderr}")


def as_user(uid: str | None, sql: str) -> tuple[str, str]:
    """Run sql as the Supabase `authenticated` (or `anon`) API role, in a rolled-back transaction."""
    role = "authenticated" if uid else "anon"
    claim = f"select set_config('request.jwt.claim.sub', '{uid}', true);" if uid else ""
    full = f"begin; set local role {role}; {claim} {sql}; rollback;"
    r = subprocess.run(["psql", "-d", DB, "-qAtX", "-c", full], capture_output=True, text=True)
    out = [l for l in r.stdout.splitlines() if l.strip() and not l.startswith(("BEGIN", "ROLLBACK", "SET"))]
    return (out[-1] if out else ""), r.stderr.strip()


def expect(label: str, got: str, want: str) -> None:
    ok = got == want
    print(f"  {'✓' if ok else '✗'} {label:62} {got!s:>6}{'' if ok else f'  (expected {want})'}")
    if not ok:
        FAILS.append(label)


def expect_refused(label: str, err: str, out: str = "") -> None:
    ok = bool(err) or out in ("0", "UPDATE 0", "DELETE 0")
    print(f"  {'✓' if ok else '✗'} {label:62} {'refused' if ok else 'ALLOWED'}")
    if not ok:
        FAILS.append(label)


def main() -> int:
    subprocess.run(["dropdb", "--if-exists", DB], capture_output=True)
    subprocess.run(["createdb", DB], check=True)
    psql_file(ROOT / "supabase/tests/supabase_shim.sql")
    for m in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        psql_file(m)
    print(f"migrations applied: {', '.join(m.name for m in sorted((ROOT / 'supabase/migrations').glob('*.sql')))}")

    for role, email in EMAILS.items():
        psql(f"""insert into auth.users (email, raw_user_meta_data)
                 values ('{email}', '{{"requested_role": "{role}", "display_name": "Demo {role}"}}')""")
    psql("""insert into auth.users (email, raw_user_meta_data)
            values ('pending-cmo@demo.eastsound.ug', '{"requested_role": "cmo"}')""")
    bad = psql("""insert into auth.users (email, raw_user_meta_data) values ('x@x.ug', '{"requested_role": "admin"}')""", check=False)
    print("  ✓ sign-up with an invalid role is rejected" if bad.returncode else "  ✗ invalid role accepted")
    if not bad.returncode:
        FAILS.append("invalid role sign-up")
    psql(f"update public.profiles set approved = true where id = (select id from auth.users where email = '{EMAILS['cmo']}')")
    psql_file(ROOT / "supabase/seed/demo_data.sql")

    uid = {r: psql(f"select id from auth.users where email = '{e}'").stdout.strip() for r, e in EMAILS.items()}
    uid["pending_cmo"] = psql("select id from auth.users where email = 'pending-cmo@demo.eastsound.ug'").stdout.strip()
    users = {**uid, "anon": None}

    # Ground truth computed as the database owner.
    q = lambda s: psql(s).stdout.strip()  # noqa: E731
    org = {r: q(f"select coalesce(org_id::text, '') from public.profiles where id = '{uid[r]}'") for r in ("label", "broadcaster", "venue")}
    truth = {
        "recordings": {"cmo": q("select count(*) from recordings"),
                       "label": q(f"select count(*) from recordings where label_org_id = '{org['label']}'"),
                       "artist": q(f"select count(*) from recordings where artist_profile_id = '{uid['artist']}'")},
        "detections": {"cmo": q("select count(*) from detections"),
                       "label": q(f"select count(*) from detections d join recordings r on r.id = d.recording_id where r.label_org_id = '{org['label']}'"),
                       "artist": q(f"select count(*) from detections d join recordings r on r.id = d.recording_id where r.artist_profile_id = '{uid['artist']}'"),
                       "broadcaster": q(f"select count(*) from detections d join stations s on s.id = d.station_id where s.broadcaster_org_id = '{org['broadcaster']}'"),
                       "venue": q(f"select count(*) from detections d join venues v on v.id = d.venue_id where v.venue_org_id = '{org['venue']}'")},
        "stations": {"cmo": q("select count(*) from stations"), "broadcaster": "1"},
        "ad_spots": {"cmo": q("select count(*) from ad_spots"),
                     "broadcaster": q(f"select count(*) from ad_spots a join stations s on s.id = a.station_id where s.broadcaster_org_id = '{org['broadcaster']}'")},
        "ad_bookings": {"cmo": q("select count(*) from ad_bookings"), "broadcaster": "3"},
        "unmatched_clips": {"cmo": q("select count(*) from unmatched_clips")},
        "disputes": {"cmo": "2", "label": "2"},
        "artists": {"cmo": "3", "label": "3"},
        "royalty_statements": {"cmo": "12", "label": "6", "artist": "6"},
        "venue_nodes": {"cmo": "2", "venue": "2"},
        "dj_sets": {"cmo": "2", "venue": "2"},
        "split_shares": {"cmo": "5", "label": "2", "artist": "3"},
        "profiles": {"cmo": q("select count(*) from profiles"), "label": "1", "artist": "1", "broadcaster": "1", "venue": "1", "pending_cmo": "1"},
    }

    print("\nREAD ISOLATION — rows visible to each user")
    for table, want in truth.items():
        for who in ("cmo", "label", "artist", "broadcaster", "venue", "pending_cmo", "anon"):
            got, err = as_user(users[who], f"select count(*) from public.{table}")
            expect(f"{table:18} as {who}", got or ("error" if err else ""), want.get(who, "0"))

    print("\nAGGREGATES run under the caller's rules")
    for who in ("label", "artist", "broadcaster"):
        got, _ = as_user(users[who], "select coalesce(sum(spins), 0) from public.recording_spins(30)")
        lim = {"label": "label", "artist": "artist", "broadcaster": "broadcaster"}[who]
        want = q(f"select count(*) from detections d where d.recording_id is not null and d.detected_at >= now() - interval '30 days' and d.id in "
                 + {"label": f"(select d2.id from detections d2 join recordings r on r.id = d2.recording_id where r.label_org_id = '{org['label']}')",
                    "artist": f"(select d2.id from detections d2 join recordings r on r.id = d2.recording_id where r.artist_profile_id = '{uid['artist']}')",
                    "broadcaster": f"(select d2.id from detections d2 join stations s on s.id = d2.station_id where s.broadcaster_org_id = '{org['broadcaster']}')"}[lim])
        expect(f"recording_spins() total as {who}", got, want)
    got, _ = as_user(users["label"], "select count(*) from public.top_chart(7, null, 100) where owner like 'Rival%'")
    expect("top_chart() as label shows no rival recordings", got, "0")
    got, _ = as_user(None, "select count(*) from public.public_top_chart(null, 7)")
    # 7 of the 8 recordings have plays (the unreleased demo track has none yet).
    expect("public_top_chart() works for anonymous visitors", got, q("select count(distinct recording_id) from detections where recording_id is not null and detected_at >= now() - interval '7 days'"))
    got, err = as_user(None, "select count(*) from public.top_chart(7, null, 100)")
    expect("top_chart() as anon returns nothing", got, "0")

    print("\nWRITES that must be refused")
    rival_rec = q("select id from recordings where title = 'Rival Anthem'")
    own_rec = q("select id from recordings where title = 'Kampala Nights'")
    o_rival = q("select id from organizations where name = 'Rival Records (demo)'")
    out, err = as_user(users["label"], f"with u as (update recordings set isrc = 'UG-HAK-26-00001' where id = '{rival_rec}' returning 1) select count(*) from u")
    expect_refused("label edits a rival label's recording", err, out)
    out, err = as_user(users["label"], f"update recordings set label_org_id = '{o_rival}' where id = '{own_rec}'")
    expect_refused("label moves own recording to another org", err)
    out, err = as_user(users["label"], f"insert into recordings (title, label_org_id) values ('x', '{o_rival}')")
    expect_refused("label inserts a recording for another org", err)
    out, err = as_user(users["artist"], f"update profiles set role = 'cmo' where id = '{uid['artist']}'")
    expect_refused("artist promotes themself to CMO", err)
    out, err = as_user(users["label"], f"update profiles set approved = false where id = '{uid['label']}'")
    expect_refused("user changes their own approval flag", err)
    out, err = as_user(users["broadcaster"], "insert into detections (station_id, detected_at) select id, now() from stations limit 1")
    expect_refused("broadcaster fabricates a detection", err)
    out, err = as_user(users["label"], "with u as (update disputes set status = 'resolved_b' returning 1) select count(*) from u")
    expect_refused("label resolves its own dispute", err, out)
    out, err = as_user(users["pending_cmo"], "with u as (update disputes set status = 'resolved_a' returning 1) select count(*) from u")
    expect_refused("unapproved CMO resolves a dispute", err, out)
    rival_venue = q("select id from venues where name = 'Rival Lounge (demo)'")
    out, err = as_user(users["venue"], f"insert into dj_sets (venue_id, dj, starts_at, ends_at) values ('{rival_venue}', 'x', now(), now() + interval '1 hour')")
    expect_refused("venue logs a DJ set at a rival venue", err)
    out, err = as_user(None, f"insert into artists (label_org_id, name) values ('{org['label']}', 'x')")
    expect_refused("anonymous visitor adds an artist to a real label", err)
    out, err = as_user(users["broadcaster"], f"insert into artists (label_org_id, name) values ('{org['label']}', 'x')")
    expect_refused("broadcaster adds an artist to a label's roster", err)

    print("\nWRITES that must be allowed")
    out, err = as_user(users["cmo"], "with u as (update disputes set status = 'resolved_split', resolved_at = now() returning 1) select count(*) from u")
    expect("approved CMO resolves disputes", out or err, "2")
    out, err = as_user(users["label"], f"with u as (update recordings set isrc = 'UG-DEM-26-00099' where id = '{own_rec}' returning 1) select count(*) from u")
    expect("label fixes ISRC on its own recording", out or err, "1")
    out, err = as_user(users["label"], f"with i as (insert into artists (label_org_id, name) values ('{org['label']}', 'New Signing') returning 1) select count(*) from i")
    expect("label adds an artist to its roster", out or err, "1")
    own_venue = q(f"select id from venues where venue_org_id = '{org['venue']}'")
    out, err = as_user(users["venue"], f"with i as (insert into dj_sets (venue_id, dj, starts_at, ends_at) values ('{own_venue}', 'DJ Test', now(), now() + interval '2 hours') returning 1) select count(*) from i")
    expect("venue logs a DJ set at its own venue", out or err, "1")
    out, err = as_user(users["artist"], f"with i as (insert into alert_prefs (profile_id, whatsapp_e164, events) values ('{uid['artist']}', '+256772123456', '{{}}') returning 1) select count(*) from i")
    expect("artist saves their own WhatsApp alert settings", out or err, "1")

    print("\nEVIDENCE CLIPS follow detection visibility")
    home_det = q(f"select d.id from detections d join stations s on s.id = d.station_id where s.broadcaster_org_id = '{org['broadcaster']}' limit 1")
    rival_det = q("select d.id from detections d join stations s on s.id = d.station_id where s.slug = 'demo-rival-fm' limit 1")
    psql(f"update detections set evidence_path = 'test/home.mp3' where id = {home_det}")
    psql(f"update detections set evidence_path = 'test/rival.mp3' where id = {rival_det}")
    psql("insert into storage.objects (bucket_id, name) values ('evidence', 'test/home.mp3'), ('evidence', 'test/rival.mp3')")
    got, _ = as_user(users["broadcaster"], "select string_agg(name, ',' order by name) from storage.objects")
    expect("broadcaster can open only its own station's clip", got, "test/home.mp3")
    got, _ = as_user(users["cmo"], "select count(*) from storage.objects where bucket_id = 'evidence' and name like 'test/%'")
    expect("CMO can open every clip", got, "2")
    got, _ = as_user(None, "select count(*) from storage.objects")
    expect("anonymous visitor opens no clips", got, "0")

    print(f"\n{'ALL CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILED: ' + '; '.join(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    os.environ.setdefault("PGHOST", "127.0.0.1")
    sys.exit(main())
