"use client";

import { useCallback, useMemo, useState } from "react";

import { AirplayTable } from "@/components/airplay-table";
import { RegionAirplayChart } from "@/components/region-airplay-chart";
import { StatCards } from "@/components/stat-cards";
import {
  RejectedFiles,
  StagedFileRow,
  UploadDropzone,
} from "@/components/upload-dropzone";
import {
  TrackMetadataForm,
  type MetadataErrors,
  type MetadataValues,
} from "@/components/track-metadata-form";
import { isValidIsoDate, todayIso } from "@/lib/format";
import { checkIsrc } from "@/lib/isrc";
import type { Region } from "@/lib/regions";
import { summariseCatalog, type Track } from "@/lib/types";
import { parseFileName, splitArtists, type StagedFile } from "@/lib/upload";

interface ArtistPortalProps {
  initialTracks: Track[];
  panelSize: number;
}

interface Notice {
  tone: "success" | "error";
  message: string;
}

function blankMeta(releaseDate: string): MetadataValues {
  return {
    title: "",
    primaryArtist: "",
    featuredArtists: "",
    releaseDate,
    isrc: "",
  };
}

/** Meta is filled in before a file is attached, so the form needs its own slot. */
const DRAFT_KEY = "__draft__";

function validateMeta(values: MetadataValues): MetadataErrors {
  const errors: MetadataErrors = {};

  if (values.title.trim().length === 0) errors.title = "Song title is required.";
  if (values.primaryArtist.trim().length === 0) errors.primaryArtist = "Primary artist is required.";

  if (!isValidIsoDate(values.releaseDate)) {
    errors.releaseDate = "Pick a valid release date.";
  }

  const isrc = checkIsrc(values.isrc);
  if (!isrc.valid) errors.isrc = isrc.message;

  return errors;
}

