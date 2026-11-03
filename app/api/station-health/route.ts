import { guardedApi } from "@/lib/auth-core";
import { integrationAuth } from "@/lib/integration-auth";
import {
  MONITORED_FEEDS,
  REFERENCE_FEEDS,
  type StationFeed,
} from "@/lib/station-feeds";
import {
  probeFeeds,
  type ProbeResult,
} from "@/lib/station-probe";
import {
  allProbedFeeds,
  isStationHealthFresh,
  readStationHealth,
  recordStationHealth,
} from "@/lib/station-health-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FeedHealth extends StationFeed {
  reference: boolean;
  health: ProbeResult | null;
}

interface CountrySummary {
  total: number;
  reachable: number;
}

interface HealthSummary {
  updatedAt: string | null;
  total: number;
  reachable: number;
  avgLatencyMs: number | null;
  byCountry: Record<string, CountrySummary>;
  byMedium: Record<"FM" | "TV", CountrySummary>;
  feeds: FeedHealth[];
}

function summarize(feeds: FeedHealth[]): HealthSummary {
  const byCountry: Record<string, CountrySummary> = {};
  const byMedium: Record<"FM" | "TV", CountrySummary> = {
    FM: { total: 0, reachable: 0 },
    TV: { total: 0, reachable: 0 },
  };
  let reachable = 0;
  let latencySum = 0;
  let latencyCount = 0;
  let updatedAt: string | null = null;

  for (const feed of feeds) {
    const entry = (byCountry[feed.country] ??= { total: 0, reachable: 0 });
    entry.total += 1;
    byMedium[feed.medium].total += 1;
    const health = feed.health;
    if (!health) continue;
    updatedAt = health.checkedAt;
    if (health.ok) {
      reachable += 1;
      entry.reachable += 1;
      byMedium[feed.medium].reachable += 1;
      if (health.latencyMs >= 0) {
        latencySum += health.latencyMs;
        latencyCount += 1;
      }
    }
  }

  return {
    updatedAt,
    total: feeds.length,
    reachable,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
    byCountry,
    byMedium,
    feeds,
  };
}

/**
 * GET /api/station-health
 *
 * Public read-only health of every monitored broadcast stream: real stream
 * URLs, per-feed probe results (reachable, latency, stream kind) and market
 * summaries. When no probe has run yet on this instance, the endpoint probes
 * live once so a cold start still serves real data.
 */
export async function GET() {
  let health = await readStationHealth();
  if (!isStationHealthFresh() && health.size === 0) {
    // Cold instance with no persisted history: probe now so the public
    // monitor never reports phantom health.
    const results = await probeFeeds(allProbedFeeds(), { concurrency: 8 });
    await recordStationHealth(results);
    health = new Map(results);
  }

  const feeds: FeedHealth[] = [...MONITORED_FEEDS, ...REFERENCE_FEEDS]
    .filter((feed) => !feed.retired)
    .map((feed) => ({
      ...feed,
      reference: feed.source === "BBC",
      health: health.get(feed.id) ?? null,
    }))
    .sort(
      (a, b) =>
        a.country.localeCompare(b.country) || a.name.localeCompare(b.name),
    );

  const summary = summarize(feeds);
  return Response.json(summary, {
    headers: { "cache-control": "no-store" },
  });
}

/**
 * POST /api/station-health
 *
 * Runs a fresh probe of every feed and persists the results. Authorized to
 * the Vercel cron (CRON_SECRET) or any broadcaster-role session — the
 * scheduled maintenance hook keeps health fresh daily, and broadcasters can
 * force a re-probe from the dashboard.
 */
export async function POST(request: Request) {
  const denied = integrationAuth(request, "CRON_SECRET");
  if (denied) {
    return guardedApi(request, ["broadcaster"], false, async () => {
      const results = await probeFeeds(allProbedFeeds(), { concurrency: 8 });
      await recordStationHealth(results);
      return Response.json(
        {
          probed: results.size,
          reachable: [...results.values()].filter((result) => result.ok).length,
          updatedAt: new Date().toISOString(),
        },
        { headers: { "cache-control": "no-store" } },
      );
    });
  }

  const results = await probeFeeds(allProbedFeeds(), { concurrency: 8 });
  await recordStationHealth(results);
  return Response.json(
    {
      probed: results.size,
      reachable: [...results.values()].filter((result) => result.ok).length,
      updatedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
