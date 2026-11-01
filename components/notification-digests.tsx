"use client";
import { useState } from "react";
import { Download, FileText, Mail, Sunrise } from "lucide-react";
import {
  buildAirplayDigest,
  renderDigestPdf,
  type DigestKind,
} from "@/lib/notification-digests";
import { formatDate, formatNumber } from "@/lib/format";
import type { BroadcastSpin } from "@/lib/playout";
import type { Track } from "@/lib/types";
import type { NotificationPreferences } from "@/lib/notifications";

export function NotificationDigests({
  history,
  catalogue,
  config,
  now,
  onConfigure,
}: {
  history: BroadcastSpin[];
  catalogue: Track[];
  config: NotificationPreferences;
  now: string;
  onConfigure: () => void;
}) {
  const [kind, setKind] = useState<DigestKind>("daily");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const digest = buildAirplayDigest(history, catalogue, kind, new Date(now));
  async function exportPdf() {
    setBusy(true);
    setNotice(null);
    try {
      const bytes = await renderDigestPdf(digest);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `east-sound-${digest.kind}-airplay-${digest.endDay}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        `Downloaded ${digest.kind} PDF for ${digest.startDay} to ${digest.endDay}, in East Africa Time.`,
      );
    } catch {
      setNotice("The PDF could not be generated. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-5"
      aria-labelledby="digests-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">THE BIGGER PICTURE</p>
          <h2 id="digests-heading" className="mt-1 text-lg font-semibold">
            Your airplay, in perspective.
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Morning recaps and regional trend breakdowns from captured
            records—not fabricated listening figures.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost !text-xs"
          onClick={onConfigure}
        >
          <Mail size={14} />
          Digest settings
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            {
              id: "daily",
              title: "Daily morning recap",
              description:
                "Yesterday’s plays, top station and unmatched flags.",
              icon: Sunrise,
            },
            {
              id: "weekly",
              title: "Weekly regional trends",
              description:
                "Seven completed EAT days, with a prior-period comparison.",
              icon: FileText,
            },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={kind === item.id}
            className={`panel p-5 text-left ${kind === item.id ? "!border-brand ring-1 ring-brand/10" : ""}`}
            onClick={() => {
              setKind(item.id);
              setNotice(null);
            }}
          >
            <item.icon size={20} className="text-brand" />
            <span className="mt-3 block text-sm font-semibold">
              {item.title}
            </span>
            <span className="mt-1 block text-[11px] leading-relaxed text-muted">
              {item.description}
            </span>
          </button>
        ))}
      </div>
      <div className="panel min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
              {kind === "daily" ? "DAILY DIGEST" : "WEEKLY DIGEST"} · EAT
            </p>
            <h3 className="mt-1 text-sm font-semibold">
              {formatDate(digest.startDay)}
              {digest.startDay !== digest.endDay &&
                ` — ${formatDate(digest.endDay)}`}
            </h3>
            <p className="mt-1 text-[10px] text-muted">
              Previous completed reporting period · no partial day
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary !text-xs"
            disabled={busy}
            onClick={() => void exportPdf()}
          >
            <Download size={14} />
            {busy ? "Generating PDF…" : "Export digest PDF"}
          </button>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Captured audit records", digest.totalAudited],
            ["Matched music plays", digest.matched],
            ["Unmatched audio flags", digest.unmatched],
            ["Reporting stations", digest.stations],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-line bg-surface-2/40 p-3"
            >
              <dt className="text-[10px] text-muted">{label}</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">
                {formatNumber(Number(value))}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold">
              Regional breakdown · matched plays
            </h4>
            <ul className="mt-3 space-y-2">
              {digest.regions.map((row) => (
                <li
                  key={row.region}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-xs"
                >
                  <span>{row.region}</span>
                  <span className="ml-auto font-mono font-medium">
                    {row.spins}
                  </span>
                  <span className="w-28 text-right text-[10px] text-muted">
                    {row.change === null
                      ? "No prior baseline"
                      : `${row.change > 0 ? "+" : ""}${(row.change * 100).toFixed(1)}% vs prior`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold">Leading recordings</h4>
            {digest.tracks.length ? (
              <ol className="mt-3 space-y-2">
                {digest.tracks.slice(0, 5).map((track) => (
                  <li
                    key={track.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-line p-3"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">
                        {track.title}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted">
                        {track.artist}
                      </span>
                    </span>
                    <span className="font-mono text-xs">{track.spins}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-line p-6 text-xs leading-relaxed text-muted">
                No matched capture records in this period. Connect a
                broadcast/capture integration to populate this digest. Public
                streaming availability is not proof of radio airplay.
              </p>
            )}
            <p className="mt-3 text-[11px] text-muted">
              Top station:{" "}
              <strong className="font-medium text-foreground">
                {digest.topStation?.name ?? "Awaiting capture records"}
              </strong>
            </p>
          </div>
        </div>
        <p className="mt-5 border-t border-line pt-4 text-[10px] leading-relaxed text-muted">
          {digest.notice}
        </p>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-brand/20 bg-brand/5 p-3 text-xs text-brand"
        >
          {notice}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-muted">
        Schedule: {String(config.email.hour).padStart(2, "0")}:00 EAT ·{" "}
        {config.email.daily ? "daily recap enabled" : "daily recap paused"} ·{" "}
        {config.email.weekly ? "weekly digest enabled" : "weekly digest paused"}
        . Automatic email requires the server-side provider and scheduled
        worker. PDF export works without either.
      </p>
    </section>
  );
}
