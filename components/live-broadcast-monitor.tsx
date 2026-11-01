"use client";
import { DemoStudio } from "@/components/demo-studio";
import { useAuth } from "@/components/auth-provider";
import { authFetch, PRIVATE_EVICT } from "@/lib/auth-client";
import { sessionScope } from "@/lib/auth-types";
import { browserSession } from "@/lib/auth-client";
import { cacheSnapshot } from "@/lib/browser-cache";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ExternalLink,
  Headphones,
  Link2,
  Radio,
  Search,
  ShieldCheck,
  Signal,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import { AirplayKpis } from "@/components/airplay-kpis";
import { Dialog } from "@/components/dialog";
import { PageIntro } from "@/components/page-intro";
import { RecentSpins } from "@/components/recent-spins";
import { UgandaAirplayMap } from "@/components/uganda-airplay-map";
import { currentCapturedWindow } from "@/lib/captured-airplay";
import { useCapturedFeed } from "@/lib/use-captured-feed";
import { publicHttpsUrl } from "@/lib/public-url";
import { FM_STATIONS, REGIONS, type Region } from "@/lib/regions";
import type { Track } from "@/lib/types";
import type { BroadcastSpin } from "@/lib/playout";

interface StreamSource {
  stationId: string;
  url: string;
  format: "native" | "hls";
}
const KEY = "east-sound:streams:v1";
const CHANGED = "east-sound:streams-changed";
const sourceMemory = new Map<string, string>();
const DIRECTORY = [
  ...FM_STATIONS.map((station) => ({ ...station, medium: "FM" as const })),
  {
    id: "nbs-tv-kla",
    name: "NBS TV",
    region: "Central" as const,
    location: "Kampala",
    medium: "TV" as const,
  },
];
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGED, callback);
  const evict = (event: Event) => {
    for (const key of sourceMemory.keys())
      if (key.endsWith(":" + (event as CustomEvent<string>).detail))
        sourceMemory.delete(key);
    callback();
  };
  window.addEventListener(PRIVATE_EVICT, evict);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener(PRIVATE_EVICT, evict);
  };
};
const getStored = (key: string) => {
  try {
    return sourceMemory.get(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
};
function parseSources(raw: string | null): StreamSource[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (source): source is StreamSource =>
              !!source &&
              DIRECTORY.some((station) => station.id === source.stationId) &&
              typeof source.url === "string" &&
              !!publicHttpsUrl(source.url) &&
              ["native", "hls"].includes(source.format),
          )
          .slice(0, DIRECTORY.length)
      : [];
  } catch {
    return [];
  }
}

/** Loads only after an explicit Open feed action. Native/HLS playback is not a recognition result. */
function ConnectedStream({
  source,
  medium,
  onClose,
}: {
  source: StreamSource;
  medium: "FM" | "TV";
  onClose: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"ready" | "playing" | "paused" | "error">(
    "ready",
  );
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    let destroyed = false;
    let engine: { destroy: () => void } | null = null;
    if (
      source.format === "hls" &&
      !media.canPlayType("application/vnd.apple.mpegurl")
    ) {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            setState("error");
            return;
          }
          const hls = new Hls({ enableWorker: true });
          engine = hls;
          hls.loadSource(source.url);
          hls.attachMedia(media);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setState("error");
          });
        })
        .catch(() => {
          if (!destroyed) setState("error");
        });
    } else media.src = source.url;
    return () => {
      destroyed = true;
      engine?.destroy();
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [source.url, source.format]);
  return (
    <section className="panel p-4 sm:p-5" aria-label="Connected station player">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">EXTERNAL SOURCE PLAYER</p>
          <h2 className="mt-1 text-sm font-semibold">
            {DIRECTORY.find((station) => station.id === source.stationId)?.name}
          </h2>
          <p role="status" className="mt-1 text-[10px] text-muted">
            {state === "playing"
              ? "Playing source media—not proof of a fingerprint match"
              : state === "error"
                ? "Source unavailable or blocked by format/CORS policy"
                : state === "paused"
                  ? "Playback paused"
                  : "Source loaded · press play to listen"}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close station player"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      <video
        ref={ref}
        controls
        playsInline
        preload="none"
        className={`w-full rounded-xl ${medium === "FM" ? "h-24 bg-[#12272d]" : "max-h-96 bg-black"}`}
        aria-label={`${medium} source player`}
        onPlaying={() => setState("playing")}
        onPause={() =>
          setState((previous) => (previous === "error" ? "error" : "paused"))
        }
        onError={() => setState("error")}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[10px] leading-relaxed text-muted">
          Source audio/video comes directly from the configured provider. HLS
          requires browser support and provider CORS. Capture, matching and
          evidence storage are separate integrations.
        </p>
        <a
          className="inline-flex items-center gap-1 text-[10px] font-medium text-brand underline"
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open original source
          <ExternalLink size={11} />
        </a>
      </div>
    </section>
  );
}

