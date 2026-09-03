"use client";

import { useMemo, useState } from "react";

import { AirtimeAlerts } from "@/components/airtime-alerts";
import { CampaignForm } from "@/components/campaign-form";
import { ComplianceGauge } from "@/components/compliance-gauge";
import { HourHeatmap } from "@/components/hour-heatmap";
import {
  assessCompliance,
  buildAirtimeAlerts,
  buildCampaigns,
  buildHeatmap,
  buildSlots,
  describeTerms,
  type AdCampaign,
  type AdSlot,
} from "@/lib/advertising";
import { formatShare } from "@/lib/format";

/**
 * Advertiser-facing airtime audit.
 *
 * Campaigns are held in component state: the seed set models four live buys, and
 * anything booked through the form is appended for the session. There is no
 * server round-trip yet, so a refresh returns to the seed set.
 */
export function AdAuditor() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>(() => buildCampaigns());
  const [selectedId, setSelectedId] = useState<string>(() => buildCampaigns()[0]?.id ?? "");

  const slotsByCampaign = useMemo(
    () => Object.fromEntries(campaigns.map((c) => [c.id, buildSlots(c)])) as Record<string, AdSlot[]>,
    [campaigns],
  );

  const selected = campaigns.find((c) => c.id === selectedId) ?? campaigns[0];
  const selectedSlots = useMemo(
    () => (selected ? (slotsByCampaign[selected.id] ?? []) : []),
    [selected, slotsByCampaign],
  );
  const compliance = useMemo(() => assessCompliance(selectedSlots), [selectedSlots]);
  const allCompliance = useMemo(
    () => assessCompliance(campaigns.flatMap((c) => slotsByCampaign[c.id] ?? [])),
    [campaigns, slotsByCampaign],
  );

  const heatmap = useMemo(
    () =>
      selected
        ? buildHeatmap([selected], { [selected.id]: selectedSlots })
        : [],
    [selected, selectedSlots],
  );

  const alerts = useMemo(
    () => buildAirtimeAlerts(campaigns, slotsByCampaign),
    [campaigns, slotsByCampaign],
  );

  function handleCreate(campaign: AdCampaign) {
    setCampaigns((prev) => [...prev, campaign]);
    setSelectedId(campaign.id);
  }

  const nextId = `cmp_${String(campaigns.length + 1).padStart(3, "0")}`;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="panel p-4">
        <h2 className="text-sm font-semibold tracking-tight">Campaigns under audit</h2>
        <p className="mt-1 text-xs text-muted">
          {campaigns.length} live buys · {formatShare(allCompliance.fulfilledRate, 1)}{" "}
          fulfilled across {allCompliance.contracted} contracted spots.
        </p>

        <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="Select campaign">
          {campaigns.map((campaign) => {
            const active = campaign.id === selected?.id;
            const rate = assessCompliance(slotsByCampaign[campaign.id] ?? []);
            return (
              <button
                key={campaign.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedId(campaign.id)}
                className={active ? "btn btn-primary" : "btn btn-ghost"}
              >
                {campaign.brand}
                <span className="ml-1.5 font-mono text-[10px] opacity-80">
                  {formatShare(rate.fulfilledRate)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <CampaignForm onCreate={handleCreate} nextId={nextId} />

      {selected ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="panel p-4" aria-labelledby="campaign-terms-heading">
            <h2 id="campaign-terms-heading" className="text-sm font-semibold tracking-tight">
              {selected.brand} — {selected.product}
            </h2>
            <p className="mt-1 text-xs text-muted">{describeTerms(selected.terms)}</p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-muted">Agency</dt>
                <dd className="mt-0.5 font-medium">{selected.agency}</dd>
              </div>
              <div>
                <dt className="text-muted">Jingle</dt>
                <dd className="mt-0.5 truncate font-mono" title={selected.jingle.fileName}>
                  {selected.jingle.fileName}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Length</dt>
                <dd className="mt-0.5 font-mono">{selected.jingle.durationSec}s</dd>
              </div>
              <div>
                <dt className="text-muted">Flight starts</dt>
                <dd className="mt-0.5 font-mono">{selected.startsOn}</dd>
              </div>
            </dl>
          </section>

          <section className="panel p-4" aria-labelledby="compliance-heading">
            <h2 id="compliance-heading" className="text-sm font-semibold tracking-tight">
              Compliance gauge
            </h2>
            <div className="mt-3">
              <ComplianceGauge
                rate={compliance.fulfilledRate}
                contracted={compliance.contracted}
                fulfilled={compliance.fulfilled}
                breached={compliance.airedOffWindow + compliance.airedUnverified}
                missed={compliance.missed}
              />
            </div>
          </section>
        </div>
      ) : null}

      <section className="panel p-4" aria-labelledby="heatmap-heading">
        <h2 id="heatmap-heading" className="text-sm font-semibold tracking-tight">
          Time-of-day heatmap
        </h2>
        <p className="mt-1 text-xs text-muted">
          Every hour the jingle actually aired, in East Africa Time, against the contracted window.
        </p>
        <div className="mt-4">
          <HourHeatmap rows={heatmap} />
        </div>
      </section>

      <AirtimeAlerts alerts={alerts} />

      <p className="pb-2 text-center text-[11px] text-muted">
        Campaign terms, playout logs and breach outcomes are simulated fixture data for this
        prototype. Fingerprint verification against real broadcast audio is not wired up.
      </p>
    </div>
  );
}
