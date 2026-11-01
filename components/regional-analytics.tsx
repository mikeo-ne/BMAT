"use client";

import { CapturedFeedNotice } from "@/components/captured-feed-notice";
import { useMemo, useState } from "react";

import { AirplayKpis } from "@/components/airplay-kpis";
import { AirplayTrend } from "@/components/airplay-trend";
import { PageIntro } from "@/components/page-intro";
import { UgandaAirplayMap } from "@/components/uganda-airplay-map";
import { filterBroadcastLog, type BroadcastSpin } from "@/lib/playout";
import { currentCapturedWindow } from "@/lib/captured-airplay";
import { useCapturedFeed } from "@/lib/use-captured-feed";
import { REGIONS, type Region } from "@/lib/regions";
import { HitPredictor } from "@/components/hit-predictor";
import { HubMap } from "@/components/hub-map";
import { VelocityChart } from "@/components/velocity-chart";
import { formatCompact, formatPercent, formatShare } from "@/lib/format";
import {
  buildHitPredictor,
  buildHubMetrics,
  buildVelocity,
  TIER_LABEL,
} from "@/lib/geography";
import type { Track } from "@/lib/types";

interface RegionalAnalyticsProps {
  catalogue: Track[];
  now?: string;
  initialEvents?: BroadcastSpin[];
  canPoll?: boolean;
}

