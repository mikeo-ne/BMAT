"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Martini, Radio } from "lucide-react";
import { FEED_PING_SEED, VENUE_PINGS } from "@/lib/site-content";

interface TickerEntry {
  kind: "station" | "venue";
  icon: React.ReactNode;
  text: string;
}

function minutesAgoLabel(minutesAgo: number): string {
  if (minutesAgo <= 0) return "just now";
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  return `${Math.floor(minutesAgo / 60)}h ago`;
}

/**
 * Live broadcast & venue playout ticker.
 *
 * Rotates captured airplay pings from the FM panel and ambient pings from
 * Kampala venues into an animated marquee banner.
 */
export function LiveBroadcastTicker() {
  const [entries, setEntries] = useState<TickerEntry[]>(() => [
    ...FEED_PING_SEED.slice(0, 3).map((ping) => ({
      kind: "station" as const,
      icon: <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-300" />,
      text: `🔴 ${ping.station} ${ping.frequency}: “${ping.track}” logged ${minutesAgoLabel(ping.minutesAgo)} EAT`,
    })),
    ...VENUE_PINGS.slice(0, 2).map((ping) => ({
      kind: "venue" as const,
      icon: <Martini className="h-3.5 w-3.5 shrink-0 text-rose-300" />,
      text: `🍹 ${ping.venue}: “${ping.track}” logged ${minutesAgoLabel(ping.minutesAgo)} EAT`,
    })),
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setEntries((current) => {
        const next = [...current];
        const pick = Math.random() < 0.5 ? "station" : "venue";
        if (pick === "station") {
          const ping =
            FEED_PING_SEED[Math.floor(Math.random() * FEED_PING_SEED.length)];
          next.unshift({
            kind: "station",
            icon: <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-300" />,
            text: `🔴 ${ping.station} ${ping.frequency}: “${ping.track}” logged just now EAT`,
          });
        } else {
          const ping =
            VENUE_PINGS[Math.floor(Math.random() * VENUE_PINGS.length)];
          next.unshift({
            kind: "venue",
            icon: (
              <Martini className="h-3.5 w-3.5 shrink-0 text-rose-300" />
            ),
            text: `🍹 ${ping.venue}: “${ping.track}” logged just now EAT`,
          });
        }
        return next.slice(0, 5);
      });
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  return (
    <section
      aria-label="Live broadcast ticker"
      className="border-b border-slate-800/60 bg-slate-950/60 py-3"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 lg:px-8">
        <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Live
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="flex w-max animate-[ticker_28s_linear_infinite] gap-8 whitespace-nowrap">
            {[...entries, ...entries].map((entry, index) => (
              <span
                key={index}
                className="flex items-center gap-2 text-xs font-medium text-slate-300"
              >
                {entry.icon}
                {entry.text}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-slate-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent" />
        </div>
      </div>
    </section>
  );
}

export { ArrowRight };
