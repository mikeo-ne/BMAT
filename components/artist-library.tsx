"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Disc3,
  Download,
  ExternalLink,
  Headphones,
  Info,
  Music2,
  Play,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Dialog } from "@/components/dialog";
import {
  appleMusicEmbedUrl,
  artistSelectionFromHash,
  filterReferenceRecordings,
  MUSIC_RESEARCHED_ON,
  MUSIC_REFERENCE_NOTICE,
  MUSIC_SOURCES,
  PUBLIC_ARTISTS,
  REFERENCE_RECORDINGS,
  referenceMusicCsv,
  type ArtistSelection,
  type PublicArtistId,
  type ReferenceRecording,
} from "@/lib/artist-library";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatDuration } from "@/lib/format";

const THEMES: Record<PublicArtistId, { background: string; color: string }> = {
  baranga: {
    background: "linear-gradient(135deg, #e0ebce, #f1f6e8)",
    color: "#456736",
  },
  "mr-fallback": {
    background: "linear-gradient(135deg, #f4e4cc, #faf3e7)",
    color: "#8b5e25",
  },
  soundlykbb: {
    background: "linear-gradient(135deg, #dcebea, #eff6f5)",
    color: "#246b65",
  },
  "tai-dai": {
    background: "linear-gradient(135deg, #e5dff0, #f4f0f8)",
    color: "#71548e",
  },
};

function subscribeToArtist(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}
const getArtistSelection = () => artistSelectionFromHash(window.location.hash);
const getServerArtistSelection = (): ArtistSelection => "all";

/** Shareable hash links also work in the read-only static export, without request-time APIs. */
export function selectLibraryArtist(artist: ArtistSelection) {
  const url = new URL(window.location.href);
  // Keep a reloadable library URL even when entered from an in-place overview tab.
  // Native history preserves staged delivery state and integrates with Next's router.
  url.pathname = url.pathname.replace(
    /\/artist(?:\/(?:catalogue|delivery))?(\/?)$/,
    "/artists$1",
  );
  url.hash = artist === "all" ? "" : artist;
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  window.dispatchEvent(new Event("hashchange"));
}

