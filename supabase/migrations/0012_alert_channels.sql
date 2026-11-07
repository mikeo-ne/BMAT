-- ── Airplay alerts on WhatsApp and SMS, not just email ─────────────────────
-- Each person picks their channels; the mobile number already saved for
-- WhatsApp (alert_prefs.whatsapp_e164) is used for SMS too. Email stays on by
-- default; WhatsApp and SMS are opt-in.
alter table public.alert_prefs
  add column if not exists channels jsonb not null default '{"email": true, "whatsapp": false, "sms": false}'::jsonb;

-- One outbox row per alert, delivered on several channels. `delivered` keeps
-- each channel's result ("sent" or the last error), so a retry after one
-- channel fails never sends the others twice. `channel` lists what went out,
-- e.g. 'email+sms'.
alter table public.alert_outbox add column if not exists delivered jsonb not null default '{}'::jsonb;
alter table public.alert_outbox drop constraint if exists alert_outbox_channel_check;
alter table public.alert_outbox add constraint alert_outbox_channel_check
  check (channel is null or channel ~ '^(email|whatsapp|sms)(\+(email|whatsapp|sms))*$');
