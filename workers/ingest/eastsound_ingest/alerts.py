"""Airplay alerts by email, WhatsApp and SMS, sent from the monitoring worker.

The database decides who should hear about what (`enqueue_alerts`,
`enqueue_daily_alerts` write one `alert_outbox` row per person per event, never
twice). This loop runs those every minute, then delivers whatever is pending on
every channel the person switched on, and records the result on the row, which
the dashboard shows as the person's alert history.

Channels:
  email     Brevo HTTPS API              BREVO_API_KEY, ALERT_FROM_EMAIL
  SMS       Africa's Talking             AT_USERNAME, AT_API_KEY (+ AT_SENDER_ID, AT_SANDBOX=1)
  WhatsApp  Meta WhatsApp Cloud API      WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (+ WHATSAPP_TEMPLATE)

A channel without its settings is simply not offered. Each row remembers which
channels already succeeded, so a retry after a WhatsApp outage never sends the
email twice. "Every play" alerts go by email only: SMS and WhatsApp cost money
per message and a busy song is played dozens of times a day.

It runs here rather than on the website because the worker is always on and
already holds the service key. Off unless at least one channel is configured:
without a way to deliver, nothing is queued, so switching a channel on later
doesn't flood anyone with old news.
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
from dataclasses import dataclass, field
from typing import Callable, Protocol

log = logging.getLogger(__name__)

BREVO_API = "https://api.brevo.com/v3/smtp/email"
AT_SMS_API = "https://api.africastalking.com/version1/messaging"
AT_SMS_SANDBOX = "https://api.sandbox.africastalking.com/version1/messaging"
CHANNELS = ("email", "whatsapp", "sms")
DEFAULT_CHANNELS = {"email": True, "whatsapp": False, "sms": False}
PHONE_KINDS_EXCLUDED = {"play"}  # every-play alerts: email only
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
    delivered: dict = field(default_factory=dict)  # channel → "sent" or the last error


@dataclass
class Contact:
    email: str | None
    phone: str | None  # E.164, e.g. +256772123456
    channels: dict = field(default_factory=lambda: dict(DEFAULT_CHANNELS))


class Outbox(Protocol):
    def enqueue(self) -> int: ...
    def enqueue_daily(self) -> int: ...
    def pending(self, limit: int) -> list[Pending]: ...
    def contact_of(self, profile_id: str) -> Contact: ...
    def mark_sent(self, alert_id: str, channels: list[str], delivered: dict) -> None: ...
    def mark_skipped(self, alert_id: str, reason: str) -> None: ...
    def mark_failed(self, alert_id: str, error: str, attempts: int, delivered: dict, sent: list[str]) -> None: ...


Mailer = Callable[[str, str, str, str], None]  # (to, subject, text, html) → raises on failure
TextSender = Callable[[str, str, str], None]  # (phone, title, link) → raises on failure


@dataclass
class Senders:
    email: Mailer | None = None
    whatsapp: TextSender | None = None
    sms: TextSender | None = None

    def names(self) -> list[str]:
        return [c for c in CHANNELS if getattr(self, c)]


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
        q = f"select=id,profile_id,kind,title,body,link,attempts,delivered&sent_at=is.null&order=created_at.asc&limit={limit}"
        rows = json.loads(self._req("GET", f"/rest/v1/alert_outbox?{q}") or b"[]")
        return [Pending(r["id"], r["profile_id"], r["kind"], r["title"], r["body"], r.get("link"), r.get("attempts") or 0,
                        r.get("delivered") or {}) for r in rows]

    def contact_of(self, profile_id: str) -> Contact:
        q = f"select=whatsapp_e164,channels&profile_id=eq.{urllib.parse.quote(profile_id)}"
        rows = json.loads(self._req("GET", f"/rest/v1/alert_prefs?{q}") or b"[]")
        row = rows[0] if rows else {}
        return Contact(self.email_of(profile_id), row.get("whatsapp_e164") or None, {**DEFAULT_CHANNELS, **(row.get("channels") or {})})

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

    def mark_sent(self, alert_id: str, channels: list[str], delivered: dict) -> None:
        self._patch(alert_id, {"sent_at": _now(), "channel": "+".join(channels), "delivered": delivered, "last_error": None})

    def mark_skipped(self, alert_id: str, reason: str) -> None:
        self._patch(alert_id, {"sent_at": _now(), "channel": None, "last_error": reason})

    def mark_failed(self, alert_id: str, error: str, attempts: int, delivered: dict, sent: list[str]) -> None:
        body: dict = {"attempts": attempts, "last_error": error[:300], "delivered": delivered}
        if attempts >= MAX_ATTEMPTS:  # give up, but keep what did go out and why the rest didn't
            body["sent_at"] = _now()
            body["channel"] = "+".join(sent) or None
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


def africastalking_sms(username: str, api_key: str, sender_id: str = "", sandbox: bool = False, timeout: float = 30) -> TextSender:
    """SMS through Africa's Talking (works on all Ugandan networks)."""
    url = AT_SMS_SANDBOX if sandbox else AT_SMS_API

    def send(phone: str, title: str, link: str) -> None:
        form = {"username": username, "to": phone, "message": sms_text(title, link)}
        if sender_id:
            form["from"] = sender_id
        req = urllib.request.Request(url, data=urllib.parse.urlencode(form).encode(), method="POST",
                                     headers={"apiKey": api_key, "Accept": "application/json",
                                              "Content-Type": "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Africa's Talking HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}") from None
        recips = (data.get("SMSMessageData") or {}).get("Recipients") or []
        if not recips:
            raise RuntimeError(f"Africa's Talking: {(data.get('SMSMessageData') or {}).get('Message') or 'message not accepted'}")
        st = recips[0]
        if int(st.get("statusCode", 0)) not in (100, 101, 102):  # processed / sent / queued
            raise RuntimeError(f"Africa's Talking: {st.get('status') or 'rejected'}")
    return send


def whatsapp_cloud(token: str, phone_id: str, template: str = "airplay_alert", lang: str = "en",
                   version: str = "v23.0", timeout: float = 30) -> TextSender:
    """WhatsApp through Meta's Cloud API. Business-started messages must use an approved
    template; ours has two body variables: {{1}} the alert, {{2}} the dashboard link."""
    url = f"https://graph.facebook.com/{version}/{urllib.parse.quote(phone_id)}/messages"

    def send(phone: str, title: str, link: str) -> None:
        params = [{"type": "text", "text": _one_line(title)[:900]}, {"type": "text", "text": link or "eastsound.vercel.app"}]
        payload = {"messaging_product": "whatsapp", "to": phone.lstrip("+"), "type": "template",
                   "template": {"name": template, "language": {"code": lang}, "components": [{"type": "body", "parameters": params}]}}
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                r.read()
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read() or b"{}").get("error", {}).get("message", "")
            except Exception:
                msg = ""
            raise RuntimeError(f"WhatsApp HTTP {e.code}: {msg[:200] or 'rejected'}") from None
    return send


