"use client";
import { CapturedFeedNotice } from "@/components/captured-feed-notice";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Headphones,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { AirplayKpis } from "@/components/airplay-kpis";
import { ComplianceExport } from "@/components/compliance-export";
import { EvidenceModal } from "@/components/evidence-modal";
import { PageIntro } from "@/components/page-intro";
import { WeightingControls } from "@/components/weighting-controls";
import { priceSpin } from "@/lib/compliance";
import {
  DEFAULT_WEIGHTING,
  FLAT_WEIGHTING,
  TIME_BAND_META,
  type WeightingPolicy,
} from "@/lib/dayparts";
import { formatDuration, formatNumber } from "@/lib/format";
import {
  eatDate,
  eatTime,
  filterBroadcastLog,
  type BroadcastSpin,
  type PlayoutFilters,
} from "@/lib/playout";
import { currentCapturedWindow } from "@/lib/captured-airplay";
import { useCapturedFeed } from "@/lib/use-captured-feed";
import { REGIONS } from "@/lib/regions";
import type { Track } from "@/lib/types";
const PAGE_SIZE = 25;

export function PlayoutLog({
  catalogue,
  now,
  initialEvents = [],
  canPoll = false,
}: {
  catalogue: Track[];
  now: string;
  initialEvents?: BroadcastSpin[];
  canPoll?: boolean;
}) {
  const feed = useCapturedFeed(initialEvents, now, canPoll);
  const allEvents = useMemo(
    () => currentCapturedWindow(feed.events, new Date(feed.now)),
    [feed.events, feed.now],
  );
  const [filters, setFilters] = useState<PlayoutFilters>({
    days: 14,
    status: "all",
    region: "All",
    medium: "All",
  });
  const [page, setPage] = useState(0);
  const [evidence, setEvidence] = useState<BroadcastSpin | null>(null);
  const [policy, setPolicy] = useState<WeightingPolicy>(DEFAULT_WEIGHTING);
  const [weighted, setWeighted] = useState(true);
  const [notice, setNotice] = useState(false);
  const events = useMemo(
    () => filterBroadcastLog(allEvents, filters),
    [allEvents, filters],
  );
  const stations = useMemo(
    () =>
      [
        ...new Map(
          allEvents.map((event) => [event.stationId, event.stationName]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [allEvents],
  );
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(events.length / PAGE_SIZE) - 1),
  );
  const visible = events.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );
  const effective = weighted ? policy : FLAT_WEIGHTING;
  function patch(next: Partial<PlayoutFilters>) {
    setFilters((previous) => ({ ...previous, ...next }));
    setPage(0);
    setNotice(false);
  }
  function snippet(event: BroadcastSpin) {
    return (
      <button
        type="button"
        className="btn btn-ghost !gap-1.5 !px-2.5 !py-2 !text-[10px]"
        disabled={event.source === "captured" && !event.evidence}
        title={
          event.evidence
            ? "Open ten-second capture"
            : "No captured clip attached"
        }
        onClick={() => setEvidence(event)}
        aria-label={`Audible evidence snippet for ${event.title ?? "unidentified audio"} on ${event.stationName} at ${eatTime(event.detectedAt)}`}
      >
        <Headphones size={13} />
        10s excerpt
      </button>
    );
  }
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <PageIntro
        eyebrow="BROADCASTER PLAYOUT LOG"
        title="Every spin. An open record."
        description="Explore the FM and TV panel, inspect a logged play, and prepare your station report. Only authenticated capture records appear here. Missing captures, matches and audio evidence are never filled with simulated artist activity."
        actions={
          <Link
            href="/dashboard/monitoring"
            className="btn btn-primary !text-xs"
          >
            <Radio size={14} />
            Open station monitor
          </Link>
        }
      />
      <AirplayKpis catalogue={catalogue} events={events} />
      <CapturedFeedNotice unavailable={feed.unavailable} now={feed.now} />
      <section className="panel p-4 sm:p-5" aria-label="Playout log filters">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Find a playout</h3>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[10px] text-brand"
            onClick={() => {
              setFilters({
                days: 14,
                status: "all",
                region: "All",
                medium: "All",
              });
              setPage(0);
              setNotice(false);
            }}
          >
            <RotateCcw size={12} />
            Reset filters
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <label className="col-span-2 lg:col-span-2">
            <span className="label !text-[10px]">
              Search title, artist, ISRC or station
            </span>
            <span className="relative block">
              <Search size={14} className="absolute left-3 top-3 text-muted" />
              <input
                className="field !bg-surface !pl-9 !text-xs"
                placeholder="Search the broadcast log…"
                value={filters.query ?? ""}
                onChange={(event) => patch({ query: event.target.value })}
              />
            </span>
          </label>
          <label>
            <span className="label !text-[10px]">Station</span>
            <select
              aria-label="Station"
              className="field !bg-surface !text-xs"
              value={filters.stationId ?? ""}
              onChange={(event) => patch({ stationId: event.target.value })}
            >
              <option value="">All stations</option>
              {stations.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label !text-[10px]">Region</span>
            <select
              aria-label="Region"
              className="field !bg-surface !text-xs"
              value={filters.region}
              onChange={(event) =>
                patch({
                  region: event.target.value as PlayoutFilters["region"],
                })
              }
            >
              <option value="All">All regions</option>
              {REGIONS.map((region) => (
                <option key={region}>{region}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label !text-[10px]">Medium</span>
            <select
              aria-label="Medium"
              className="field !bg-surface !text-xs"
              value={filters.medium}
              onChange={(event) =>
                patch({
                  medium: event.target.value as PlayoutFilters["medium"],
                })
              }
            >
              <option value="All">FM + TV</option>
              <option value="FM">FM radio</option>
              <option value="TV">Television</option>
            </select>
          </label>
          <label>
            <span className="label !text-[10px]">Reporting window</span>
            <select
              aria-label="Reporting window"
              className="field !bg-surface !text-xs"
              value={filters.days}
              onChange={(event) =>
                patch({ days: Number(event.target.value) as 7 | 14 })
              }
            >
              <option value={14}>Last 14 days</option>
              <option value={7}>Last 7 days</option>
            </select>
          </label>
        </div>
        <div
          className="mt-4 flex items-center gap-1 border-t border-line pt-3"
          aria-label="Match status"
        >
          {(
            [
              { id: "all", label: "All playout" },
              { id: "matched", label: "Matched" },
              { id: "unmatched", label: "Unmatched" },
            ] as const
          ).map((status) => (
            <button
              type="button"
              key={status.id}
              aria-pressed={filters.status === status.id}
              className={`rounded-lg px-3 py-1.5 text-[10px] ${filters.status === status.id ? "bg-brand/10 font-medium text-brand" : "text-muted hover:bg-surface-2"}`}
              onClick={() => patch({ status: status.id })}
            >
              {status.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted">
            {formatNumber(events.length)} records
          </span>
        </div>
      </section>
      <section
        className="panel overflow-hidden"
        aria-labelledby="playout-log-heading"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 id="playout-log-heading" className="text-sm font-semibold">
              Audited playout records
            </h3>
            <p className="mt-1 text-[10px] text-muted">
              Newest first · timestamps in EAT · ten-second excerpts are
              available only when attached by the capture provider
            </p>
          </div>
          <ShieldCheck size={18} className="hidden text-brand sm:block" />
        </header>
        {!events.length ? (
          <div className="p-14 text-center">
            <Search size={25} className="mx-auto mb-3 text-muted/50" />
            <h4 className="text-sm font-medium">
              No playout matches this view
            </h4>
            <p className="mt-2 text-xs text-muted">
              Broaden the region, station, status or reporting window.
            </p>
          </div>
        ) : (
          <>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="w-full min-w-[800px] border-collapse text-left text-xs">
                <caption className="sr-only">
                  Simulated Uganda FM and TV playout log
                </caption>
                <thead>
                  <tr className="border-b border-line bg-surface-2/60 text-[9px] uppercase tracking-wider text-muted">
                    {[
                      "Time (EAT)",
                      "Recording",
                      "Station",
                      "Status",
                      "Time weight",
                      "Audio",
                    ].map((label) => (
                      <th
                        scope="col"
                        key={label}
                        className="px-4 py-3 font-medium first:pl-5"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {visible.map((event) => {
                    const priced = priceSpin(event, effective);
                    return (
                      <tr
                        key={event.id}
                        className="transition-colors hover:bg-surface-2/40"
                      >
                        <td className="whitespace-nowrap py-3.5 pl-5 pr-4">
                          <p className="font-mono text-[11px]">
                            {eatTime(event.detectedAt)}
                          </p>
                          <p className="mt-1 text-[9px] text-muted">
                            {eatDate(event.detectedAt)}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3.5">
                          <p className="truncate font-medium">
                            {event.title ?? "Unidentified audio"}
                          </p>
                          <p className="mt-1 truncate text-[10px] text-muted">
                            {event.primaryArtist ??
                              "Needs catalogue identification"}
                          </p>
                          <p className="mt-1 font-mono text-[9px] text-muted">
                            {event.trackId ?? "No ISRC"} ·{" "}
                            {formatDuration(event.durationSec)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium">{event.stationName}</p>
                          <p className="mt-1 text-[10px] text-muted">
                            {event.region} · {event.medium}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-1 text-[9px] ${event.trackId ? "bg-brand/7 text-brand" : "bg-[#f6edf1] text-[#a06981]"}`}
                          >
                            {event.trackId
                              ? event.source === "captured"
                                ? "Matched · capture"
                                : "Matched · test"
                              : "Unmatched"}
                          </span>
                          <p className="mt-2 text-[9px] text-muted">
                            {(event.confidence * 100).toFixed(1)}%{" "}
                            {event.source === "captured"
                              ? "provider confidence"
                              : "test fixture"}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-[10px] font-medium">
                            {TIME_BAND_META[priced.timeBand].label} ×
                            {priced.multiplier}
                          </p>
                          <p className="mt-1 text-[9px] text-muted">
                            UGX {priced.allocationUgx.toLocaleString()} est.
                          </p>
                        </td>
                        <td className="px-4 py-3.5">{snippet(event)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ol className="divide-y divide-line md:hidden">
              {visible.map((event) => (
                <li key={event.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">
                        {event.title ?? "Unidentified audio"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted">
                        {event.primaryArtist ?? "Needs identification"} ·{" "}
                        {event.stationName}
                      </p>
                      <p className="mt-1 text-[10px] text-muted">
                        {eatDate(event.detectedAt)} ·{" "}
                        {eatTime(event.detectedAt)} EAT
                      </p>
                    </div>
                    {snippet(event)}
                  </div>
                </li>
              ))}
            </ol>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[10px] text-muted">
              <p>
                Showing {safePage * PAGE_SIZE + 1}–
                {Math.min((safePage + 1) * PAGE_SIZE, events.length)} of{" "}
                {formatNumber(events.length)}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="icon-btn !h-7 !w-7 border-line"
                  aria-label="Previous playout page"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ArrowLeft size={13} />
                </button>
                <span>
                  {safePage + 1} /{" "}
                  {Math.max(1, Math.ceil(events.length / PAGE_SIZE))}
                </span>
                <button
                  type="button"
                  className="icon-btn !h-7 !w-7 border-line"
                  aria-label="Next playout page"
                  disabled={(safePage + 1) * PAGE_SIZE >= events.length}
                  onClick={() => setPage(safePage + 1)}
                >
                  <ArrowRight size={13} />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
      <WeightingControls
        policy={policy}
        enabled={weighted}
        onChange={(next) => {
          setPolicy(next);
          setNotice(false);
        }}
        onEnabled={(value) => {
          setWeighted(value);
          setNotice(false);
        }}
      />
      <ComplianceExport
        events={events}
        catalogue={catalogue}
        policy={effective}
        onExport={() => setNotice(true)}
      />
      {notice && (
        <p role="status" className="text-xs text-brand">
          Logging sheet downloaded for the current view. Review missing
          identifiers and programme details before filing.
        </p>
      )}
      {evidence && (
        <EvidenceModal
          key={evidence.id}
          spin={evidence}
          onClose={() => setEvidence(null)}
        />
      )}
    </div>
  );
}
