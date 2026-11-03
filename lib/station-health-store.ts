/**
 * Persistence + caching for station stream health.
 *
 * Health probe results are operational telemetry, not master data: they are
 * read-mostly, safe to regenerate, and never block chart ingestion. The store
 * therefore always works (unlike the capture stores, which require durable
 * storage) — a memory cache serves fresh reads within a TTL and a JSON file
 * in the data directory survives restarts on the same instance. On multi-
 * instance serverless deployments the file is per-instance; the API layer
 * re-probes when its local cache is empty, so the endpoint self-heals.
 */

import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { probeFeeds, type ProbeResult } from "./station-probe";
import {
  MONITORED_FEEDS,
  REFERENCE_FEEDS,
  type StationFeed,
} from "./station-feeds";

/** Probe results older than this are considered stale for read paths. */
const CACHE_TTL_MS = 60_000;

const directory = () =>
  process.env.EAST_SOUND_DATA_DIR ?? path.join(process.cwd(), ".data");
const filename = () => path.join(directory(), "station-health.json");

interface HealthFile {
  updatedAt: string;
  results: Record<string, ProbeResult>;
}

let cache: Map<string, ProbeResult> | null = null;
let cacheAt = 0;
let mutations: Promise<unknown> = Promise.resolve();

function emptyResults(): Map<string, ProbeResult> {
  return new Map();
}

/** Health map for all monitored feeds (reference feeds live outside the panel). */
export function readStationHealthCache(): Map<string, ProbeResult> {
  return cache ? new Map(cache) : emptyResults();
}

/** Whether the in-memory cache holds results probed within the TTL. */
export function isStationHealthFresh(): boolean {
  return Boolean(cache) && Date.now() - cacheAt < CACHE_TTL_MS;
}

/**
 * Read the latest health for every monitored feed. Falls back to the
 * persisted JSON file when the memory cache is cold (fresh instance).
 */
export async function readStationHealth(): Promise<
  Map<string, ProbeResult>
> {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) {
    return new Map(cache);
  }
  try {
    const parsed: unknown = JSON.parse(await readFile(filename(), "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as HealthFile).updatedAt === "string" &&
      typeof (parsed as HealthFile).results === "object" &&
      (parsed as HealthFile).results !== null
    ) {
      const file = parsed as HealthFile;
      const loaded: Map<string, ProbeResult> = new Map();
      for (const [id, result] of Object.entries(file.results)) {
        if (result && typeof result.ok === "boolean") loaded.set(id, result);
      }
      cache = loaded;
      cacheAt = Date.parse(file.updatedAt) || Date.now();
      return new Map(loaded);
    }
  } catch {
    // Missing or corrupt file: fall through to an empty result set.
  }
  return emptyResults();
}

/**
 * Persist a fresh probe batch. Writes are serialized behind a promise chain
 * (same pattern as the other runtime stores) so concurrent probe runs cannot
 * interleave partial files.
 */
export async function recordStationHealth(
  results: Map<string, ProbeResult>,
): Promise<void> {
  cache = new Map(results);
  cacheAt = Date.now();
  const record: HealthFile = {
    updatedAt: new Date(cacheAt).toISOString(),
    results: Object.fromEntries(results),
  };
  const write = async () => {
    await mkdir(directory(), { recursive: true });
    await writeFile(filename(), JSON.stringify(record, null, 2), "utf8");
  };
  mutations = mutations.then(write, write);
  await mutations;
}

/** All feeds probed by the health service (panel + reference). */
export function allProbedFeeds(): readonly StationFeed[] {
  return [...MONITORED_FEEDS, ...REFERENCE_FEEDS];
}

/**
 * Probe every feed once and persist the results. Returns counts for the
 * probe runner (cron, admin triggers, first-read refresh).
 */
export async function refreshStationHealth(): Promise<{
  probed: number;
  reachable: number;
}> {
  const results = await probeFeeds(allProbedFeeds(), { concurrency: 8 });
  await recordStationHealth(results);
  return {
    probed: results.size,
    reachable: [...results.values()].filter((result) => result.ok).length,
  };
}