def _one_line(text: str) -> str:
    return " ".join(text.split())


def sms_text(title: str, link: str) -> str:
    """One SMS (160 characters): what happened, then where to look."""
    tail = f" {link}" if link else ""
    room = 160 - len("East Sound: ") - len(tail)
    t = _one_line(title)
    if len(t) > room:
        t = t[: max(0, room - 3)].rstrip() + "..."  # plain dots: "…" would force a 70-character Unicode SMS
    return f"East Sound: {t}{tail}"


def link_of(a: Pending, site_url: str) -> str:
    if not a.link:
        return site_url.rstrip("/")
    base = site_url.rstrip("/")
    return f"{base}{a.link if a.link.startswith('/') else '/' + a.link}" if base else a.link


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


def channels_for(a: Pending, c: Contact, senders: Senders) -> list[str]:
    """The channels this alert should go out on, in order."""
    out = []
    if senders.email and c.email and c.channels.get("email", True):
        out.append("email")
    if c.phone and a.kind not in PHONE_KINDS_EXCLUDED:
        for ch in ("whatsapp", "sms"):
            if getattr(senders, ch) and c.channels.get(ch):
                out.append(ch)
    return out


def drain(box: Outbox, senders: Senders, site_url: str, limit: int = 20) -> Summary:
    """Deliver every pending alert once on each wanted channel. One bad row never stops the rest."""
    s = Summary()
    for a in box.pending(limit):
        try:
            c = box.contact_of(a.profile_id)
            want = channels_for(a, c, senders)
            if not want:
                box.mark_skipped(a.id, "no email address or alert channel switched on" if not c.email else "all alert channels are off")
                s.skipped += 1
                continue
            done = dict(a.delivered or {})
            errors = []
            for ch in want:
                if done.get(ch) == "sent":
                    continue  # already went out on an earlier attempt
                try:
                    if ch == "email":
                        subject, text, body = compose(a, site_url)
                        senders.email(c.email, subject, text, body)
                    else:
                        getattr(senders, ch)(c.phone, a.title, link_of(a, site_url))
                    done[ch] = "sent"
                except Exception as e:
                    done[ch] = (str(e) or "delivery failed")[:150]
                    errors.append(f"{ch}: {done[ch]}")
            sent = [ch for ch in want if done.get(ch) == "sent"]
            if not errors:
                box.mark_sent(a.id, sent, done)
                s.sent += 1
            else:
                s.failed += 1
                log.warning("alert %s (%s) not fully sent: %s", a.id, a.kind, "; ".join(errors))
                box.mark_failed(a.id, "; ".join(errors), a.attempts + 1, done, sent)
        except Exception as e:  # database / network error: retry next round
            s.failed += 1
            log.warning("alert %s (%s) not sent: %s", a.id, a.kind, e)
            try:
                box.mark_failed(a.id, str(e) or "delivery failed", a.attempts + 1, dict(a.delivered or {}),
                                [k for k, v in (a.delivered or {}).items() if v == "sent"])
            except Exception:
                log.debug("could not record the failure for %s", a.id, exc_info=True)
    return s


class AlertSender(threading.Thread):
    """Inside `run`: queue new alerts and deliver them, every `every` seconds."""

    def __init__(self, box: Outbox, send: Senders, site_url: str, stop: threading.Event, every: float = 60,
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
            log.info("alerts: %d queued, %d delivered, %d failed, %d skipped", queued, s.sent, s.failed, s.skipped)
        return s

    def run(self) -> None:
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception as e:
                log.warning("alert round failed: %s", e)
            self.stop.wait(self.every)