export function RegionalAnalytics({
  catalogue,
  now,
  initialEvents = [],
  canPoll = false,
}: RegionalAnalyticsProps) {
  const [reference] = useState(() => now ?? new Date().toISOString());
  const [region, setRegion] = useState<Region | "All">("All");
  const [days, setDays] = useState<7 | 14>(14);
  const [artist, setArtist] = useState("");
  const [medium, setMedium] = useState<"All" | "FM" | "TV">("All");
  const feed = useCapturedFeed(initialEvents, reference, canPoll);
  const events = useMemo(
    () => currentCapturedWindow(feed.events, new Date(feed.now)),
    [feed.events, feed.now],
  );
  const context = useMemo(
    () => filterBroadcastLog(events, { days, artist, medium }),
    [events, days, artist, medium],
  );
  const selectedEvents = useMemo(
    () =>
      context.filter((event) => region === "All" || event.region === region),
    [context, region],
  );
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState(
    catalogue[0]?.id ?? "",
  );

  const hubMetrics = useMemo(
    () => buildHubMetrics(catalogue, feed.events, new Date(feed.now)),
    [catalogue, feed.events, feed.now],
  );
  const hitPredictor = useMemo(() => buildHitPredictor(catalogue), [catalogue]);

  const selectedTrack =
    catalogue.find((t) => t.id === selectedTrackId) ?? catalogue[0] ?? null;
  const velocity = useMemo(
    () => (selectedTrack ? buildVelocity(selectedTrack) : null),
    [selectedTrack],
  );

  const selectedHub =
    hubMetrics.find((m) => m.hub.id === selectedHubId) ?? null;

  const ugandaTotal = hubMetrics
    .filter((m) => m.hub.country === "Uganda")
    .reduce((sum, m) => sum + m.spins7d, 0);
  const crossBorderTotal = hubMetrics
    .filter((m) => m.hub.country !== "Uganda")
    .reduce((sum, m) => sum + m.spins7d, 0);

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 pb-8">
      <PageIntro
        eyebrow="REGIONAL AIRPLAY INTELLIGENCE"
        title="A national view. A regional story."
        description="Discover how your music travels through Central, Eastern, Western and Northern Uganda. Change a filter or tap the map; every summary follows your selection."
      />
      <section
        className="panel grid grid-cols-2 gap-3 p-4 sm:grid-cols-4"
        aria-label="Regional airplay filters"
      >
        <label>
          <span className="label !text-[10px]">Region</span>
          <select
            className="field !bg-surface !text-xs"
            value={region}
            onChange={(event) =>
              setRegion(event.target.value as Region | "All")
            }
          >
            <option value="All">All Uganda</option>
            {REGIONS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label !text-[10px]">Artist</span>
          <select
            className="field !bg-surface !text-xs"
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
          >
            <option value="">Entire catalogue</option>
            {[...new Set(catalogue.map((track) => track.primaryArtist))]
              .sort()
              .map((name) => (
                <option key={name}>{name}</option>
              ))}
          </select>
        </label>
        <label>
          <span className="label !text-[10px]">Medium</span>
          <select
            className="field !bg-surface !text-xs"
            value={medium}
            onChange={(event) =>
              setMedium(event.target.value as "All" | "FM" | "TV")
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
            className="field !bg-surface !text-xs"
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as 7 | 14)}
          >
            <option value={14}>Last 14 days</option>
            <option value={7}>Last 7 days</option>
          </select>
        </label>
      </section>
      <AirplayKpis catalogue={catalogue} events={selectedEvents} />
      <CapturedFeedNotice unavailable={feed.unavailable} now={feed.now} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <UgandaAirplayMap
          events={context}
          focusRegion={region}
          onFocusRegion={setRegion}
        />
        <AirplayTrend events={selectedEvents} />
      </div>
      <p className="text-[10px] leading-relaxed text-muted">
        Map totals show matched captured records for the selected artist, medium
        and reporting window. Regional boundaries are schematic, not official
        administrative geometry.
      </p>
      <details className="panel p-5">
        <summary className="cursor-pointer text-sm font-medium">
          Explore hub-level velocity & cross-border demand{" "}
          <span className="ml-2 text-[10px] font-normal text-muted">
            Additional source-based analytics
          </span>
        </summary>
        <div className="mt-5 flex flex-col gap-4">
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {
                label: "Uganda spins, 7 days",
                value: formatCompact(ugandaTotal),
                hint: `${hubMetrics.filter((m) => m.hub.country === "Uganda").length} domestic hubs`,
              },
              {
                label: "Cross-border spins",
                value: "Not connected",
                hint: "No Nairobi / Dar capture sources",
              },
              {
                label: "Emerging regional",
                value: "Not configured",
                hint: "No validated breakout model",
              },
              {
                label: "Cross-border share",
                value:
                  ugandaTotal + crossBorderTotal === 0
                    ? "—"
                    : formatShare(
                        crossBorderTotal / (ugandaTotal + crossBorderTotal),
                      ),
                hint: "of all spins this week",
              },
            ].map((card) => (
              <div key={card.label} className="panel p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted">
                  {card.label}
                </p>
                <p className="mt-1 font-mono text-xl font-semibold">
                  {card.value}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {card.hint}
                </p>
              </div>
            ))}
          </section>

          <HubMap
            metrics={hubMetrics}
            selectedId={selectedHubId}
            onSelect={setSelectedHubId}
          />

          {selectedHub ? (
            <section className="panel p-4" aria-labelledby="hub-detail-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="hub-detail-heading"
                    className="text-sm font-semibold tracking-tight"
                  >
                    {selectedHub.hub.name}, {selectedHub.hub.country}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {TIER_LABEL[selectedHub.hub.tier]} ·{" "}
                    {selectedHub.hub.region
                      ? `${selectedHub.hub.region} region · `
                      : ""}
                    {selectedHub.hub.stations} reporting station
                    {selectedHub.hub.stations === 1 ? "" : "s"} · reach{" "}
                    {catalogue.every((track) => track.origin === "test-fixture")
                      ? formatCompact(selectedHub.hub.reach)
                      : "not connected"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedHubId(null)}
                >
                  Clear selection
                </button>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Spins, last 7 days</dt>
                  <dd className="mt-0.5 font-mono text-lg">
                    {formatCompact(selectedHub.spins7d)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Prior 7 days</dt>
                  <dd className="mt-0.5 font-mono text-lg">
                    {formatCompact(selectedHub.spinsPrev7d)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Spin growth</dt>
                  <dd className="mt-0.5 font-mono text-lg">
                    {selectedHub.growthRate === null
                      ? "—"
                      : formatPercent(selectedHub.growthRate, 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Search index</dt>
                  <dd className="mt-0.5 font-mono text-lg">
                    {catalogue.every((track) => track.origin === "test-fixture")
                      ? selectedHub.searchIndex
                      : "Not connected"}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section className="panel p-4">
            <label className="field">
              <span className="label">Track velocity — pick a recording</span>
              <select
                className="field"
                value={selectedTrackId}
                onChange={(e) => setSelectedTrackId(e.target.value)}
              >
                {catalogue.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title} — {track.primaryArtist}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {velocity &&
          catalogue.every((track) => track.origin === "test-fixture") ? (
            <VelocityChart velocity={velocity} />
          ) : (
            <p className="panel p-5 text-xs leading-relaxed text-muted">
              Streaming/search providers and a validated breakout model are not
              connected. No demand index, causal radio/search comparison or hit
              prediction is inferred for these releases.
            </p>
          )}

          {catalogue.every((track) => track.origin === "test-fixture") && (
            <HitPredictor candidates={hitPredictor} />
          )}

          <p className="pb-2 text-center text-[11px] text-muted">
            Hub spin totals use captured records only where the station has a
            known hub. Streaming/search demand is not connected. Cross-border
            markets have no connected data source — East Sound has no Nairobi or
            Dar es Salaam panel.
          </p>
        </div>
      </details>
    </div>
  );
}
