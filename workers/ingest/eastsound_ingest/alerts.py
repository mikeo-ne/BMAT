"""Airplay alerts by email, sent from the monitoring worker.

The database decides who should hear about what (`enqueue_alerts`,
`enqueue_daily_alerts` write one `alert_outbox` row per person per event, never
twice). This loop runs those every minute, then emails whatever is pending
through Brevo's HTTPS API and records the result on the row, which the
dashboard shows as the person's alert history.

It runs here rather than on the website because the worker is always on and
already holds the service key, so no extra scheduler or secret is needed on
Vercel. Off unless BREVO_API_KEY and ALERT_FROM_EMAIL are set: without a way to
deliver, nothing is queued, so switching email on later doesn't flood anyone
with old news.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import logging
import threading
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable, Protocol

log = logging.getLogger(__name__)

BREVO_API = "https://api.brevo.com/v3/smtp/email"
KAMPALA = dt.timezone(dt.timedelta(hours=3), "EAT")  # Uganda: UTC+3 all year, no tz database needed
DAILY_AT_HOUR = 8  # local time the daily summary goes out
MAX_ATTEMPTS = 5


@dataclass
class Pending:
    id: str
    profile_id: str
    kind: str
    title: str
    body: str
    link: str | None
    attempts: int


class Outbox(Protocol):
    def enqueue(self) -> int: ...
    def enqueue_daily(self) -> int: ...
    def pending(self, limit: int) -> list[Pending]: ...
    def email_of(self, profile_id: str) -> str | None: ...
    def mark_sent(self, alert_id: str) -> None: ...
    def mark_skipped(self, alert_id: str, reason: str) -> None: ...
    def mark_failed(self, alert_id: str, error: str, attempts: int) -> None: ...


Mailer = Callable[[str, str, str, str], None]  # (to, subject, text, html) → raises on failure


class SupabaseOutbox:
    """PostgREST + Auth admin access with the service-role key (worker only)."""

    def __init__(self, url: str, key: str, timeout: float = 30):
        self.url, self.key, self.timeout = url.rstrip("/"), key, timeout

    def _req(self, method: str, path: str, body: object | None = None, prefer: str | None = None) -> bytes:
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if prefer:
            h["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return r.read()

    def enqueue(self) -> int:
        return int(json.loads(self._req("POST", "/rest/v1/rpc/enqueue_alerts", {}) or b"0") or 0)

    def enqueue_daily(self) -> int:
        return int(json.loads(self._req("POST", "/rest/v1/rpc/enqueue_daily_alerts", {}) or b"0") or 0)

    def pending(self, limit: int) -> list[Pending]:
        q = f"select=id,profile_id,kind,title,body,link,attempts&sent_at=is.null&order=created_at.asc&limit={limit}"
        rows = json.loads(self._req("GET", f"/rest/v1/alert_outbox?{q}") or b"[]")
        return [Pending(r["id"], r["profile_id"], r["kind"], r["title"], r["body"], r.get("link"), r.get("attempts") or 0) for r in rows]

    def email_of(self, profile_id: str) -> str | None:
        try:
            user = json.loads(self._req("GET", f"/auth/v1/admin/users/{urllib.parse.quote(profile_id)}"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # deleted account
            raise
        return user.get("email") or None

    def _patch(self, alert_id: str, body: dict) -> None:
        # Only rows still pending: never overwrite a result another sender recorded.
        self._req("PATCH", f"/rest/v1/alert_outbox?id=eq.{alert_id}&sent_at=is.null", body, "return=minimal")

    def mark_sent(self, alert_id: str) -> None:
        self._patch(alert_id, {"sent_at": _now(), "channel": "email", "last_error": None})

    def mark_skipped(self, alert_id: str, reason: str) -> None:
        self._patch(alert_id, {"sent_at": _now(), "channel": None, "last_error": reason})

    def mark_failed(self, alert_id: str, error: str, attempts: int) -> None:
        body: dict = {"attempts": attempts, "last_error": error[:300]}
        if attempts >= MAX_ATTEMPTS:  # give up, but leave the reason visible in the history
            body["sent_at"] = _now()
        self._patch(alert_id, body)


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def brevo_mailer(api_key: str, from_email: str, from_name: str = "East Sound", timeout: float = 30) -> Mailer:
    def send(to: str, subject: str, text: str, html_body: str) -> None:
        payload = {"sender": {"email": from_email, "name": from_name}, "to": [{"email": to}],
                   "subject": subject, "textContent": text, "htmlContent": html_body}
        req = urllib.request.Request(BREVO_API, data=json.dumps(payload).encode(), method="POST",
                                     headers={"api-key": api_key, "content-type": "application/json", "accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                r.read()
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:200]
            raise RuntimeError(f"Brevo HTTP {e.code}: {detail}") from None
    return send


def compose(a: Pending, site_url: str) -> tuple[str, str, str]:
    """(subject, text, html) for one alert. The body may contain line breaks (daily summary)."""
    url = None
    if a.link:
        base = site_url.rstrip("/")
        url = f"{base}{a.link if a.link.startswith('/') else '/' + a.link}" if base else a.link
    text = "\n".join([a.title, "", a.body] + (["", url] if url else []))
    lines = "<br>".join(html.escape(x) for x in a.body.split("\n"))
    parts = [
        f'<h2 style="font:600 18px system-ui,sans-serif;margin:0 0 8px">{html.escape(a.title)}</h2>',
        f'<p style="font:15px/1.6 system-ui,sans-serif;color:#334155;margin:0 0 16px">{lines}</p>',
        f'<p style="margin:0"><a href="{html.escape(url)}" style="font:14px system-ui,sans-serif">Open East Sound</a></p>' if url else "",
        '<p style="font:12px system-ui,sans-serif;color:#94a3b8;margin:24px 0 0">You get this because airplay alerts are on '
        "for your East Sound account. Change them under Alerts in your dashboard.</p>",
    ]
    return a.title, text, "".join(parts)


@dataclass
class Summary:
    sent: int = 0
    skipped: int = 0
    failed: int = 0


def drain(box: Outbox, send: Mailer, site_url: str, limit: int = 20) -> Summary:
    """Email every pending alert once. One bad row never stops the rest."""
    s = Summary()
    for a in box.pending(limit):
        try:
            to = box.email_of(a.profile_id)
            if not to:
                box.mark_skipped(a.id, "this account has no email address")
                s.skipped += 1
                continue
            subject, text, body = compose(a, site_url)
            send(to, subject, text, body)
            box.mark_sent(a.id)
            s.sent += 1
        except Exception as e:  # network / provider error: retry next round
            s.failed += 1
            log.warning("alert %s (%s) not sent: %s", a.id, a.kind, e)
            try:
                box.mark_failed(a.id, str(e) or "delivery failed", a.attempts + 1)
            except Exception:
                log.debug("could not record the failure for %s", a.id, exc_info=True)
    return s


class AlertSender(threading.Thread):
    """Inside `run`: queue new alerts and email them, every `every` seconds."""

    def __init__(self, box: Outbox, send: Mailer, site_url: str, stop: threading.Event, every: float = 60,
                 clock: Callable[[], dt.datetime] = lambda: dt.datetime.now(KAMPALA)):
        super().__init__(name="alert-sender", daemon=True)
        self.box, self.send, self.site_url, self.stop, self.every, self.clock = box, send, site_url, stop, every, clock
        self.daily_done: dt.date | None = None

    def tick(self) -> Summary:
        now = self.clock()
        queued = self.box.enqueue()
        if now.hour >= DAILY_AT_HOUR and self.daily_done != now.date():
            queued += self.box.enqueue_daily()  # idempotent in the database; this just avoids asking every minute
            self.daily_done = now.date()
        s = drain(self.box, self.send, self.site_url)
        if queued or s.sent or s.failed or s.skipped:
            log.info("alerts: %d queued, %d emailed, %d failed, %d skipped", queued, s.sent, s.failed, s.skipped)
        return s

    def run(self) -> None:
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception as e:
                log.warning("alert round failed: %s", e)
            self.stop.wait(self.every)
