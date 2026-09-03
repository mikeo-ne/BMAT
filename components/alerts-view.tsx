"use client";

import { useMemo, useState } from "react";

import { AlertSettings } from "@/components/alert-settings";
import { WhatsappSimulator } from "@/components/whatsapp-simulator";
import {
  buildDefaultRules,
  simulateAlertEvents,
  webhookPayload,
  type AlertRule,
  type ChannelId,
} from "@/lib/alerts";
import { formatDateTime } from "@/lib/format";
import type { Track } from "@/lib/types";

interface AlertsViewProps {
  catalogue: Track[];
  now: Date;
}

/**
 * Live airplay alerts.
 *
 * Rules drive a deterministic event stream, so toggling a channel visibly
 * changes what lands on the handset and in the webhook log. The stream is
 * regenerated whenever a rule changes — nothing here is a live socket.
 */
export function AlertsView({ catalogue, now }: AlertsViewProps) {
  const [rules, setRules] = useState<AlertRule[]>(() => buildDefaultRules(catalogue));

  const events = useMemo(
    () => simulateAlertEvents(rules, catalogue, now),
    [rules, catalogue, now],
  );

  const whatsappEvents = useMemo(
    () => events.filter((e) => e.channel === "whatsapp"),
    [events],
  );
  const otherEvents = useMemo(
    () => events.filter((e) => e.channel !== "whatsapp").slice(0, 12),
    [events],
  );

  function toggleRule(ruleId: string) {
    setRules((prev) =>
      prev.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule)),
    );
  }

  function toggleChannel(ruleId: string, channel: ChannelId) {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const has = rule.channels.includes(channel);
        return {
          ...rule,
          channels: has
            ? rule.channels.filter((c) => c !== channel)
            : [...rule.channels, channel],
        };
      }),
    );
  }

  const samplePayload = otherEvents[0] ? webhookPayload(otherEvents[0]) : null;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Active rules",
            value: String(rules.filter((r) => r.enabled && r.channels.length > 0).length),
            hint: `of ${rules.length} configured`,
          },
          { label: "Plays this week", value: String(events.length), hint: "across all channels" },
          {
            label: "WhatsApp pushes",
            value: String(whatsappEvents.length),
            hint: "delivered to the handset",
          },
          {
            label: "Unverified plays",
            value: String(events.filter((e) => !e.verified).length),
            hint: "not billable until resolved",
          },
        ].map((card) => (
          <div key={card.label} className="panel p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">{card.label}</p>
            <p className="mt-1 font-mono text-xl font-semibold">{card.value}</p>
            <p className="mt-1 text-[11px] text-muted">{card.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <AlertSettings
            rules={rules}
            onToggleRule={toggleRule}
            onToggleChannel={toggleChannel}
          />

          <section className="panel p-4" aria-labelledby="webhook-heading">
            <h2 id="webhook-heading" className="text-sm font-semibold tracking-tight">
              Email &amp; webhook delivery log
            </h2>
            <p className="mt-1 text-xs text-muted">
              The same events the handset receives, as they would arrive over the other channels.
            </p>

            {otherEvents.length === 0 ? (
              <p className="mt-4 rounded border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
                Nothing routed to email or webhook. Enable a channel on a rule to see it here.
              </p>
            ) : (
              <ul className="mt-4 space-y-1.5">
                {otherEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-line bg-surface-2 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0">
                      <span className="chip mr-2">{event.channel}</span>
                      <span className="font-medium">{event.title}</span>{" "}
                      <span className="text-muted">
                        on {event.station.name} ({event.station.hub})
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      {formatDateTime(event.atIso)}
                      {event.verified ? "" : " · unverified"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {samplePayload ? (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-wider text-muted">Webhook payload</p>
                <pre className="mt-1.5 overflow-x-auto rounded-lg border border-line bg-background p-3 font-mono text-[11px] leading-relaxed text-muted">
                  {JSON.stringify(samplePayload, null, 2)}
                </pre>
              </div>
            ) : null}
          </section>
        </div>

        <WhatsappSimulator events={whatsappEvents} />
      </div>

      <p className="pb-2 text-center text-[11px] text-muted">
        Play events are generated deterministically from the rule set for this prototype. No
        WhatsApp, SMTP or webhook endpoint is connected, and nothing leaves the browser.
      </p>
    </div>
  );
}
