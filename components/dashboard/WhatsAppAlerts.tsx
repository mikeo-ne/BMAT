"use client";

import { useEffect, useState } from "react";
import { DEMO_MODE } from "@/lib/auth-context";
import { loadAlertPrefs, saveAlertPrefs, toE164, type AlertPrefs } from "@/lib/db/shared";
import { safeStorage } from "@/lib/safe";
import { SaveNote, Toggle } from "./ui";

const EVENTS = [
  { id: "firstSpin", label: "First spin on a new station", description: "A track of yours is detected somewhere for the first time." },
  { id: "chart", label: "Chart movement", description: "Weekly Top 100 entries and position changes." },
  { id: "dispute", label: "Ownership disputes", description: "Someone claims a share of your work." },
  { id: "payout", label: "Royalty statements", description: "A new statement is ready." },
] as const;
const DEFAULTS: AlertPrefs = { phone: "", events: { firstSpin: true, chart: true, dispute: true, payout: false } };

/** WhatsApp alert settings. Live: saved to your account. Demo: kept in this browser. */
export function WhatsAppAlerts({ scope }: { scope: string }) {
  const key = `est_wa_${scope}`;
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULTS);
  const [save, setSave] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (DEMO_MODE) {
      setPrefs(safeStorage.get<AlertPrefs>(key, DEFAULTS));
      return;
    }
    loadAlertPrefs().then((p) => p && setPrefs(p)).catch(() => setSave({ kind: "error", msg: "Couldn't load your alert settings." }));
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
        <label className="label" htmlFor={`wa-${scope}`}>WhatsApp number</label>
        <input id={`wa-${scope}`} className="input" placeholder="+256 7XX XXX XXX" inputMode="tel"
          value={prefs.phone} onChange={(e) => change({ ...prefs, phone: e.target.value })} />
        <p className="mt-1.5 text-xs text-slate-500">Your choices are saved now; messages start once WhatsApp delivery is switched on for East Sound.</p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className="btn-primary !py-2" onClick={onSave} disabled={!dirty || save.kind === "saving"}>Save alerts</button>
          <SaveNote state={save} />
        </div>
      </div>
      <div className="divide-y divide-slate-800">
        {EVENTS.map((ev) => (
          <Toggle key={ev.id} label={ev.label} description={ev.description} checked={Boolean(prefs.events?.[ev.id])}
            onChange={(v) => change({ ...prefs, events: { ...prefs.events, [ev.id]: v } })} />
        ))}
      </div>
    </div>
  );
}
