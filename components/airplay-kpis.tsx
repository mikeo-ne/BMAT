"use client";
import {
  AudioLines,
  Clock3,
  Radio,
  ScanLine,
  ArrowUpRight,
  Bell,
} from "lucide-react";
import { activeSubscriptionCount } from "@/lib/notifications";
import { useNotificationPreferences } from "@/lib/use-notification-preferences";
import type { Track } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { summariseBroadcastLog, type BroadcastSpin } from "@/lib/playout";

export function AirplayKpis({
  events,
  catalogue,
  scope = "Selected reporting window",
}: {
  events: BroadcastSpin[];
  catalogue?: Track[];
  scope?: string;
}) {
  const summary = summariseBroadcastLog(events);
  const { config } = useNotificationPreferences();
  const cards = [
    {
      label: "Total audited spins",
      value: formatNumber(summary.total),
      hint: `${formatNumber(summary.matched)} matched · ${summary.stationCount} stations`,
      icon: AudioLines,
      color: "var(--brand)",
      tag: "Panel activity",
    },
    {
      label: "Top station",
      value: summary.topStation?.name ?? "—",
      hint: summary.topStation
        ? `${formatNumber(summary.topStation.count)} matched plays in this view`
        : "Awaiting station reports",
      icon: Radio,
      color: "#b2852d",
      tag: "Leading rotation",
    },
    {
      label: "Peak airplay time window",
      value: summary.peakWindow,
      hint: "East Africa Time · 4-hour window",
      icon: Clock3,
      color: "#6887b8",
      tag: "Audience moment",
    },
    {
      label: "Active notification subscriptions",
      value: formatNumber(activeSubscriptionCount(config, catalogue)),
      hint: "Enabled rules with a configured, opted-in channel",
      icon: Bell,
      color: "#567baa",
      tag: "Configured account watches",
    },
    {
      label: "Flagged unmatched audio",
      value: formatNumber(summary.unmatched),
      hint: summary.total
        ? `${((summary.unmatched / summary.total) * 100).toFixed(1)}% of audited spins need review`
        : "Nothing flagged in this view",
      icon: ScanLine,
      color: "#ac758b",
      tag: "Identification queue",
    },
  ];
  return (
    <dl
      className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-5"
      aria-label={`Airplay summary — ${scope}`}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="panel group relative overflow-hidden p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[10px] font-medium text-muted sm:text-[11px]">
              {card.label}
            </dt>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: `color-mix(in srgb, ${card.color} 9%, transparent)`,
                color: card.color,
              }}
            >
              <card.icon size={16} strokeWidth={1.7} />
            </span>
          </div>
          <dd
            className={`mt-3 font-semibold tracking-[-0.035em] tabular-nums ${card.label === "Top station" || card.label === "Peak airplay time window" ? "text-[18px] sm:text-[23px]" : "text-[28px] sm:text-[30px]"}`}
          >
            {card.value}
          </dd>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            {card.hint}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3 text-[9px] text-muted">
            <span className="flex items-center gap-1.5">
              <span
                className="h-1 w-1 rounded-full"
                style={{ background: card.color }}
              />
              {card.tag}
            </span>
            <ArrowUpRight size={11} className="opacity-50" />
          </div>
        </div>
      ))}
    </dl>
  );
}
