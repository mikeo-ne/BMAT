# Airplay alerts: email, WhatsApp and SMS

The monitoring worker sends every alert (first play on a new station, the 8 am
daily summary, and — by email only — every play) on each channel the person
switched on under **Alerts** in their dashboard. A channel works once its
settings are added to the worker (Railway service *BMAT*, or `/etc/eastsound/worker.env`
on your own server) and the worker is redeployed/restarted.

| Channel | Provider | Worker settings |
|---|---|---|
| Email | Brevo (already working) | `BREVO_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_FROM_NAME` |
| SMS | Africa's Talking | `AT_USERNAME`, `AT_API_KEY`, optional `AT_SENDER_ID`, `AT_SANDBOX=1` for testing |
| WhatsApp | Meta WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, optional `WHATSAPP_TEMPLATE` (default `airplay_alert`), `WHATSAPP_LANG` (default `en`) |

The worker log says which channels are on: `airplay alerts: email + whatsapp + sms`.

## SMS — Africa's Talking

1. Sign up at africastalking.com and create a **team and an app** with country **Uganda**.
2. In the app: **Settings → API Key → Generate**. Copy it once.
3. The **username** is the app's username shown on the app dashboard (not your email).
4. **Top up** the app wallet (airtime / mobile money). Each SMS costs a few dozen shillings.
5. Optional: **SMS → Alphanumerics → Request** a sender ID such as `EASTSOUND`. Until it is approved,
   leave `AT_SENDER_ID` empty and messages come from a shared short code.
6. Add `AT_USERNAME` and `AT_API_KEY` to the worker and redeploy.

To test without spending: use the **sandbox** app (username `sandbox`, its own API key), set
`AT_SANDBOX=1`, and watch messages arrive in the Africa's Talking simulator.

## WhatsApp — Meta WhatsApp Cloud API

1. At business.facebook.com create (or use) a **Meta Business** account for 7H Music Group.
2. At developers.facebook.com: **Create app → Business → add the WhatsApp product**.
3. **WhatsApp → API Setup**: add and verify the phone number East Sound will send from
   (a number not already used on the WhatsApp app). Copy its **Phone number ID** → `WHATSAPP_PHONE_ID`.
4. Create a **permanent token**: Business settings → Users → **System users** → add an admin
   system user → *Generate token* for the app with `whatsapp_business_messaging` and
   `whatsapp_business_management` → `WHATSAPP_TOKEN`. (The 24-hour test token stops working the next day.)
5. **WhatsApp Manager → Message templates → Create**:
   - Category **Utility**, name **`airplay_alert`**, language **English**
   - Body: `East Sound airplay alert: {{1}}. See the details on your dashboard: {{2}}`
   - Samples: `{{1}}` = `First play on KFM 93.3: My Way`, `{{2}}` = `https://eastsound.vercel.app/dashboard/artist`
   - Submit; approval usually takes minutes to a day.
6. Add a payment method in WhatsApp Manager (business-started messages are charged per message).
7. Add `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID` to the worker and redeploy.

## How delivery behaves

- People choose **Email / WhatsApp / SMS** and save a Ugandan mobile number. Email is on by default.
- **Every play** alerts go by **email only** — SMS and WhatsApp cost per message.
- Each alert remembers which channels already went out, so a retry after (say) a WhatsApp outage
  never sends the email or SMS twice. After 5 failed attempts it stops and the dashboard shows
  e.g. *Sent by email — not by WhatsApp*.
- Alerts are sent only by the worker. The old website cron (`/api/cron/alerts`) and its GitHub
  Action are retired; don't schedule them again or people get messages twice.
