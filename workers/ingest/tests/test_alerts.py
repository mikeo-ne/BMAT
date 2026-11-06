"""Airplay alerts by email, WhatsApp and SMS: delivery, channels, retries,
daily summary timing, wording.

    python -m tests.test_alerts          (run from workers/ingest)
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.request

from eastsound_ingest import alerts as A
from eastsound_ingest.alerts import (KAMPALA, MAX_ATTEMPTS, AlertSender, Contact, Pending, Senders, compose, drain,
                                     sms_text)

FAILS: list[str] = []


def check(ok: bool, label: str) -> None:
    print(f"  {'✓' if ok else '✗'} {label}")
    if not ok:
        FAILS.append(label)


class FakeOutbox:
    def __init__(self, rows: list[Pending], contacts: dict[str, Contact]):
        self.rows = {r.id: r for r in rows}
        self.contacts = contacts
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

    def contact_of(self, profile_id: str) -> Contact:
        return self.contacts.get(profile_id) or Contact(None, None)

    def mark_sent(self, alert_id: str, channels: list[str], delivered: dict) -> None:
        self.result[alert_id] = ("sent", "+".join(channels))

    def mark_skipped(self, alert_id: str, reason: str) -> None:
        self.result[alert_id] = ("skipped", reason)

    def mark_failed(self, alert_id: str, error: str, attempts: int, delivered: dict, sent: list[str]) -> None:
        r = self.rows[alert_id]
        r.attempts, r.delivered = attempts, delivered
        self.result[alert_id] = ("failed", error, attempts) if attempts < MAX_ATTEMPTS else ("gave-up", error, "+".join(sent))


class Log:
    def __init__(self):
        self.mail, self.wa, self.sms = [], [], []

    def senders(self, email=True, wa=True, sms=True, fail=()):
        def m(to, subj, text, html):
            if "email" in fail:
                raise RuntimeError("Brevo HTTP 503")
            self.mail.append((to, subj, text, html))

        def w(phone, title, link):
            if "whatsapp" in fail:
                raise RuntimeError("WhatsApp HTTP 400: template not approved")
            self.wa.append((phone, title, link))

        def s(phone, title, link):
            if "sms" in fail:
                raise RuntimeError("Africa's Talking: InsufficientBalance")
            self.sms.append((phone, title, link))
        return Senders(m if email else None, w if wa else None, s if sms else None)


def main() -> int:
    SITE = "https://eastsound.vercel.app"
    nalu = Contact("nalu@example.com", "+256772123456", {"email": True, "whatsapp": True, "sms": True})
    label = Contact("pyong@example.com", None, {"email": True, "whatsapp": True, "sms": True})
    quiet = Contact("q@example.com", "+256701000000", {"email": False, "whatsapp": False, "sms": False})

    print("\nEMAIL (as before)")
    first = Pending("a1", "artist", "firstspin", "First play on KFM 93.3: My Way", "My Way was played on KFM 93.3 at 14:05.", "/dashboard/artist", 0)
    daily = Pending("a2", "label", "daily", "Your airplay for Wed 4 Nov: 3 plays",
                    "Yesterday your music was played 3 times.\n\n• My Way — 3 plays (KFM 2, XFM 1)", "/dashboard/label", 0)
    ghost = Pending("a3", "deleted", "firstspin", "First play", "x", None, 0)
    L = Log()
    box = FakeOutbox([first, daily, ghost], {"artist": nalu, "label": label})
    s = drain(box, L.senders(), SITE)
    check(s.sent == 2 and s.skipped == 1 and s.failed == 0, f"2 delivered, 1 skipped ({s})")
    check([x[0] for x in L.mail] == ["nalu@example.com", "pyong@example.com"], "each alert is emailed to its owner")
    check(L.mail[0][1] == "First play on KFM 93.3: My Way", "subject is the alert title")
    check(f"{SITE}/dashboard/artist" in L.mail[0][2] and f'href="{SITE}/dashboard/artist"' in L.mail[0][3], "text and HTML link to the right dashboard")
    check("<br>• My Way — 3 plays" in L.mail[1][3], "the daily summary keeps its line breaks in HTML")
    check(box.result["a3"][0] == "skipped", "an account with no way to reach it is skipped with a reason")

    print("\nWHATSAPP AND SMS")
    check(box.result["a1"] == ("sent", "email+whatsapp+sms"), f"a first play goes out on every channel switched on ({box.result['a1'][1]})")
    check(L.wa == [("+256772123456", "First play on KFM 93.3: My Way", f"{SITE}/dashboard/artist")], "WhatsApp gets the number, the alert and the link")
    check(len(L.sms) == 1 and L.sms[0][0] == "+256772123456", "SMS goes to the same number")
    check(box.result["a2"] == ("sent", "email"), "no number saved: email only")
    L2 = Log()
    box2 = FakeOutbox([Pending("p1", "artist", "play", "Played on XFM: My Way", "b", "/dashboard/artist", 0)], {"artist": nalu})
    drain(box2, L2.senders(), SITE)
    check(box2.result["p1"] == ("sent", "email") and not L2.wa and not L2.sms, "every-play alerts are email only (SMS/WhatsApp cost per message)")
    L3 = Log()
    box3 = FakeOutbox([Pending("q1", "quiet", "firstspin", "t", "b", None, 0)], {"quiet": quiet})
    drain(box3, L3.senders(), SITE)
    check(box3.result["q1"][0] == "skipped" and not (L3.mail or L3.wa or L3.sms), "all channels off: nothing is sent")
    L4 = Log()
    box4 = FakeOutbox([Pending("r1", "artist", "firstspin", "t", "b", None, 0)], {"artist": nalu})
    drain(box4, L4.senders(wa=False, sms=False), SITE)
    check(box4.result["r1"] == ("sent", "email"), "a channel East Sound hasn't set up is simply not used")

    print("\nRETRIES")
    L5 = Log()
    row = Pending("b1", "artist", "firstspin", "t", "b", None, 0)
    box5 = FakeOutbox([row], {"artist": nalu})
    s5 = drain(box5, L5.senders(fail=("whatsapp",)), SITE)
    check(s5.failed == 1 and box5.result["b1"][0] == "failed" and "whatsapp" in box5.result["b1"][1], "a WhatsApp error is recorded and retried")
    check(len(L5.mail) == 1 and len(L5.sms) == 1, "…while email and SMS still went out")
    drain(box5, L5.senders(), SITE)
    check(len(L5.mail) == 1 and len(L5.sms) == 1 and len(L5.wa) == 1, "the retry sends only WhatsApp — no duplicate email or SMS")
    check(box5.result["b1"] == ("sent", "email+whatsapp+sms"), "then the alert is complete")
    L6 = Log()
    box6 = FakeOutbox([Pending("c1", "artist", "firstspin", "t", "b", None, 0)], {"artist": nalu})
    for _ in range(MAX_ATTEMPTS):
        drain(box6, L6.senders(fail=("sms",)), SITE)
    check(box6.result["c1"][0] == "gave-up" and box6.result["c1"][2] == "email+whatsapp" and len(L6.mail) == 1,
          f"after {MAX_ATTEMPTS} attempts it stops, keeps what was delivered and why the rest wasn't")

    print("\nPROVIDER REQUESTS")
    seen = {}

    class Resp:
        def __init__(self, body): self.body = body
        def read(self): return self.body
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_open(req, timeout=0):
        seen["url"], seen["data"], seen["headers"] = req.full_url, req.data, dict(req.header_items())
        if "africastalking" in req.full_url:
            return Resp(json.dumps({"SMSMessageData": {"Recipients": [seen.get("at_reply", {"statusCode": 101, "status": "Success"})]}}).encode())
        return Resp(b'{"messages":[{"id":"x"}]}')
    real = urllib.request.urlopen
    A.urllib.request.urlopen = fake_open
    try:
        A.africastalking_sms("eastsound", "k", "EASTSOUND")("+256772123456", "First play on KFM 93.3: My Way", f"{SITE}/dashboard/artist")
        form = dict(x.split("=", 1) for x in seen["data"].decode().split("&"))
        check(seen["url"].startswith("https://api.africastalking.com/") and seen["headers"].get("Apikey") == "k", "SMS: Africa's Talking live endpoint with the API key header")
        check(form["to"] == "%2B256772123456" and form["from"] == "EASTSOUND", "SMS: right number and sender ID")
        A.africastalking_sms("sandbox", "k", sandbox=True)("+256772123456", "t", "")
        check("sandbox" in seen["url"], "SMS: sandbox mode uses the sandbox endpoint")
        seen["at_reply"] = {"statusCode": 405, "status": "InsufficientBalance"}
        try:
            A.africastalking_sms("eastsound", "k")("+256772123456", "t", "")
            check(False, "SMS: a rejected message raises")
        except RuntimeError as e:
            check("InsufficientBalance" in str(e), f"SMS: a rejected message raises with the reason ({e})")
        A.whatsapp_cloud("tok", "12345")("+256772123456", "First play on\nKFM: My Way", f"{SITE}/dashboard/artist")
        body = json.loads(seen["data"])
        check(seen["url"].endswith("/12345/messages") and seen["headers"].get("Authorization") == "Bearer tok", "WhatsApp: Cloud API endpoint with the token")
        check(body["to"] == "256772123456" and body["template"]["name"] == "airplay_alert", "WhatsApp: number without + and the approved template")
        params = [p["text"] for p in body["template"]["components"][0]["parameters"]]
        check(params == ["First play on KFM: My Way", f"{SITE}/dashboard/artist"], "WhatsApp: template values are one line each")
    finally:
        A.urllib.request.urlopen = real

    print("\nDAILY SUMMARY TIMING")
    t = [dt.datetime(2026, 11, 5, 7, 59, tzinfo=KAMPALA)]
    box7 = FakeOutbox([], {})
    snd = AlertSender(box7, Senders(), "", stop=None, clock=lambda: t[0])  # type: ignore[arg-type]
    snd.tick()
    check(box7.daily_calls == 0 and box7.enqueued == 1, "before 8 am: plays are queued, no summary yet")
    t[0] = dt.datetime(2026, 11, 5, 8, 0, tzinfo=KAMPALA)
    snd.tick()
    t[0] = dt.datetime(2026, 11, 5, 16, 0, tzinfo=KAMPALA)
    snd.tick()
    check(box7.daily_calls == 1, "from 8 am: the summary is queued once that day")
    t[0] = dt.datetime(2026, 11, 6, 8, 1, tzinfo=KAMPALA)
    snd.tick()
    check(box7.daily_calls == 2, "…and again the next morning")

    print("\nWORDING")
    subj, text, html = compose(Pending("d", "p", "play", "Played <on> A&B FM", "x < y", "dashboard/artist", 0), "https://site/")
    check("&lt;on&gt; A&amp;B" in html and "x &lt; y" in html, "names are escaped in HTML")
    check("https://site/dashboard/artist" in text, "relative links become full links")
    check("Change them under Alerts" in html, "every email says how to change the settings")
    msg = sms_text("Your airplay for Wed 4 Nov: 14 plays on 6 stations " + "x" * 200, f"{SITE}/dashboard/artist")
    check(len(msg) <= 160 and msg.endswith(f"{SITE}/dashboard/artist") and msg.startswith("East Sound: "), f"an SMS fits one message and keeps the link ({len(msg)} chars)")

    print(f"\n{'ALL ALERT CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILED'}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