export function ArtistSpotlight({
  onSelect,
}: {
  onSelect: (artist: PublicArtistId) => void;
}) {
  return (
    <section
      aria-labelledby="artist-spotlight-heading"
      className="rounded-2xl border border-brand/15 bg-brand/5 p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">YOUR ARTIST SELECTION</p>
          <h3
            id="artist-spotlight-heading"
            className="mt-1 text-sm font-semibold"
          >
            Real artists. Their real music.
          </h3>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            Sourced release details and original-platform listening. Airplay
            statistics come only from connected captures.
          </p>
        </div>
        <span className="chip !border-brand/15 !bg-surface-2/60 !text-[10px]">
          <BookOpen size={11} />
          {REFERENCE_RECORDINGS.length} track references
        </span>
      </div>
      <div className="grid gap-2 min-[360px]:grid-cols-2 xl:grid-cols-4">
        {PUBLIC_ARTISTS.map((artist) => {
          const recording = REFERENCE_RECORDINGS.find(
            (entry) => entry.id === artist.highlightRecordingId,
          )!;
          return (
            <button
              key={artist.id}
              type="button"
              aria-label={`Explore ${artist.displayName} music`}
              onClick={() => onSelect(artist.id)}
              className="group flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3 text-left transition-colors hover:border-brand/30 hover:bg-surface-2"
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
                style={THEMES[artist.id]}
              >
                {artist.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold">
                  {artist.displayName}
                </span>
                <span className="mt-1 block truncate text-[10px] text-muted">
                  {recording.title}
                </span>
              </span>
              <ArrowUpRight
                size={13}
                className="shrink-0 text-muted group-hover:text-brand"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReferenceMusicPlayer({
  recording,
  onClose,
}: {
  recording: ReferenceRecording;
  onClose: () => void;
}) {
  const [loadPlayer, setLoadPlayer] = useState(false);
  const embed = appleMusicEmbedUrl(recording.appleMusicUrl);
  const source = MUSIC_SOURCES[recording.sourceId];
  return (
    <Dialog title={`Listen: ${recording.title}`} onClose={onClose}>
      <p className="text-sm font-medium">
        {recording.primaryArtists.join(" · ")}
      </p>
      <p className="mt-1 text-xs text-muted">
        {recording.release} · {formatDate(recording.releaseDate)} ·{" "}
        {formatDuration(recording.durationSec)}
      </p>
      {loadPlayer && embed ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface-2">
          <iframe
            src={embed}
            title={`Apple Music player for ${recording.title}`}
            height="175"
            className="block w-full border-0"
            allow="autoplay *; encrypted-media *; fullscreen *"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
          />
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-brand/30 bg-brand/5 p-5 text-center">
          <Headphones size={28} className="mx-auto text-brand" />
          <p className="mt-3 text-sm font-medium">
            Listen on the original platform
          </p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
            Loading this player connects your browser to Apple Music. Apple
            controls previews, sign-in and regional availability. No recording
            is downloaded into East Sound.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-4 !max-w-full !whitespace-normal !text-xs"
            disabled={!embed}
            onClick={() => setLoadPlayer(true)}
          >
            <Play size={14} className="shrink-0" />
            Load Apple Music player
          </button>
        </div>
      )}
      <a
        className="btn btn-ghost mt-3 w-full !whitespace-normal !text-xs"
        href={recording.appleMusicUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink size={14} className="shrink-0" />
        Open in Apple Music instead
      </a>
      <p className="mt-3 text-[10px] leading-relaxed text-muted">
        The listed duration is the full release length; a provider preview may
        be shorter or require a subscription. If the embedded player is
        unavailable, use the direct link above. Closing this window removes the
        player.
      </p>
      <div className="mt-4 rounded-xl border border-line p-3 text-[10px] leading-relaxed text-muted">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Info size={12} className="shrink-0" />
          Music reference, not audible broadcast evidence
        </p>
        <p className="mt-1">
          This is the artist’s published release, not a captured station spin or
          a licensed ten-second broadcast excerpt.
        </p>
        <a
          className="mt-2 inline-flex items-center gap-1 font-medium text-brand underline underline-offset-2"
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View release metadata source
          <ArrowUpRight size={11} />
        </a>
      </div>
    </Dialog>
  );
}

export function ArtistLibrary({ onDeliver }: { onDeliver: () => void }) {
  const selectedArtist = useSyncExternalStore(
    subscribeToArtist,
    getArtistSelection,
    getServerArtistSelection,
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [playing, setPlaying] = useState<ReferenceRecording | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const artist = PUBLIC_ARTISTS.find((entry) => entry.id === selectedArtist);
  const recordings = filterReferenceRecordings({
    artist: selectedArtist,
    query,
    sort,
  });
  function reset() {
    selectLibraryArtist("all");
    setQuery("");
    setSort("recent");
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/15 bg-brand/5 px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-medium text-brand">
          <Check size={14} className="shrink-0" />
          {PUBLIC_ARTISTS.length} researched artists ·{" "}
          {REFERENCE_RECORDINGS.length} unique track references
        </p>
        <p className="text-[10px] text-muted">
          Sources reviewed {formatDate(MUSIC_RESEARCHED_ON)} · curated, not a
          live feed
        </p>
      </div>
      <div
        className="grid gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4"
        aria-label="Choose an artist"
      >
        {PUBLIC_ARTISTS.map((entry) => {
          const count = REFERENCE_RECORDINGS.filter((recording) =>
            recording.artistIds.includes(entry.id),
          ).length;
          return (
            <button
              key={entry.id}
              type="button"
              aria-label={`Show ${entry.displayName} releases`}
              aria-pressed={selectedArtist === entry.id}
              onClick={() =>
                selectLibraryArtist(
                  selectedArtist === entry.id ? "all" : entry.id,
                )
              }
              className={`panel min-w-0 p-4 text-left transition-colors hover:!border-brand/40 ${selectedArtist === entry.id ? "!border-brand ring-1 ring-brand/20" : ""}`}
            >
              <span className="flex items-center justify-between gap-3">
                <span
                  aria-hidden
                  style={THEMES[entry.id]}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
                >
                  {entry.initials}
                </span>
                <span className="rounded-full border border-line px-2 py-1 text-[9px] text-muted">
                  {count} references
                </span>
              </span>
              <span className="mt-4 block text-[13px] font-semibold tracking-tight">
                {entry.displayName}
              </span>
              <span className="mt-1 block text-[10px] leading-relaxed text-muted">
                {entry.tagline}
              </span>
              <span className="mt-3 flex flex-wrap gap-1">
                {entry.genres.slice(0, 2).map((genre) => (
                  <span
                    key={genre}
                    className="rounded bg-surface-2 px-2 py-1 text-[9px] text-muted"
                  >
                    {genre}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {artist && (
        <section
          className="panel p-5"
          aria-label={`About ${artist.displayName}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">CATALOGUE PROFILE</p>
              <h3 className="mt-1 text-lg font-semibold">
                {artist.displayName}
              </h3>
            </div>
            <button
              type="button"
              className="btn btn-ghost !text-[11px]"
              onClick={() => selectLibraryArtist("all")}
            >
              <X size={13} />
              All artists
            </button>
          </div>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted">
            {artist.summary}
          </p>
          <div
            className="mt-4 flex flex-wrap gap-x-4 gap-y-2"
            aria-label={`Sources for ${artist.displayName}`}
          >
            {artist.sourceIds.map((sourceId, index) => (
              <a
                key={sourceId}
                href={MUSIC_SOURCES[sourceId].url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-brand underline decoration-brand/30 underline-offset-3"
              >
                {index === 0
                  ? "Artist profile on Apple Music"
                  : MUSIC_SOURCES[sourceId].title}
                <ArrowUpRight size={11} />
              </a>
            ))}
          </div>
        </section>
      )}
      <section
        aria-labelledby="public-recordings-heading"
        className="flex min-w-0 flex-col gap-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">THE MUSIC</p>
            <h3
              id="public-recordings-heading"
              className="mt-1 text-sm font-semibold"
            >
              {artist
                ? `${artist.displayName} · selected releases & collaborations`
                : "Releases & collaborations"}
            </h3>
            <p role="status" className="mt-1 text-[10px] text-muted">
              Showing {recordings.length} of {REFERENCE_RECORDINGS.length}{" "}
              unique references. Shared recordings appear once, with all artist
              credits.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost !text-[11px]"
            disabled={!recordings.length}
            onClick={() => {
              downloadCsv(
                `east-sound-artist-research-${selectedArtist}-${MUSIC_RESEARCHED_ON}.csv`,
                referenceMusicCsv(recordings),
              );
              setNotice(
                `Downloaded metadata and source links for ${recordings.length} recording${recordings.length === 1 ? "" : "s"}. No audio files included.`,
              );
            }}
          >
            <Download size={13} />
            Export metadata CSV
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-60">
            <span className="sr-only">
              Search artists, tracks or collaborators
            </span>
            <Search
              aria-hidden
              size={14}
              className="pointer-events-none absolute left-3 top-3 text-muted"
            />
            <input
              type="search"
              className="field !bg-surface !pl-9 !text-xs"
              aria-label="Search artists, tracks or collaborators"
              placeholder="Search a title, artist, collaborator or release…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Sort public releases</span>
            <select
              className="field !bg-surface !text-xs"
              aria-label="Sort public releases"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as "recent" | "title")
              }
            >
              <option value="recent">Newest releases first</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
          {(query || selectedArtist !== "all") && (
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={reset}
            >
              Reset music filters
            </button>
          )}
        </div>
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-brand/20 bg-brand/5 p-3 text-xs text-brand"
          >
            {notice}
          </p>
        )}
        {recordings.length ? (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {recordings.map((recording) => (
              <article
                key={recording.id}
                aria-label={`Music reference: ${recording.title}`}
                className="panel flex min-w-0 flex-col p-4 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                    style={THEMES[recording.artistIds[0]]}
                  >
                    <Disc3 size={26} strokeWidth={1.3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold leading-snug">
                      {recording.title}
                    </h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      {recording.primaryArtists.join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {formatDuration(recording.durationSec)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-surface-2 px-2 py-1 text-[9px] text-muted">
                    {recording.genre}
                  </span>
                  <span className="rounded-md bg-surface-2 px-2 py-1 text-[9px] text-muted">
                    {recording.releaseType}
                  </span>
                  {recording.primaryArtists.length > 1 && (
                    <span className="rounded-md bg-brand/5 px-2 py-1 text-[9px] text-brand">
                      Joint artist credits
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-muted">
                  {recording.release} ·{" "}
                  <time dateTime={recording.releaseDate}>
                    {formatDate(recording.releaseDate)}
                  </time>
                </p>
                <p className="mb-4 mt-1 text-[9px] leading-relaxed text-muted">
                  {recording.phonogramCredit}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  <a
                    href={MUSIC_SOURCES[recording.sourceId].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Release source for ${recording.title}`}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-muted hover:text-brand"
                  >
                    <BookOpen size={12} />
                    Release source
                    <ArrowUpRight size={10} />
                  </a>
                  <button
                    type="button"
                    className="btn btn-primary !gap-1.5 !px-3 !py-2 !text-[10px]"
                    aria-label={`Listen to ${recording.title}`}
                    onClick={() => setPlaying(recording)}
                  >
                    <Play size={12} />
                    Listen
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel border-dashed p-10 text-center">
            <Search size={24} className="mx-auto text-muted" />
            <p className="mt-3 text-sm font-medium">
              No releases match these filters.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Try a track title or a credited collaborator, or return to all
              four artists.
            </p>
            <button
              type="button"
              className="btn btn-ghost mt-4 !text-xs"
              onClick={reset}
            >
              Show all music
            </button>
          </div>
        )}
      </section>
      <section
        className="rounded-xl border border-line bg-surface-2/50 p-4 sm:p-5"
        aria-labelledby="music-usage-heading"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="shrink-0 text-brand" />
          <div className="min-w-0">
            <h3 id="music-usage-heading" className="text-xs font-semibold">
              Real metadata. Responsible music use.
            </h3>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {MUSIC_REFERENCE_NOTICE} We have not invented ISRCs, royalties,
              radio spins, personal biographies or label affiliations for these
              artists. Published ℗ lines are retained as release credits, not
              treated as a grant of rights.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              To ingest a recording or build a fingerprint, deliver a WAV/MP3
              master you own or are authorised to use, retain its verified
              existing ISRC, and agree the collaborator splits. Public streaming
              links are not master files.
            </p>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 text-[11px] font-medium text-brand underline underline-offset-3"
              onClick={onDeliver}
            >
              <Upload size={13} />
              Deliver an authorised master
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </section>
      <details className="panel p-4">
        <summary className="cursor-pointer text-xs font-medium">
          <Music2 size={13} className="mr-2 inline text-brand" />
          Research sources & edition notes
        </summary>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Catalogue entries were cross-checked against the Uganda Apple Music
          storefront on {formatDate(MUSIC_RESEARCHED_ON)}. Ekibobo uses the 4
          March 2025 edition; UNFORGETTABLE uses the 5 June 2026 single, not the
          later WHET listing. Co-leads are retained for Thursday, Sponsor, BUNDA
          FREESTYLE and GRANTED. This is a curated selection, not a complete
          discography.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(MUSIC_SOURCES).map(([id, source]) => (
            <li key={id}>
              <a
                className="inline-flex items-center gap-1 text-[10px] text-brand underline underline-offset-2"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.title}
                <ExternalLink size={10} className="shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </details>
      {playing && (
        <ReferenceMusicPlayer
          key={playing.id}
          recording={playing}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
}
