"use client";

import { useEffect, useState } from "react";
import { DEMO_MODE } from "@/lib/auth-context";
import { alertStatus } from "@/lib/alerts/compose";
import { loadAlertPrefs, loadAlertLog, saveAlertPrefs, toE164, type AlertLogRow, type AlertPrefs } from "@/lib/db/shared";
import { cx, safeStorage } from "@/lib/safe";
import { SaveNote, Toggle } from "./ui";

const EVENTS = [
  { id: "firstSpin", label: "First play on a new station", description: "An email the moment a song of yours is played somewhere for the first time." },
  { id: "dailySummary", label: "Daily summary", description: "Every morning at 8: yesterday's plays, by song and station." },
  { id: "everyPlay", label: "Every play", description: "An email each time a song of yours is played. A busy song can mean dozens a day." },
  { id: "chart", label: "Chart movement", description: "Weekly Top 100 entries and position changes." },
  { id: "dispute", label: "Ownership disputes", description: "Someone claims a share of your work." },
  { id: "payout", label: "Royalty statements", description: "A new statement is ready." },
] as const;
const DEFAULTS: AlertPrefs = { phone: "", events: { firstSpin: true, dailySummary: true, everyPlay: false, chart: true, dispute: true, payout: false } };

/** Airplay alert settings (email now, WhatsApp later). Live: saved to your account. Demo: kept in this browser. */
export function WhatsAppAlerts({ scope }: { scope: string }) {
  const key = `est_wa_${scope}`;
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULTS);
  const [save, setSave] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);
  // Delivery history: the honest answer to "did anything actually get sent?".
  const [log, setLog] = useState<AlertLogRow[]>([]);

  useEffect(() => {
    if (DEMO_MODE) {
      setPrefs(safeStorage.get<AlertPrefs>(key, DEFAULTS));
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
        <p className="text-sm text-slate-300">Alerts are emailed to the address you sign in with.</p>
        <label className="label mt-5" htmlFor={`wa-${scope}`}>WhatsApp number <span className="font-normal text-slate-500">(optional)</span></label>
        <input id={`wa-${scope}`} className="input" placeholder="+256 7XX XXX XXX" inputMode="tel"
          value={prefs.phone} onChange={(e) => change({ ...prefs, phone: e.target.value })} />
        <p className="mt-1.5 text-xs text-slate-500">WhatsApp messages are coming later. Save your number now and they'll start automatically.</p>
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
