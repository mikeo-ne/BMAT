"""Airplay alert emails: delivery, retries, daily summary timing, wording.

    python -m tests.test_alerts          (run from workers/ingest)
"""
from __future__ import annotations

import datetime as dt
import sys

from eastsound_ingest.alerts import KAMPALA, MAX_ATTEMPTS, AlertSender, Pending, compose, drain

FAILS: list[str] = []


def check(ok: bool, label: str) -> None:
    print(f"  {'✓' if ok else '✗'} {label}")
    if not ok:
        FAILS.append(label)


class FakeOutbox:
    def __init__(self, rows: list[Pending], emails: dict[str, str | None]):
        self.rows = {r.id: r for r in rows}
        self.emails = emails
        self.result: dict[str, tuple] = {}
        self.enqueued = self.daily_calls = 0

    def enqueue(self) -> int:
        self.enqueued += 1
        return 0

    def enqueue_daily(self) -> int:
        self.daily_calls += 1
        return 1

    def pending(self, limit: int) -> list[Pending]:
        return [r for r in self.rows.values() if r.id not in self.result or self.result[r.id][0] == "failed"][:limit]

    def email_of(self, profile_id: str) -> str | None:
        return self.emails.get(profile_id)

    def mark_sent(self, alert_id: str) -> None:
        self.result[alert_id] = ("sent",)

    def mark_skipped(self, alert_id: str, reason: str) -> None:
        self.result[alert_id] = ("skipped", reason)

    def mark_failed(self, alert_id: str, error: str, attempts: int) -> None:
        self.rows[alert_id].attempts = attempts
        self.result[alert_id] = ("failed", error, attempts) if attempts < MAX_ATTEMPTS else ("gave-up", error)


def main() -> int:
    play = Pending("a1", "artist", "play", "Played on KFM 93.3: My Way", "My Way was played on KFM 93.3 at 14:05.", "/dashboard/artist", 0)
    daily = Pending("a2", "label", "daily", "Your airplay for Wed 4 Nov: 3 plays",
                    "Yesterday your music was played 3 times.\n\n• My Way — 3 plays (KFM 2, XFM 1)", "/dashboard/label", 0)
    ghost = Pending("a3", "deleted", "firstspin", "First play", "x", None, 0)
    box = FakeOutbox([play, daily, ghost], {"artist": "nalu@example.com", "label": "pyong@example.com"})
    sent: list[tuple] = []
    s = drain(box, lambda to, subj, text, html: sent.append((to, subj, text, html)), "https://bmat-rho.vercel.app")

    print("\nDELIVERY")
    check(s.sent == 2 and s.skipped == 1 and s.failed == 0, f"2 emailed, 1 skipped ({s})")
    check([x[0] for x in sent] == ["nalu@example.com", "pyong@example.com"], "each alert goes to its owner's address")
    check(box.result["a3"] == ("skipped", "this account has no email address"), "an account without email is skipped with a reason")
    check(sent[0][1] == "Played on KFM 93.3: My Way", "subject is the alert title")
    check("https://bmat-rho.vercel.app/dashboard/artist" in sent[0][2] and 'href="https://bmat-rho.vercel.app/dashboard/artist"' in sent[0][3],
          "text and HTML link to the right dashboard")
    check("<br>• My Way — 3 plays" in sent[1][3], "the daily summary keeps its line breaks in HTML")

    print("\nRETRIES")
    box2 = FakeOutbox([Pending("b1", "artist", "play", "t", "b", None, 0)], {"artist": "x@example.com"})

    def down(*_):
        raise RuntimeError("Brevo HTTP 503: try later")
    s2 = drain(box2, down, "")
    check(s2.failed == 1 and box2.result["b1"][0] == "failed", "a provider error is recorded and retried later")
    for _ in range(MAX_ATTEMPTS):
        drain(box2, down, "")
    check(box2.result["b1"][0] == "gave-up", f"after {MAX_ATTEMPTS} attempts it stops retrying (and says why)")
    box3 = FakeOutbox([Pending("c1", "artist", "play", "t", "b", None, 0)], {"artist": "x@example.com"})
    drain(box3, down, "")
    drain(box3, lambda *a: None, "")
    check(box3.result["c1"] == ("sent",), "a temporary failure is delivered on the next round")

    print("\nDAILY SUMMARY TIMING")
    t = [dt.datetime(2026, 11, 5, 7, 59, tzinfo=KAMPALA)]
    box4 = FakeOutbox([], {})
    snd = AlertSender(box4, lambda *a: None, "", stop=None, clock=lambda: t[0])  # type: ignore[arg-type]
    snd.tick()
    check(box4.daily_calls == 0 and box4.enqueued == 1, "before 8 am: plays are queued, no summary yet")
    t[0] = dt.datetime(2026, 11, 5, 8, 0, tzinfo=KAMPALA)
    snd.tick()
    t[0] = dt.datetime(2026, 11, 5, 16, 0, tzinfo=KAMPALA)
    snd.tick()
    check(box4.daily_calls == 1, "from 8 am: the summary is queued once that day")
    t[0] = dt.datetime(2026, 11, 6, 8, 1, tzinfo=KAMPALA)
    snd.tick()
    check(box4.daily_calls == 2, "…and again the next morning")

    print("\nWORDING")
    subj, text, html = compose(Pending("d", "p", "play", "Played <on> A&B FM", "x < y", "dashboard/artist", 0), "https://site/")
    check("&lt;on&gt; A&amp;B" in html and "x &lt; y" in html, "names are escaped in HTML")
    check("https://site/dashboard/artist" in text, "relative links become full links")
    check("Change them under Alerts" in html, "every email says how to change the settings")

    print(f"\n{'ALL ALERT CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILED'}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
