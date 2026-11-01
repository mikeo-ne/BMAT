"use client";
import { useAuth } from "@/components/auth-provider";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Headphones, Music2 } from "lucide-react";
import { EvidenceModal } from "@/components/evidence-modal";
import { eatDate, eatTime, type BroadcastSpin } from "@/lib/playout";
import { initials } from "@/lib/format";

export function RecentSpins({
  events,
  limit = 5,
}: {
  events: BroadcastSpin[];
  limit?: number;
}) {
  const role = useAuth().session.user?.role ?? "public";
  const destination =
    role === "artist"
      ? {
          href: "/dashboard/analytics/regional",
          label: "View regional analytics",
        }
      : role === "cmo"
        ? { href: "/dashboard/cmo", label: "View audit ledger" }
        : role === "broadcaster"
          ? { href: "/dashboard/playout", label: "View playout log" }
          : { href: "/dashboard/charts", label: "View public charts" };
  const [evidence, setEvidence] = useState<BroadcastSpin | null>(null);
  return (
    <section
      className="panel overflow-hidden"
      aria-labelledby="recent-spins-heading"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="eyebrow">ON THE AIR</p>
          <h3 id="recent-spins-heading" className="mt-1 text-sm font-semibold">
            Recent playout activity
          </h3>
        </div>
        <Link
          href={destination.href}
          className="flex items-center gap-1 text-[10px] font-medium text-brand"
        >
          {destination.label}
          <ArrowUpRight size={13} />
        </Link>
      </header>
      <ol className="divide-y divide-line/70">
        {events.slice(0, limit).map((event) => (
          <li
            key={event.id}
            className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/40"
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold ${event.trackId ? "bg-brand/10 text-brand" : "bg-rose-400/10 text-rose-300"}`}
            >
              {event.primaryArtist ? (
                initials(event.primaryArtist)
              ) : (
                <Music2 size={17} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {event.title ?? "Unidentified audio"}
                <span className="ml-2 hidden text-[10px] font-normal text-muted sm:inline">
                  {event.primaryArtist ?? "Needs review"}
                </span>
              </p>
              <p className="mt-1 truncate text-[10px] text-muted">
                {event.stationName} · {event.region} · {event.medium}
                <span className="ml-2">
                  {eatDate(event.detectedAt).slice(5)} ·{" "}
                  {eatTime(event.detectedAt)} EAT
                </span>
              </p>
            </div>
            <span
              className={`hidden rounded-full px-2 py-0.5 text-[9px] sm:block ${event.trackId ? "bg-brand/5 text-brand" : "bg-rose-400/10 text-rose-300"}`}
            >
              {event.trackId
                ? event.source === "captured"
                  ? "Matched · capture"
                  : "Matched · test"
                : "Unmatched"}
            </span>
            <button
              type="button"
              className="icon-btn border-line"
              aria-label={`Listen to 10-second snippet for ${event.title ?? "unidentified audio"} on ${event.stationName}`}
              disabled={event.source === "captured" && !event.evidence}
              title={
                event.evidence
                  ? "Open ten-second capture"
                  : "No captured clip attached"
              }
              onClick={() => setEvidence(event)}
            >
              <Headphones size={15} />
            </button>
          </li>
        ))}
      </ol>
      {!events.length && (
        <p className="p-10 text-center text-xs text-muted">
          No playout activity in this selection.
        </p>
      )}
      {evidence && (
        <EvidenceModal
          key={evidence.id}
          spin={evidence}
          onClose={() => setEvidence(null)}
        />
      )}
    </section>
  );
}
