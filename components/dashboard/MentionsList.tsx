"use client";

import type { ReactNode } from "react";
import { evidenceUrl, fmtTime } from "@/lib/db/core";
import { DEMO_MODE } from "@/lib/auth-context";
import { mentionCounts, type Mention } from "@/lib/mentions";
import { cx, safeArray } from "@/lib/safe";
import { Badge } from "./ui";
import { EvidencePlayer } from "@/components/site/EvidencePlayer";

const STATUS: Record<Mention["status"], { tone: "ok" | "warn" | "bad"; label: string }> = {
  unreviewed: { tone: "warn", label: "To review" },
  confirmed: { tone: "ok", label: "Confirmed" },
  rejected: { tone: "bad", label: "Not a mention" },
};

/** Brand mentions list: per-brand totals, then each mention with its words and 15 s clip. */
export function MentionsList({ mentions, actions, empty }: {
  mentions: Mention[];
  actions?: (m: Mention) => ReactNode;
  empty: string;
}) {
  const list = safeArray(mentions);
  const counts = mentionCounts(list);
  return (
    <div className="space-y-4">
      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Mentions per brand">
          {counts.map((c) => (
            <span key={c.brand} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-sm">
              <span className="text-white">{c.brand}</span> <span className="font-mono text-emerald-300">{c.count}</span>
            </span>
          ))}
        </div>
      )}
      {list.length === 0 && <p className="text-sm text-slate-500">{empty}</p>}
      <ul className="divide-y divide-slate-800/70">
        {list.map((m) => (
          <li key={m.id} className={cx("flex flex-wrap items-start gap-3 py-3", m.status === "rejected" && "opacity-50")}>
            <EvidencePlayer seed={Number(m.id.replace(/\D/g, "")) || 7} size="sm" label={`${m.brand} on ${m.station}`}
              resolveUrl={!DEMO_MODE ? () => evidenceUrl(m.evidencePath) : undefined} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-semibold text-white">{m.brand}</span>
                <span className="text-slate-500"> · {m.station} · {fmtTime(m.heardAt, true)}</span>
              </p>
              <p className="mt-0.5 text-sm text-slate-400">“{highlight(m.transcript, m.heard)}”</p>
            </div>
            <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
            {actions?.(m)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Emphasise the matched words inside the transcript (case-insensitive, first match). */
function highlight(text: string, heard: string): ReactNode {
  const words = heard.split(/\s+/).filter(Boolean);
  if (!words.length) return text;
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s.,'-]*"), "i");
  const hit = pattern.exec(text);
  if (!hit) return text;
  return (
    <>
      {text.slice(0, hit.index)}
      <mark className="rounded bg-emerald-400/20 px-0.5 text-emerald-200">{hit[0]}</mark>
      {text.slice(hit.index + hit[0].length)}
    </>
  );
}
