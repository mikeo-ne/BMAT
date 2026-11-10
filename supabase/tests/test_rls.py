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
SETUP_DB = os.environ.get("RLS_SETUP_DB", "est_setup_suite")
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


def psql_file(path: Path, db: str = DB) -> None:
    r = subprocess.run(["psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-qX", "-f", str(path)], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"{path.name} failed:\n{r.stderr}")


def check_one_shot_setup() -> None:
    """supabase/setup.sql is what an operator pastes into the SQL Editor.

    Applied to its own database so we know the concatenation runs cleanly on a
    blank project — not just that each numbered migration does in isolation.
    """
    subprocess.run(["dropdb", "--if-exists", SETUP_DB], capture_output=True)
    subprocess.run(["createdb", SETUP_DB], check=True)
    psql_file(ROOT / "supabase/tests/supabase_shim.sql", SETUP_DB)
    psql_file(ROOT / "supabase/setup.sql", SETUP_DB)
    print("one-shot setup: supabase/setup.sql applied cleanly")

    def q(sql: str) -> str:
        return psql(sql, db=SETUP_DB).stdout.strip()

    expect("setup.sql creates profiles", q("select count(*) from public.profiles"), "0")
    expect("setup.sql creates stations", q("select count(*) from public.stations"), "0")
    expect("setup.sql creates the evidence bucket", q("select count(*) from storage.buckets where id = 'evidence'"), "1")
    expect("setup.sql defines my_role()", q("select public.my_role() is null"), "t")
    rows = int(q("select count(*) from pg_policies where schemaname = 'public'"))
    expect(f"setup.sql installs RLS policies ({rows})", str(rows >= 20), "True")
    subprocess.run(["dropdb", "--if-exists", SETUP_DB], capture_output=True)


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
    check_one_shot_setup()
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
        "mentions": {"cmo": q("select count(*) from mentions"),
                     "broadcaster": q(f"select count(*) from mentions m join stations s on s.id = m.station_id where s.broadcaster_org_id = '{org['broadcaster']}'")},
        "tracked_keywords": {"cmo": q("select count(*) from tracked_keywords")},
        "alert_outbox": {},
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
    got, _ = as_user(None, "select (public.public_ingest_health() ->> 'stations')")
    expect("public_ingest_health() counts the panel for anonymous visitors", got, q("select count(*) from stations"))
    got, _ = as_user(None, "select count(*) from stations")
    expect("anonymous visitor still reads no station rows", got, "0")
    got, _ = as_user(None, "select string_agg(k, ',' order by k) from json_object_keys(public.public_ingest_health()) k")
    expect("public_ingest_health() returns counts and timestamps only", got, "last_detection,last_heartbeat,monitored,stations,stream_ready")

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
    out, err = as_user(users["label"], f"insert into alert_outbox (profile_id, kind, title, body, dedupe_key) values ('{uid['label']}', 'firstspin', 'x', 'y', 'forged')")
    expect_refused("label forges an entry in its own alert queue", err)
    out, err = as_user(None, "select public.enqueue_alerts(now() - interval '1 hour')")
    expect_refused("anonymous visitor enqueues alerts", err)

    # Credits: naming a writer is an edit to the song, so it follows the song.
    own_credits = q(f"insert into recording_credits (recording_id, role, name, position) values ('{own_rec}', 'songwriter', 'N. Akello', 0) returning id")
    out, err = as_user(users["label"], f"insert into recording_credits (recording_id, role, name, position) values ('{rival_rec}', 'songwriter', 'Sneaky', 0)")
    expect_refused("label adds a writer to a rival label's song", err)
    out, err = as_user(users["artist"], f"insert into recording_credits (recording_id, role, name, position) values ('{rival_rec}', 'songwriter', 'Sneaky', 0)")
    expect_refused("artist adds a writer to someone else's song", err)
    out, err = as_user(None, f"insert into recording_credits (recording_id, role, name, position) values ('{own_rec}', 'songwriter', 'Sneaky', 0)")
    expect_refused("anonymous visitor adds a writer", err)
    out, err = as_user(users["label"], f"insert into recording_credits (recording_id, role, name, position) values ('{own_rec}', 'songwriter', 'n. akello', 1)")
    expect_refused("the same writer cannot be credited twice (case-insensitive)", err)
    out, err = as_user(users["label"], f"insert into recording_credits (recording_id, role, name, position) values ('{own_rec}', 'producer', 'Nope', 2)")
    expect_refused("an unknown credit role is refused", err)
    got, _ = as_user(users["label"], f"select string_agg(role || ':' || name, ',' order by role, position) from recording_credits where recording_id = '{own_rec}'")
    expect("the owning label reads its own credits", got, "songwriter:N. Akello")
    got, _ = as_user(users["artist"], f"select count(*) from recording_credits where recording_id = '{rival_rec}'")
    expect("another artist reads none of a rival's credits", got, "0")

    out, err = as_user(users["broadcaster"], "with u as (update mentions set status = 'rejected' returning 1) select count(*) from u")
    expect_refused("broadcaster reviews its own brand mentions", err, out)
    out, err = as_user(users["broadcaster"], "insert into tracked_keywords (brand, terms) values ('X', '{x}')")
    expect_refused("broadcaster adds a tracked brand", err)
    any_station = q("select id from stations limit 1")
    for who in ("label", "broadcaster", "cmo"):
        out, err = as_user(users[who], f"insert into mentions (station_id, brand, heard_at, heard, transcript) values ('{any_station}', 'MTN', now(), 'mtn', 'x')")
        expect_refused(f"{who} fabricates a brand mention", err)
    out, err = as_user(users["cmo"], "update mentions set transcript = 'edited' where id = (select min(id) from mentions)")
    expect_refused("CMO rewrites a mention's evidence", err)

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
    out, err = as_user(users["artist"], f"with i as (insert into alert_prefs (profile_id, whatsapp_e164, channels) values ('{uid['artist']}', '+256772123456', jsonb_build_object('email', true, 'whatsapp', true, 'sms', true)) on conflict (profile_id) do update set channels = excluded.channels returning 1) select count(*) from i")
    expect("artist switches on WhatsApp and SMS for their own alerts", out or err, "1")
    psql(f"insert into alert_prefs (profile_id) values ('{uid['label']}') on conflict do nothing")
    expect("email stays on by default", psql(f"select channels ->> 'email' from alert_prefs where profile_id = '{uid['label']}'").stdout.strip(), "true")
    out, err = as_user(users["artist"], f"with u as (update alert_prefs set channels = '{{}}' where profile_id = '{uid['label']}' returning 1) select count(*) from u")
    expect("…but cannot change someone else's channels", out or err, "0")
    # The queue is written by the service role; a person only reads their own history.
    psql(f"insert into alert_outbox (profile_id, kind, title, body, link, dedupe_key) values ('{uid['artist']}', 'firstspin', 'First spin on Capital FM', 'x', '/dashboard/artist', 'test-a'), ('{uid['label']}', 'firstspin', 'First spin for the label', 'x', '/dashboard/label', 'test-l')")
    got, _ = as_user(users["artist"], "select string_agg(title, ',') from alert_outbox")
    expect("artist reads only their own alert history", got, "First spin on Capital FM")
    got, _ = as_user(users["label"], "select string_agg(title, ',') from alert_outbox")
    expect("label reads only their own alert history", got, "First spin for the label")
    got, _ = as_user(None, "select count(*) from alert_outbox")
    expect("anonymous visitor reads no alert history", got, "0")
    psql("update alert_outbox set channel = 'email+whatsapp+sms', delivered = '{\"email\": \"sent\"}' where dedupe_key = 'test-a'")
    expect("an alert can record several channels", psql("select channel from alert_outbox where dedupe_key = 'test-a'").stdout.strip(), "email+whatsapp+sms")
    r = psql("update alert_outbox set channel = 'fax' where dedupe_key = 'test-a'", check=False)
    expect("an unknown channel is refused", "refused" if r.returncode else "accepted", "refused")

    out, err = as_user(users["cmo"], "with u as (update mentions set status = 'confirmed', reviewed_at = now() returning 1) select count(*) from u")
    expect("approved CMO reviews brand mentions", out or err, q("select count(*) from mentions"))
    out, err = as_user(users["cmo"], f"with i as (insert into tracked_keywords (brand, terms) values ('Test Brand', '{{test brand}}') returning 1) select count(*) from i")
    expect("approved CMO adds a tracked brand", out or err, "1")
    out, err = as_user(users["pending_cmo"], "with u as (update mentions set status = 'rejected' returning 1) select count(*) from u")
    expect_refused("unapproved CMO reviews mentions", err, out)

    print("\nMASTERS — uploading songs and their reference audio")
    own_self = q("select id from recordings where title = 'Gulu Gold'")
    out, err = as_user(users["label"], f"with i as (insert into recordings (title, artist_name, label_org_id, genre, producer, featuring) values ('New Single', 'Nalu Akello', '{org['label']}', 'Afrobeat', 'P', 'F') returning 1) select count(*) from i")
    expect("label creates a recording with its details", out or err, "1")
    out, err = as_user(users["artist"], f"with i as (insert into recordings (title, artist_name, artist_profile_id) values ('My Song', 'Lamaro Grace', '{uid['artist']}') returning 1) select count(*) from i")
    expect("artist creates their own self-released recording", out or err, "1")
    out, err = as_user(users["artist"], f"with u as (update recordings set producer = 'X', master_path = '{own_self}/ref.wav' where id = '{own_self}' returning 1) select count(*) from u")
    expect("artist edits their own recording's details", out or err, "1")
    out, err = as_user(users["artist"], f"insert into recordings (title, artist_profile_id, label_org_id) values ('x', '{uid['artist']}', '{org['label']}')")
    expect_refused("artist files a recording under a label", err)
    out, err = as_user(users["artist"], f"insert into recordings (title, artist_profile_id) values ('x', '{uid['label']}')")
    expect_refused("artist files a recording under someone else", err)
    out, err = as_user(users["artist"], f"with u as (update recordings set title = 'hijack' where id = '{own_rec}' returning 1) select count(*) from u")
    expect_refused("artist edits a label's recording", err, out)
    out, err = as_user(users["artist"], f"with u as (update recordings set label_org_id = '{org['label']}' where id = '{own_self}' returning 1) select count(*) from u")
    expect_refused("artist hands their recording to a label", err, out)
    out, err = as_user(users["artist"], f"delete from recordings where id = '{own_self}'")
    expect_refused("recording with airplay history can't be deleted", err)
    out, err = as_user(users["label"], f"with d as (delete from recordings where id = '{rival_rec}' returning 1) select count(*) from d")
    expect_refused("label deletes a rival's recording", err, out)

    out, err = as_user(users["label"], f"with i as (insert into storage.objects (bucket_id, name) values ('masters', '{own_rec}/ref.wav') returning 1) select count(*) from i")
    expect("label uploads reference audio for its recording", out or err, "1")
    out, err = as_user(users["artist"], f"with i as (insert into storage.objects (bucket_id, name) values ('masters', '{own_self}/ref.wav') returning 1) select count(*) from i")
    expect("artist uploads reference audio for their recording", out or err, "1")
    out, err = as_user(users["label"], f"insert into storage.objects (bucket_id, name) values ('masters', '{rival_rec}/ref.wav')")
    expect_refused("label uploads into a rival's recording", err)
    out, err = as_user(users["artist"], f"insert into storage.objects (bucket_id, name) values ('masters', '{own_rec}/ref.wav')")
    expect_refused("artist uploads into a label's recording", err)
    out, err = as_user(users["broadcaster"], f"insert into storage.objects (bucket_id, name) values ('masters', '{own_rec}/ref.wav')")
    expect_refused("broadcaster uploads a master", err)
    out, err = as_user(None, f"insert into storage.objects (bucket_id, name) values ('masters', '{own_rec}/ref.wav')")
    expect_refused("anonymous visitor uploads a master", err)
    psql(f"insert into storage.objects (bucket_id, name) values ('masters', '{own_rec}/a.wav'), ('masters', '{rival_rec}/b.wav'), ('masters', '{own_self}/c.wav')")
    for who, want in (("label", "1"), ("artist", "1"), ("cmo", "3"), ("broadcaster", "0"), ("venue", "0"), ("anon", "0")):
        got, _ = as_user(users[who], "select count(*) from storage.objects where bucket_id = 'masters'")
        expect(f"reference files visible to {who}", got, want)
    expect("masters bucket is private", q("select public::text from storage.buckets where id = 'masters'"), "false")

    print("\nAIRPLAY ALERTS — who is told, and the settings are obeyed")
    gulu = q("select id from recordings where title = 'Gulu Gold'")
    owner = q(f"select artist_profile_id from recordings where id = '{gulu}'")
    new_st = q("insert into stations (name, frequency, region) values ('Alert Test FM', '99.9', 'Central') returning id")
    def run_alerts(events: str) -> str:
        psql(f"delete from alert_outbox; insert into alert_prefs (profile_id, events) values ('{owner}', '{events}') "
             f"on conflict (profile_id) do update set events = excluded.events")
        psql("select public.enqueue_alerts(now() - interval '1 hour')")
        return q(f"select coalesce(string_agg(kind || ':' || title, ' | ' order by kind), '') from alert_outbox where profile_id = '{owner}' and title like '%Alert Test FM%'")
    psql(f"insert into detections (recording_id, station_id, detected_at, ended_at, duration_sec, confidence, source) "
         f"values ('{gulu}', '{new_st}', now() - interval '5 minutes', now() - interval '2 minutes', 185, 90, 'stream')")
    got = run_alerts("{}")
    expect("defaults: first play on a new station is announced", "firstspin" if got.startswith("firstspin:First play on Alert Test FM") else got, "firstspin")
    expect("defaults: no every-play message", str("play:" in got), "False")
    expect("switching first-play alerts off is obeyed (firstSpin key)", run_alerts('{"firstSpin": false}'), "")
    got = run_alerts('{"everyPlay": true}')
    expect("every-play on: one play message, replacing the first-play one", got.split(":")[0] if got.count("|") == 0 else got, "play")
    expect("…which names the station and says it's a first play", str("Alert Test FM" in got and "first play" in q("select body from alert_outbox where kind = 'play' and title like '%Alert Test FM%'")), "True")
    psql("select public.enqueue_alerts(now() - interval '1 hour')")
    expect("running the sender again queues nothing twice", q(f"select count(*) from alert_outbox where profile_id = '{owner}' and title like '%Alert Test FM%'"), "1")
    psql(f"insert into detections (recording_id, station_id, detected_at, ended_at, duration_sec, confidence, source) "
         f"select '{gulu}', '{new_st}', ((now() at time zone 'Africa/Kampala')::date - 1 + time '10:00') at time zone 'Africa/Kampala' + n * interval '1 hour', "
         f"((now() at time zone 'Africa/Kampala')::date - 1 + time '10:03') at time zone 'Africa/Kampala' + n * interval '1 hour', 180, 90, 'stream' from generate_series(0, 2) n")
    psql("delete from alert_outbox")
    psql("select public.enqueue_daily_alerts()")
    body = q(f"select body from alert_outbox where kind = 'daily' and profile_id = '{owner}'")
    expect("daily summary counts yesterday's plays", str(body.startswith("Yesterday your music was played") and "Alert Test FM 3" in body and "• Gulu Gold — " in body), "True")
    psql("select public.enqueue_daily_alerts()")
    expect("daily summary is sent once per day", q(f"select count(*) from alert_outbox where kind = 'daily' and profile_id = '{owner}'"), "1")
    out, err = as_user(None, "select public.enqueue_daily_alerts()")
    expect_refused("anonymous visitor enqueues the daily summary", err)
    out, err = as_user(users["artist"], "select public.enqueue_daily_alerts()")
    expect_refused("signed-in user enqueues the daily summary", err)
    psql(f"delete from alert_outbox; delete from detections where station_id = '{new_st}'; delete from stations where id = '{new_st}'; delete from alert_prefs where profile_id = '{owner}'")

    print("\nUPC CHECK — warns about a clash without revealing other accounts' songs")
    psql(f"update recordings set upc = '012345678905' where id = '{rival_rec}'")
    rival_artist = q(f"select artist_name from recordings where id = '{rival_rec}'")
    got, err = as_user(users["artist"], "select public.upc_used_by_other_artist('012345678905', 'Somebody Else')")
    expect("UPC used by a different artist (other account) is flagged", got or err, "t")
    got, err = as_user(users["artist"], f"select public.upc_used_by_other_artist('012345678905', '{rival_artist}')")
    expect("same artist on the same UPC is fine (album tracks)", got or err, "f")
    got, err = as_user(users["artist"], f"select public.upc_used_by_other_artist('012345678905', 'Somebody Else', '{rival_rec}')")
    expect("the song being edited is left out of the check", got or err, "f")
    got, err = as_user(users["artist"], "select public.upc_used_by_other_artist('999999999999', 'Anyone')")
    expect("an unused UPC is fine", got or err, "f")
    got, _ = as_user(users["artist"], "select count(*) from recordings where upc = '012345678905'")
    expect("the clash is not readable as a row by the artist", got, "0")
    out, err = as_user(None, "select public.upc_used_by_other_artist('012345678905', 'x')")
    expect_refused("anonymous visitor calls upc_used_by_other_artist()", err)

    print("\nHARDENING")
    got, _ = as_user(None, "select streams_online from public.public_platform_stats()")
    want = q("select count(*) from stations where stream_status = 'online' and last_heartbeat > now() - interval '10 minutes'")
    expect("homepage counts only stations that reported recently", got, want)
    got, _ = as_user(None, "select panel_stations || '/' || stream_ready from public.public_platform_stats()")
    want = q("select (count(*) filter (where coalesce(stream_status, '') <> 'disabled')) || '/' ||"
             " (count(*) filter (where coalesce(stream_status, '') <> 'disabled'"
             "   and nullif(btrim(coalesce(stream_url, '')), '') is not null)) from stations")
    expect("…and reports the panel size even when nothing is streaming", got, want)
    out, err = as_user(None, f"select public.owns_master('{own_rec}/x.wav')")
    expect_refused("anonymous visitor calls owns_master()", err)
    out, err = as_user(None, f"select public.alert_wanted('{uid['artist']}', 'firstspin')")
    expect_refused("anonymous visitor calls alert_wanted()", err)
    out, err = as_user(users["label"], f"select public.alert_wanted('{uid['artist']}', 'firstspin')")
    expect_refused("signed-in user calls alert_wanted() on someone else", err)
    for fn in ("mentions_review_only", "lock_profile_fields", "owns_master"):
        got = q(f"select coalesce(array_to_string(proconfig, ','), '') from pg_proc where proname = '{fn}'")
        expect(f"{fn}() has a fixed search_path", got, "search_path=public")

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
    home_m = q(f"select m.id from mentions m join stations s on s.id = m.station_id where s.broadcaster_org_id = '{org['broadcaster']}' limit 1")
    rival_m = q("select m.id from mentions m join stations s on s.id = m.station_id where s.slug = 'demo-rival-fm' limit 1")
    psql(f"update mentions set evidence_path = 'mentions/home.mp3' where id = {home_m}")
    psql(f"update mentions set evidence_path = 'mentions/rival.mp3' where id = {rival_m}")
    psql("insert into storage.objects (bucket_id, name) values ('evidence', 'mentions/home.mp3'), ('evidence', 'mentions/rival.mp3')")
    got, _ = as_user(users["broadcaster"], "select string_agg(name, ',' order by name) from storage.objects where name like 'mentions/%'")
    expect("broadcaster hears only its own station's mention clips", got, "mentions/home.mp3")
    got, _ = as_user(users["label"], "select count(*) from storage.objects where name like 'mentions/%'")
    expect("a label hears no mention clips", got, "0")

    print(f"\n{'ALL CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILED: ' + '; '.join(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    os.environ.setdefault("PGHOST", "127.0.0.1")
    sys.exit(main())
