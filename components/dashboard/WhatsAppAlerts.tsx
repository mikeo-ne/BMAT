"use client";

import { useEffect, useState } from "react";
import { DEMO_MODE } from "@/lib/auth-context";
import { alertStatus } from "@/lib/alerts/compose";
import { DEFAULT_CHANNELS, loadAlertPrefs, loadAlertLog, saveAlertPrefs, toE164, type AlertChannels, type AlertLogRow, type AlertPrefs } from "@/lib/db/shared";
import { cx, safeStorage } from "@/lib/safe";
import { SaveNote, Toggle } from "./ui";

const EVENTS = [
  { id: "firstSpin", label: "First play on a new station", description: "The moment a song of yours is played somewhere for the first time." },
  { id: "dailySummary", label: "Daily summary", description: "Every morning at 8: yesterday's plays, by song and station." },
  { id: "everyPlay", label: "Every play", description: "Each time a song of yours is played. Email only: a busy song can mean dozens a day." },
  { id: "chart", label: "Chart movement", description: "Weekly Top 100 entries and position changes." },
  { id: "dispute", label: "Ownership disputes", description: "Someone claims a share of your work." },
  { id: "payout", label: "Royalty statements", description: "A new statement is ready." },
] as const;
const DEFAULTS: AlertPrefs = { phone: "", events: { firstSpin: true, dailySummary: true, everyPlay: false, chart: true, dispute: true, payout: false }, channels: DEFAULT_CHANNELS };
const CHANNELS: { id: keyof AlertChannels; label: string; description: string }[] = [
  { id: "email", label: "Email", description: "To the address you sign in with." },
  { id: "whatsapp", label: "WhatsApp", description: "A short message with a link to your dashboard." },
  { id: "sms", label: "SMS", description: "A text message, for phones without data." },
];

/** Airplay alert settings: email, WhatsApp and SMS. Live: saved to your account. Demo: kept in this browser. */
export function WhatsAppAlerts({ scope }: { scope: string }) {
  const key = `est_wa_${scope}`;
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULTS);
  const [save, setSave] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);
  // Delivery history: the honest answer to "did anything actually get sent?".
  const [log, setLog] = useState<AlertLogRow[]>([]);

  useEffect(() => {
    if (DEMO_MODE) {
      const saved = safeStorage.get<AlertPrefs>(key, DEFAULTS);
      setPrefs({ ...DEFAULTS, ...saved, channels: { ...DEFAULT_CHANNELS, ...saved.channels } });
      return;
    }
    loadAlertPrefs().then((p) => p && setPrefs(p)).catch(() => setSave({ kind: "error", msg: "Couldn't load your alert settings." }));
    loadAlertLog().then((rows) => rows && setLog(rows)).catch(() => setLog([]));
  }, [key]);

  const change = (next: AlertPrefs) => {
    setPrefs(next);
    setDirty(true);
    setSave({ kind: "idle" });
  };

  const onSave = async () => {
    if (prefs.phone.trim() && !toE164(prefs.phone)) {
      setSave({ kind: "error", msg: "Use a Ugandan mobile number, e.g. +256 772 123 456." });
      return;
    }
    if ((prefs.channels.whatsapp || prefs.channels.sms) && !prefs.phone.trim()) {
      setSave({ kind: "error", msg: "Add your mobile number to get WhatsApp or SMS alerts." });
      return;
    }
    setSave({ kind: "saving" });
    try {
      if (DEMO_MODE) safeStorage.set(key, prefs);
      else await saveAlertPrefs(prefs);
      setDirty(false);
      setSave({ kind: "saved" });
    } catch (e) {
      setSave({ kind: "error", msg: e instanceof Error ? e.message : "Couldn't save." });
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-slate-500">Send my alerts by</p>
        <div className="mt-1 divide-y divide-slate-800">
          {CHANNELS.map((c) => (
            <Toggle key={c.id} label={c.label} description={c.description} checked={Boolean(prefs.channels?.[c.id])}
              onChange={(v) => change({ ...prefs, channels: { ...DEFAULT_CHANNELS, ...prefs.channels, [c.id]: v } })} />
          ))}
        </div>
        <label className="label mt-5" htmlFor={`wa-${scope}`}>Mobile number <span className="font-normal text-slate-500">(for WhatsApp and SMS)</span></label>
        <input id={`wa-${scope}`} className="input" placeholder="+256 7XX XXX XXX" inputMode="tel" autoComplete="tel"
          value={prefs.phone} onChange={(e) => change({ ...prefs, phone: e.target.value })} />
        <p className="mt-1.5 text-xs text-slate-500">A Ugandan mobile number. Every-play alerts always go by email only.</p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className="btn-primary !py-2" onClick={onSave} disabled={!dirty || save.kind === "saving"}>Save alerts</button>
          <SaveNote state={save} />
        </div>
      </div>
      <div>
        <div className="divide-y divide-slate-800">
        {EVENTS.map((ev) => (
          <Toggle key={ev.id} label={ev.label} description={ev.description} checked={Boolean(prefs.events?.[ev.id])}
            onChange={(v) => change({ ...prefs, events: { ...prefs.events, [ev.id]: v } })} />
        ))}
        </div>
        {!DEMO_MODE && (
          <div className="mt-6">
            <p className="font-mono text-xs uppercase tracking-widest text-slate-500">Recent alerts</p>
            {log.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing yet. Your first alert arrives after a song of yours is played.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-800 text-sm">
                {log.map((row) => {
                  const status = alertStatus(row);
                  return (
                    <li key={row.id} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-slate-200">{row.title}</span>
                        <span className="text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</span>
                      </span>
                      <span className={cx("shrink-0 text-xs", status.tone === "sent" ? "text-emerald-400" : status.tone === "failed" ? "text-rose-400" : "text-slate-400")}>
                        {status.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
