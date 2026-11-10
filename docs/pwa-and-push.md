# Installable app and phone notifications

_Written 10 November 2026._

SongBoost's real advantage is not features — it is that it lives on the home screen and buzzes when a song
plays. Most of that advantage is a web app manifest, a service worker and web push. This is what shipped and
what is still deliberately off.

## Installable app (live, no configuration needed)

| Piece | Where | What it does |
| --- | --- | --- |
| Manifest | `app/manifest.ts` | name, icons, standalone display, shortcuts (Charts, Dashboard, Coverage) |
| Icons | `app/api/pwa-icon/route.tsx` | PNG 192/512 + maskable, generated with `next/og` — no binary assets to keep in sync |
| Service worker | `public/sw.js` | app-shell cache, offline fallback, `push` + `notificationclick` handlers |
| Offline page | `app/offline/page.tsx` | says "no connection", never shows a stale chart as if live |
| Install UI | `components/PwaInstall.tsx` | Chrome: our own Install button; iOS: Share → Add to Home Screen hint; dismissal remembered |
| Registration | `components/PwaRegister.tsx` | registers `/sw.js` in production only (a caching worker in front of `next dev` hides hot reloads) |

Verified locally: `/manifest.webmanifest` serves the manifest, `/api/pwa-icon?size=192` returns a PNG,
`/offline` renders, and the worker registers on first production load.

## Push notifications (built, switched off until keys exist)

A notification needs VAPID keys **and** a `CRON_SECRET`. Without them the UI says so instead of failing
silently.

### What a person does

Sign in → sidebar → **Alerts on this phone** → *Enable phone notifications*. The browser asks permission, the
subscription is written to `push_subscriptions` (RLS: `profile_id = auth.uid()`, so only your own devices),
and a preview notification proves the channel works end to end.

### What an operator does

1. Generate the keys once (Node):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Add to Vercel (and `.env.local` for local testing):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public key (safe to expose) |
   | `VAPID_PRIVATE_KEY` | private key — server only |
   | `VAPID_SUBJECT` | `mailto:alerts@eastsound.ug` |
   | `CRON_SECRET` | already used by the alert sender |

3. Send:

   ```bash
   curl -X POST https://eastsound.vercel.app/api/push/send \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H "content-type: application/json" \
     -d '{"title":"First spin","body":"Kampala Nights on Capital FM","url":"/dashboard"}'
   ```

   The response reports `subscriptions`, `sent`, `removed` and `failed`. Subscriptions answering `404`/`410`
   are deleted; other failures increment `failures` on the row so a broken device stops being retried blind.

### What is *not* wired yet

Alert **rules** still run in the Python worker (`alert_outbox` → email/WhatsApp/SMS). Push is currently a
transport with a manual trigger. Connecting the same rules — first spin, chart move, dispute opened — to this
endpoint is the next step; it needs a sender that reads the outbox and a decision about which events deserve
a buzz. Saying "push works" today would be a lie; saying "the phone can be notified, and the plumbing is
tested" is accurate.

## Privacy and limits

- A subscription is a URL plus two keys, stored against a profile. Deleting the profile deletes the devices.
- Turning notifications off unsubscribes and removes the row.
- iOS requires 16.4+ and the app to be installed before push is offered; on older iOS the toggle stays hidden.
- The service worker never caches `/dashboard` or `/api/*` — live numbers must not be served from cache.

## Tests

- `tests/pwa.test.ts` — install-state branching (Chrome vs iOS vs desktop), subscription-row validation,
  VAPID base64 decoding.
- `tests/push-send.test.ts` — config gates (no secret, wrong secret, no VAPID, missing payload), fan-out,
  410 cleanup, failure bookkeeping, and a read error never reported as success.
