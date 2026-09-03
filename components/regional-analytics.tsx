"use client";

import { useMemo, useState } from "react";

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
}

export function RegionalAnalytics({ catalogue }: RegionalAnalyticsProps) {
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState(catalogue[0]?.id ?? "");

  const hubMetrics = useMemo(() => buildHubMetrics(catalogue), [catalogue]);
  const hitPredictor = useMemo(() => buildHitPredictor(catalogue), [catalogue]);

  const selectedTrack =
    catalogue.find((t) => t.id === selectedTrackId) ?? catalogue[0] ?? null;
  const velocity = useMemo(
    () => (selectedTrack ? buildVelocity(selectedTrack) : null),
    [selectedTrack],
  );

  const selectedHub = hubMetrics.find((m) => m.hub.id === selectedHubId) ?? null;

  const ugandaTotal = hubMetrics
    .filter((m) => m.hub.country === "Uganda")
    .reduce((sum, m) => sum + m.spins7d, 0);
  const crossBorderTotal = hubMetrics
    .filter((m) => m.hub.country !== "Uganda")
    .reduce((sum, m) => sum + m.spins7d, 0);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Uganda spins, 7 days",
            value: formatCompact(ugandaTotal),
            hint: `${hubMetrics.filter((m) => m.hub.country === "Uganda").length} domestic hubs`,
          },
          {
            label: "Cross-border spins",
            value: formatCompact(crossBorderTotal),
            hint: "Nairobi and Dar es Salaam",
          },
          {
            label: "Emerging regional",
            value: String(hitPredictor.length),
            hint: `over the secondary-market floor`,
          },
          {
            label: "Cross-border share",
            value:
              ugandaTotal + crossBorderTotal === 0
                ? "—"
                : formatShare(crossBorderTotal / (ugandaTotal + crossBorderTotal)),
            hint: "of all spins this week",
          },
        ].map((card) => (
          <div key={card.label} className="panel p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">{card.label}</p>
            <p className="mt-1 font-mono text-xl font-semibold">{card.value}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{card.hint}</p>
          </div>
        ))}
      </section>

      <HubMap metrics={hubMetrics} selectedId={selectedHubId} onSelect={setSelectedHubId} />

      {selectedHub ? (
        <section className="panel p-4" aria-labelledby="hub-detail-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="hub-detail-heading" className="text-sm font-semibold tracking-tight">
                {selectedHub.hub.name}, {selectedHub.hub.country}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {TIER_LABEL[selectedHub.hub.tier]} ·{" "}
                {selectedHub.hub.region ? `${selectedHub.hub.region} region · ` : ""}
                {selectedHub.hub.stations} reporting station
                {selectedHub.hub.stations === 1 ? "" : "s"} · reach{" "}
                {formatCompact(selectedHub.hub.reach)}
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setSelectedHubId(null)}>
              Clear selection
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted">Spins, last 7 days</dt>
              <dd className="mt-0.5 font-mono text-lg">{formatCompact(selectedHub.spins7d)}</dd>
            </div>
            <div>
              <dt className="text-muted">Prior 7 days</dt>
              <dd className="mt-0.5 font-mono text-lg">{formatCompact(selectedHub.spinsPrev7d)}</dd>
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
              <dd className="mt-0.5 font-mono text-lg">{selectedHub.searchIndex}</dd>
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

      {velocity ? <VelocityChart velocity={velocity} /> : null}

      <HitPredictor candidates={hitPredictor} />

      <p className="pb-2 text-center text-[11px] text-muted">
        Hub spin totals are apportioned from the deterministic airplay model by hub reach; the
        streaming-search index is a synthetic proxy. Cross-border markets are modelled, not measured —
        BMAT has no Nairobi or Dar es Salaam panel.
      </p>
    </div>
  );
}