export function LiveBroadcastMonitor({
  catalogue,
  initialEvents,
  now,
  canPoll,
  allowedStationIds,
}: {
  catalogue: Track[];
  initialEvents: BroadcastSpin[];
  now: string;
  canPoll: boolean;
  allowedStationIds?: string[];
}) {
  const directory = allowedStationIds
    ? DIRECTORY.filter((s) => allowedStationIds.includes(s.id))
    : DIRECTORY;
  const { session } = useAuth();
  const scope = sessionScope(session.user);
  const storageKey = KEY + ":" + (session.user?.id ?? "guest");
  const raw = useSyncExternalStore(
    subscribe,
    () => getStored(storageKey),
    () => null,
  );
  const sources = parseSources(raw).filter(
    (source) =>
      !allowedStationIds || allowedStationIds.includes(source.stationId),
  );
  useEffect(() => {
    if (!session.user) return;
    let closed = false;
    void authFetch("/api/station-sources")
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        if (!closed && sessionScope(browserSession().user) === scope) {
          sourceMemory.set(storageKey, JSON.stringify(body.sources));
          try {
            localStorage.setItem(storageKey, JSON.stringify(body.sources));
          } catch {}
          window.dispatchEvent(new Event(CHANGED));
          void cacheSnapshot(session.user!.id, "stations", body.sources, scope);
        }
      })
      .catch(() => undefined);
    return () => {
      closed = true;
    };
  }, [storageKey, session.user, scope]);
  const feed = useCapturedFeed(initialEvents, now, canPoll);
  const events = currentCapturedWindow(feed.events, new Date(feed.now));
  const [region, setRegion] = useState<Region | "All">("All");
  const [medium, setMedium] = useState("All");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<StreamSource | null>(null);
  const [editing, setEditing] = useState<StreamSource | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = events.filter(
    (event) =>
      (region === "All" || event.region === region) &&
      (medium === "All" || event.medium === medium),
  );
  const stations = directory.filter(
    (station) =>
      (region === "All" || station.region === region) &&
      (medium === "All" || station.medium === medium) &&
      `${station.name} ${station.location}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function saveSources(next: StreamSource[]) {
    try {
      const response = await authFetch("/api/station-sources", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: next }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Station sources could not be saved.");
      if (sessionScope(browserSession().user) !== scope)
        throw new Error(
          "Your account changed while saving. Refresh the workspace.",
        );
      sourceMemory.set(storageKey, JSON.stringify(body.sources));
      try {
        localStorage.setItem(storageKey, JSON.stringify(body.sources));
      } catch {}
      if (session.user)
        void cacheSnapshot(session.user.id, "stations", body.sources, scope);
      window.dispatchEvent(new Event(CHANGED));
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The station source could not be saved.",
      );
      return false;
    }
  }
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <PageIntro
        eyebrow="LIVE BROADCAST MONITORING"
        title="Connect the signal. Keep the evidence."
        description="Listen to authorised FM and TV sources, follow captured playout, and inspect ten-second audit clips. No stream, telemetry or fingerprint match is fabricated."
        actions={
          <button
            type="button"
            className="btn btn-primary !text-xs"
            disabled={!directory.length}
            onClick={() => {
              setEditing({
                stationId: directory[0]?.id ?? "",
                url: "",
                format: "native",
              });
              setConsent(false);
              setError(null);
            }}
          >
            <Link2 size={15} />
            Connect a station source
          </button>
        }
      />
      <AirplayKpis
        catalogue={catalogue}
        events={filtered}
        scope="Captured FM/TV sources · current 14-day EAT window"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/15 bg-brand/5 p-4">
        <p className="flex items-center gap-2 text-[11px] text-brand">
          <Signal size={15} />
          {sources.length} configured source{sources.length === 1 ? "" : "s"} in
          your account · {events.length} captured records in the current window
        </p>
        <span className="text-[10px] text-muted">
          {feed.unavailable
            ? "Capture API unavailable · showing last snapshot"
            : canPoll
              ? "Capture log refreshes every 15 seconds"
              : "Read-only export · no capture API"}
        </span>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-brand/20 bg-brand/5 p-3 text-xs text-brand"
        >
          {notice}
        </p>
      )}
      {active && (
        <ConnectedStream
          key={`${active.stationId}:${active.url}`}
          source={active}
          medium={
            DIRECTORY.find((station) => station.id === active.stationId)
              ?.medium ?? "FM"
          }
          onClose={() => setActive(null)}
        />
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <UgandaAirplayMap
          events={events}
          focusRegion={region}
          onFocusRegion={setRegion}
        />
        <section
          className="panel min-w-0 p-4 sm:p-5"
          aria-label="Station source directory"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="eyebrow">YOUR SIGNAL SOURCES</p>
              <h2 className="mt-1 text-sm font-semibold">Station directory</h2>
            </div>
            <span className="chip !text-[9px]">{stations.length} in view</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="relative min-w-0 flex-1 basis-52">
              <Search
                size={13}
                className="absolute left-3 top-3 text-muted"
                aria-hidden
              />
              <input
                className="field !pl-9 !text-xs"
                aria-label="Search station sources"
                placeholder="Search a station or hub…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              className="field !w-auto !text-xs"
              aria-label="Monitored region"
              value={region}
              onChange={(event) =>
                setRegion(event.target.value as typeof region)
              }
            >
              <option value="All">All regions</option>
              {REGIONS.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
            <select
              className="field !w-auto !text-xs"
              aria-label="Monitored medium"
              value={medium}
              onChange={(event) => setMedium(event.target.value)}
            >
              <option value="All">FM & TV</option>
              <option>FM</option>
              <option>TV</option>
            </select>
          </div>
          <div className="mt-4 max-h-[450px] space-y-2 overflow-y-auto pr-1">
            {stations.map((station) => {
              const source = sources.find(
                (entry) => entry.stationId === station.id,
              );
              const Icon = station.medium === "FM" ? Radio : Tv;
              return (
                <article
                  key={station.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/5 text-brand">
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-semibold">{station.name}</h3>
                    <p className="mt-1 text-[9px] text-muted">
                      {station.region} · {station.medium} ·{" "}
                      {source
                        ? "Source URL saved locally"
                        : "No source connected"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {source && (
                      <button
                        type="button"
                        className="btn btn-primary !px-2.5 !py-2 !text-[10px]"
                        onClick={() => setActive(source)}
                        aria-label={`Open ${station.name} feed`}
                      >
                        <Headphones size={12} />
                        Open feed
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost !px-2.5 !py-2 !text-[10px]"
                      aria-label={`Configure ${station.name} source`}
                      onClick={() => {
                        setEditing(
                          source ?? {
                            stationId: station.id,
                            url: "",
                            format: "native",
                          },
                        );
                        setConsent(false);
                        setError(null);
                      }}
                    >
                      {source ? "Edit" : "Connect"}
                    </button>
                    {source && (
                      <button
                        type="button"
                        className="icon-btn !h-8 !w-8"
                        aria-label={`Remove ${station.name} source`}
                        onClick={async () => {
                          if (
                            await saveSources(
                              sources.filter(
                                (entry) => entry.stationId !== station.id,
                              ),
                            )
                          ) {
                            if (active?.stationId === station.id)
                              setActive(null);
                            setNotice(
                              `${station.name} source removed from your account.`,
                            );
                          }
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {!stations.length && (
              <p className="p-6 text-center text-xs text-muted">
                No directory entries in this selection. Reset your filters to
                find a source.
              </p>
            )}
          </div>
          <p className="mt-4 text-[9px] leading-relaxed text-muted">
            Directory metadata is not a claim that a station is licensed,
            connected or being captured by East Sound. Use a
            broadcaster-approved source URL.
          </p>
        </section>
      </div>
      <RecentSpins events={filtered} limit={8} />
      <section className="rounded-xl border border-line bg-surface-2/50 p-4 text-[11px] leading-relaxed text-muted">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <ShieldCheck size={15} className="text-brand" />A player is not an
          audit engine.
        </h2>
        <p className="mt-2">
          Live playback does not automatically fingerprint or record a station.
          A licensed capture/matching integration posts authenticated events to{" "}
          <code>/api/playout</code>, with an immutable provider ID, timestamp,
          matched recording, confidence and—where available—a ten-second capture
          URL and SHA-256 digest. No fake results are substituted when that
          integration is absent.
        </p>
      </section>
      <DemoStudio stationIds={allowedStationIds} />
      {editing && (
        <Dialog
          title="Connect authorised station source"
          onClose={() => setEditing(null)}
        >
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!publicHttpsUrl(editing.url)) {
                setError(
                  "Use a public HTTPS source URL. Local addresses, credentials and fragments are not allowed.",
                );
                return;
              }
              if (!consent) {
                setError(
                  "Confirm you are authorised to access and monitor this source.",
                );
                return;
              }
              if (
                await saveSources([
                  ...sources.filter(
                    (source) => source.stationId !== editing.stationId,
                  ),
                  { ...editing, url: editing.url.trim() },
                ])
              ) {
                setNotice(
                  "Station source saved to your private account. Use Open feed to connect to the external provider.",
                );
                setEditing(null);
              }
            }}
          >
            <p className="text-xs leading-relaxed text-muted">
              Sources are not supplied by East Sound. Confirm broadcaster
              permission and any territorial restrictions. No connection is made
              until you open the player.
            </p>
            <label className="block text-xs font-medium">
              Station
              <select
                className="field mt-2"
                value={editing.stationId}
                onChange={(event) =>
                  setEditing({ ...editing, stationId: event.target.value })
                }
              >
                {directory.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name} · {station.medium}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium">
              Source HTTPS URL
              <input
                className="field mt-2 !text-xs"
                type="url"
                maxLength={2048}
                placeholder="https://your-broadcaster.com/live/stream"
                value={editing.url}
                onChange={(event) =>
                  setEditing({ ...editing, url: event.target.value })
                }
              />
            </label>
            <label className="block text-xs font-medium">
              Stream format
              <select
                className="field mt-2"
                value={editing.format}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    format: event.target.value as StreamSource["format"],
                  })
                }
              >
                <option value="native">
                  Native audio/video · MP3, AAC, MP4, WebM
                </option>
                <option value="hls">HLS · .m3u8 playlist</option>
              </select>
            </label>
            <label className="flex items-start gap-2 text-xs leading-relaxed">
              <input
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              I am authorised to access and monitor this broadcaster’s source.
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                className="btn btn-ghost !text-xs"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary !text-xs">
                Save source
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