export function ArtistPortal({ initialTracks, panelSize }: ArtistPortalProps) {
  // Computed once per mount so a delivery started before midnight keeps its date.
  const [today] = useState(todayIso);

  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, MetadataValues>>({});
  const [errors, setErrors] = useState<MetadataErrors>({});
  const [rejected, setRejected] = useState<{ fileName: string; reason: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [generatingIsrc, setGeneratingIsrc] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [focusRegion, setFocusRegion] = useState<Region | "All">("All");
  const [notice, setNotice] = useState<Notice | null>(null);

  const active = staged.find((s) => s.id === activeId) ?? null;
  const formKey = active?.id ?? DRAFT_KEY;
  const activeMeta = meta[formKey] ?? blankMeta(today);

  const summary = useMemo(() => summariseCatalog(tracks), [tracks]);

  const handleAccepted = useCallback(
    (files: StagedFile[]) => {
      setRejected([]);
      setNotice(null);

      setStaged((prev) => {
        const seen = new Set(prev.map((p) => p.fileName));
        const fresh = files.filter((f) => !seen.has(f.fileName));
        return [...prev, ...fresh];
      });

      setMeta((prev) => {
        const next = { ...prev };
        for (const file of files) {
          if (next[file.id]) continue;
          const parsed = parseFileName(file.fileName);
          next[file.id] = {
            title: parsed.title,
            primaryArtist: parsed.primaryArtist,
            featuredArtists: parsed.featuredArtists.join(", "),
            releaseDate: today,
            isrc: "",
          };
        }
        return next;
      });

      setActiveId((current) => current ?? files[0]?.id ?? null);
    },
    [today],
  );

  const handleRejected = useCallback((issues: { fileName: string; reason: string }[]) => {
    setRejected(issues);
  }, []);

  const removeStaged = useCallback((id: string) => {
    setStaged((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    setMeta((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveId((current) => (current === id ? null : current));
    setErrors({});
  }, []);

  const patchMeta = useCallback(
    (patch: Partial<MetadataValues>) => {
      setMeta((prev) => ({ ...prev, [formKey]: { ...(prev[formKey] ?? blankMeta(today)), ...patch } }));
      setErrors((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(patch) as (keyof MetadataValues)[]) delete next[key];
        return next;
      });
    },
    [formKey, today],
  );

  const handleGenerateIsrc = useCallback(async () => {
    setGeneratingIsrc(true);
    setNotice(null);

    const registrant = activeMeta.primaryArtist || "BMAT";
    const releaseDate = isValidIsoDate(activeMeta.releaseDate) ? activeMeta.releaseDate : today;
    const params = new URLSearchParams({ registrant, releaseDate });

    try {
      const res = await fetch(`/api/tracks?${params}`, { method: "PUT" });
      const body = (await res.json()) as { isrc?: string; error?: string };

      if (!res.ok || !body.isrc) throw new Error(body.error ?? "Could not allocate an ISRC.");

      patchMeta({ isrc: body.isrc });
      setErrors((prev) => ({ ...prev, isrc: undefined }));
      setNotice({ tone: "success", message: `Allocated ${body.isrc} to this recording.` });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "ISRC allocation failed.",
      });
    } finally {
      setGeneratingIsrc(false);
    }
  }, [activeMeta.primaryArtist, activeMeta.releaseDate, patchMeta, today]);

  const handleDeliver = useCallback(async () => {
    if (!active) return;

    const validation = validateMeta(activeMeta);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setNotice(null);

    const form = new FormData();
    form.set("audio", active.file, active.fileName);
    form.set("title", activeMeta.title.trim());
    form.set("primaryArtist", activeMeta.primaryArtist.trim());
    form.set("featuredArtists", activeMeta.featuredArtists.trim());
    form.set("releaseDate", activeMeta.releaseDate);
    form.set("isrc", activeMeta.isrc.trim());
    form.set(
      "durationSec",
      active.durationSec === null ? "" : String(Math.round(active.durationSec)),
    );

    try {
      const res = await fetch("/api/tracks", { method: "POST", body: form });
      const body = (await res.json()) as { track?: Track; error?: string; errors?: MetadataErrors };

      if (!res.ok || !body.track) {
        setErrors(body.errors ?? {});
        throw new Error(body.error ?? "Delivery failed.");
      }

      setTracks((prev) => [body.track as Track, ...prev]);
      setStaged((prev) => prev.filter((p) => p.id !== active.id));
      setMeta((prev) => {
        const next = { ...prev };
        delete next[active.id];
        return next;
      });
      setActiveId((current) => (current === active.id ? null : current));
      setErrors({});
      setNotice({
        tone: "success",
        message: `"${body.track.title}" delivered — matched to the panel, spins will start accruing.`,
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Delivery failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [active, activeMeta]);

  const handleDelete = useCallback(async (id: string) => {
    setPendingDeleteId(id);
    try {
      const res = await fetch(`/api/tracks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Could not remove that track.");
      }
      setTracks((prev) => prev.filter((t) => t.id !== id));
      setNotice({ tone: "success", message: "Track withdrawn from the catalogue." });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Could not remove that track.",
      });
    } finally {
      setPendingDeleteId(null);
    }
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <StatCards summary={summary} />

      {notice && (
        <div
          role="status"
          className={[
            "animate-rise flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs",
            notice.tone === "success"
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-red-500/40 bg-red-500/10 text-red-200",
          ].join(" ")}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-current opacity-70 hover:opacity-100"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      <section className="panel p-4 sm:p-5" aria-labelledby="deliver-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="deliver-heading" className="text-sm font-semibold tracking-tight">
              Deliver a master
            </h2>
            <p className="text-xs text-muted">
              Upload the audio, fill in the metadata, and BMAT assigns an ISRC before it goes to the{" "}
              {panelSize}-station Uganda FM panel.
            </p>
          </div>
          {staged.length > 0 && (
            <span className="chip">
              {staged.length} file{staged.length === 1 ? "" : "s"} staged
            </span>
          )}
        </div>

        <UploadDropzone onAccepted={handleAccepted} onRejected={handleRejected} />
        <RejectedFiles issues={rejected} />

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <p className="label mb-0">Staged files</p>

            {staged.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-4 py-8 text-center">
                <p className="text-xs font-medium text-foreground">No audio staged</p>
                <p className="text-[11px] leading-relaxed text-muted">
                  Drop an MP3 or WAV above. You can fill in the metadata and allocate an ISRC first
                  — delivery unlocks once a master is attached.
                </p>
              </div>
            ) : (
              <>
                <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                  {staged.map((file) => (
                    <StagedFileRow
                      key={file.id}
                      staged={file}
                      active={file.id === activeId}
                      onSelect={() => {
                        setActiveId(file.id);
                        setErrors({});
                      }}
                      onRemove={() => removeStaged(file.id)}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-muted">
                  Titles and artists are guessed from the file name — check them before delivering.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <TrackMetadataForm
              values={activeMeta}
              errors={errors}
              onChange={patchMeta}
              onGenerateIsrc={handleGenerateIsrc}
              generatingIsrc={generatingIsrc}
              staged={active}
              submitting={submitting}
              onSubmit={handleDeliver}
              onClear={() => {
                patchMeta(blankMeta(today));
                setErrors({});
              }}
              today={today}
            />

            {active && (
              <div className="panel bg-surface-2/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="label mb-0">Preview</p>
                  <span className="font-mono text-[11px] text-muted">{active.mimeType}</span>
                </div>
                <audio controls src={active.previewUrl} className="w-full" preload="metadata">
                  Your browser cannot play this audio file.
                </audio>
                <p className="mt-2 truncate font-mono text-[11px] text-muted">
                  Featuring:{" "}
                  {splitArtists(activeMeta.featuredArtists).length === 0
                    ? "none declared"
                    : splitArtists(activeMeta.featuredArtists).join(" · ")}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <RegionAirplayChart
        tracks={tracks}
        summary={summary}
        focusRegion={focusRegion}
        onFocusRegion={setFocusRegion}
      />

      <AirplayTable
        tracks={tracks}
        focusRegion={focusRegion}
        onFocusRegion={setFocusRegion}
        onDelete={handleDelete}
        pendingDeleteId={pendingDeleteId}
      />

      <p className="pb-2 text-center text-[11px] text-muted">
        Spin counts combine playout logs from {panelSize} Ugandan FM stations across Central,
        Eastern, Western and Northern regions. Seeded catalogue rows are demo data.
      </p>
    </div>
  );
}
