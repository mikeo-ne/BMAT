"use client";

import { DemoStudio } from "@/components/demo-studio";
import { useAuth } from "@/components/auth-provider";
import { sessionScope } from "@/lib/auth-types";
import { ReleaseAgreementPanel } from "@/components/authenticated-splits";
import { cacheSnapshot } from "@/lib/browser-cache";
import { authFetch } from "@/lib/auth-client";
import { MasterSignaturePreview } from "@/components/master-signature-preview";
import { useArtistNavigation } from "@/components/artist-navigation";
import type { ArtistView } from "@/lib/workspaces";
import { CapturedFeedNotice } from "@/components/captured-feed-notice";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  CheckCircle2,
  ChevronDown,
  Disc3,
  FileAudio2,
  Headphones,
  Music2,
  Plus,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  ArtistLibrary,
  ArtistSpotlight,
  selectLibraryArtist,
} from "@/components/artist-library";
import {
  artistSelectionFromHash,
  REFERENCE_RECORDINGS,
  type PublicArtistId,
} from "@/lib/artist-library";
import { AirplayTable } from "@/components/airplay-table";
import { AirplayKpis } from "@/components/airplay-kpis";
import { AirplayTrend } from "@/components/airplay-trend";
import { DeliverySplitEditor } from "@/components/delivery-split-editor";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { PageIntro } from "@/components/page-intro";
import { RecentSpins } from "@/components/recent-spins";
import { UgandaAirplayMap } from "@/components/uganda-airplay-map";
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
import {
  clearApprovals,
  createDeliveryParties,
  validateDeliveryParties,
  type DeliveryParty,
} from "@/lib/delivery-splits";
import { formatNumber, initials, isValidIsoDate } from "@/lib/format";
import { checkIsrc } from "@/lib/isrc";
import { eatDate, filterBroadcastLog, type BroadcastSpin } from "@/lib/playout";
import {
  catalogueWithCapturedStats,
  currentCapturedWindow,
} from "@/lib/captured-airplay";
import { useCapturedFeed } from "@/lib/use-captured-feed";
import { REGIONS, type Region } from "@/lib/regions";
import type { Track } from "@/lib/types";
import { parseFileName, type StagedFile } from "@/lib/upload";

interface ArtistPortalProps {
  initialTracks: Track[];
  panelSize: number;
  now?: string;
  initialEvents?: BroadcastSpin[];
  canPoll?: boolean;
  deliveryAvailable?: boolean;
  initialView?: View;
}
interface Notice {
  tone: "success" | "error";
  message: string;
}
type View = ArtistView;
const DRAFT_KEY = "__draft__";
function blankMeta(releaseDate: string): MetadataValues {
  return {
    title: "",
    primaryArtist: "",
    featuredArtists: "",
    releaseDate,
    isrc: "",
  };
}
function validateMeta(values: MetadataValues): MetadataErrors {
  const errors: MetadataErrors = {};
  if (!values.title.trim()) errors.title = "Song title is required.";
  if (!values.primaryArtist.trim())
    errors.primaryArtist = "Primary artist is required.";
  if (!isValidIsoDate(values.releaseDate))
    errors.releaseDate = "Pick a valid release date.";
  const isrc = checkIsrc(values.isrc);
  if (!isrc.valid) errors.isrc = isrc.message;
  return errors;
}
const fingerprint = (file: StagedFile) =>
  `${file.fileName}:${file.sizeBytes}:${file.file.lastModified}`;

export function ArtistPortal({
  initialTracks,
  panelSize,
  now,
  initialEvents = [],
  canPoll = false,
  deliveryAvailable = true,
  initialView = "overview",
}: ArtistPortalProps) {
  const { session } = useAuth();
  const [dataScope] = useState(() => sessionScope(session.user));
  const [approvedRelease, setApprovedRelease] = useState<{
    id: string;
    key: string;
  } | null>(null);
  const [sharePublic, setSharePublic] = useState(false);
  const onAgreementReady = useCallback(
    (id: string | null, key: string) =>
      setApprovedRelease((old) =>
        id
          ? old?.id === id && old.key === key
            ? old
            : { id, key }
          : old?.key === key
            ? null
            : old,
      ),
    [],
  );
  const [today] = useState(() => eatDate(now ?? new Date().toISOString()));
  const [reference] = useState(() => now ?? new Date().toISOString());
  const [view, setView] = useArtistNavigation(initialView);
  function showMusic(artistId?: PublicArtistId) {
    const selection = artistId ?? artistSelectionFromHash(window.location.hash);
    // Push the library entry before adding its filter hash, so Back returns to the previous tab.
    setView("music");
    selectLibraryArtist(selection);
  }
  const [storedTracks, setTracks] = useState<Track[]>(initialTracks);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, MetadataValues>>({});
  const [splits, setSplits] = useState<Record<string, DeliveryParty[]>>({});
  const [errors, setErrors] = useState<MetadataErrors>({});
  const [rejected, setRejected] = useState<
    { fileName: string; reason: string }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [allocating, setAllocating] = useState<string[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [focusRegion, setFocusRegion] = useState<Region | "All">("All");
  const [days, setDays] = useState<7 | 14>(14);
  const [artist, setArtist] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  const active = staged.find((file) => file.id === activeId) ?? null;
  const formKey = active?.id ?? DRAFT_KEY;
  const activeMeta = meta[formKey] ?? blankMeta(today);
  const activeParties =
    splits[formKey] ?? createDeliveryParties(activeMeta.primaryArtist);
  const splitIssues = validateDeliveryParties(activeParties, false);
  const agreementDraftKey = JSON.stringify([
    formKey,
    activeMeta,
    activeParties.map(({ signature: _signature, ...party }) => {
      void _signature;
      return party;
    }),
    active?.fingerprint?.sourceSha256,
  ]);
  const agreementId =
    approvedRelease?.key === agreementDraftKey ? approvedRelease.id : null;
  const feed = useCapturedFeed(
    initialEvents,
    reference,
    canPoll && (view === "overview" || view === "catalogue"),
  );
  const tracks = useMemo(
    () =>
      catalogueWithCapturedStats(storedTracks, feed.events, new Date(feed.now)),
    [storedTracks, feed.events, feed.now],
  );
  useEffect(() => {
    if (session.user && dataScope === sessionScope(session.user)) {
      void cacheSnapshot(session.user.id, "catalogue", storedTracks);
      void cacheSnapshot(session.user.id, "spins", feed.events);
    }
  }, [session.user, storedTracks, feed.events, dataScope]);
  const allEvents = useMemo(
    () => currentCapturedWindow(feed.events, new Date(feed.now)),
    [feed.events, feed.now],
  );
  const contextualEvents = useMemo(
    () => filterBroadcastLog(allEvents, { days, artist }),
    [allEvents, days, artist],
  );
  const filteredEvents = useMemo(
    () =>
      contextualEvents.filter(
        (event) => focusRegion === "All" || event.region === focusRegion,
      ),
    [contextualEvents, focusRegion],
  );
  const artists = [
    ...new Set(tracks.map((track) => track.primaryArtist)),
  ].sort();
  const visibleTracks = catalogueWithCapturedStats(
    storedTracks,
    filteredEvents,
    new Date(feed.now),
  )
    .filter((track) => !artist || track.primaryArtist === artist)
    .sort(
      (a, b) => b.totalSpins - a.totalSpins || a.title.localeCompare(b.title),
    );
  const topTracks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of filteredEvents)
      if (event.trackId)
        counts.set(event.trackId, (counts.get(event.trackId) ?? 0) + 1);
    return [...tracks]
      .map((track) => ({ track, count: counts.get(track.id) ?? 0 }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [filteredEvents, tracks]);

  const allocate = useCallback(
    async (key: string, releaseDate: string, expectedIsrc = "") => {
      if (!deliveryAvailable) return;
      setAllocating((previous) => [...previous, key]);
      try {
        const response = await authFetch(
          `/api/tracks?${new URLSearchParams({ releaseDate })}`,
          { method: "PUT" },
        );
        const result = (await response.json()) as {
          isrc?: string;
          error?: string;
        };
        if (!response.ok || !result.isrc)
          throw new Error(
            result.error ?? "Could not reserve a local ISRC tag.",
          );
        // Never overwrite a pasted ISRC or recreate a removed staged file after an async response.
        setMeta((previous) =>
          previous[key] && previous[key].isrc === expectedIsrc
            ? { ...previous, [key]: { ...previous[key], isrc: result.isrc! } }
            : previous,
        );
        setSplits((previous) =>
          previous[key]
            ? { ...previous, [key]: clearApprovals(previous[key]) }
            : previous,
        );
      } catch (error) {
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "ISRC allocation failed. Retry with Generate ISRC.",
        });
      } finally {
        setAllocating((previous) => previous.filter((value) => value !== key));
      }
    },
    [deliveryAvailable],
  );

  const handleAccepted = useCallback(
    (files: StagedFile[]) => {
      setRejected([]);
      setNotice(null);
      const seen = new Set(staged.map(fingerprint));
      const fresh = files.filter((file) => {
        const identity = fingerprint(file);
        if (seen.has(identity)) {
          URL.revokeObjectURL(file.previewUrl);
          return false;
        }
        seen.add(identity);
        return true;
      });
      if (!fresh.length) {
        setNotice({
          tone: "error",
          message:
            "These files are already staged. Select their existing entries below.",
        });
        return;
      }
      const draft = meta[DRAFT_KEY];
      const details = fresh.map((file, index) => {
        previewUrls.current.add(file.previewUrl);
        const parsed = parseFileName(file.fileName);
        const values = {
          title: parsed.title,
          primaryArtist: parsed.primaryArtist,
          featuredArtists: parsed.featuredArtists.join(", "),
          releaseDate: today,
          isrc: "",
          ...(index === 0 && !staged.length && draft
            ? Object.fromEntries(
                Object.entries(draft).filter(([, value]) => value !== ""),
              )
            : {}),
        } as MetadataValues;
        return { file, values };
      });
      setStaged((previous) => [...previous, ...fresh]);
      setMeta((previous) => ({
        ...previous,
        ...Object.fromEntries(
          details.map(({ file, values }) => [file.id, values]),
        ),
      }));
      setSplits((previous) => ({
        ...previous,
        ...Object.fromEntries(
          details.map(({ file, values }, index) => [
            file.id,
            index === 0 && !staged.length && previous[DRAFT_KEY]
              ? clearApprovals(previous[DRAFT_KEY]).map((party) =>
                  party.id === "primary"
                    ? { ...party, name: values.primaryArtist }
                    : party,
                )
              : createDeliveryParties(values.primaryArtist),
          ]),
        ),
      }));
      setActiveId((current) => current ?? fresh[0].id);
      for (const { file, values } of details)
        if (!values.isrc) void allocate(file.id, values.releaseDate);
    },
    [staged, meta, today, allocate],
  );

  const removeStaged = useCallback(
    (id: string) => {
      const file = staged.find((entry) => entry.id === id);
      if (file) {
        URL.revokeObjectURL(file.previewUrl);
        previewUrls.current.delete(file.previewUrl);
      }
      setStaged((previous) => previous.filter((entry) => entry.id !== id));
      setMeta((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setSplits((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setActiveId((current) =>
        current === id
          ? (staged.find((entry) => entry.id !== id)?.id ?? null)
          : current,
      );
      setErrors({});
    },
    [staged],
  );

  const patchMeta = useCallback(
    (patch: Partial<MetadataValues>) => {
      setMeta((previous) => ({
        ...previous,
        [formKey]: { ...(previous[formKey] ?? blankMeta(today)), ...patch },
      }));
      if (
        [
          "title",
          "primaryArtist",
          "featuredArtists",
          "isrc",
          "releaseDate",
        ].some((key) => key in patch)
      )
        setSplits((previous) => {
          const parties =
            previous[formKey] ??
            createDeliveryParties(activeMeta.primaryArtist);
          return {
            ...previous,
            [formKey]: clearApprovals(
              parties.map((party) =>
                party.id === "primary" && patch.primaryArtist !== undefined
                  ? { ...party, name: patch.primaryArtist }
                  : party,
              ),
            ),
          };
        });
      setErrors((previous) => {
        const next = { ...previous };
        for (const key of Object.keys(patch) as (keyof MetadataValues)[])
          delete next[key];
        delete next.ownership;
        return next;
      });
    },
    [formKey, today, activeMeta.primaryArtist],
  );

  const handleDeliver = useCallback(async () => {
    if (!active || submitting || !deliveryAvailable) return;
    const validation = validateMeta(activeMeta);
    const ownershipIssues = validateDeliveryParties(activeParties, false);
    if (!agreementId)
      ownershipIssues.push(
        "Every collaborator must approve the current account-bound agreement.",
      );
    if (ownershipIssues.length)
      validation.ownership = ownershipIssues.join(" ");
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setSubmitting(true);
    setNotice(null);
    const form = new FormData();
    form.set("audio", active.file, active.fileName);
    form.set("fingerprint", JSON.stringify(active.fingerprint ?? null));
    form.set("agreementId", agreementId ?? "");
    form.set("publicCharts", String(sharePublic));
    for (const [key, value] of Object.entries(activeMeta))
      form.set(key, value.trim());
    form.set(
      "durationSec",
      active.durationSec === null ? "" : String(active.durationSec),
    );
    form.set(
      "ownership",
      JSON.stringify({
        version: 1,
        approvalMethod: "local-acknowledgement",
        parties: activeParties,
      }),
    );
    try {
      const response = await authFetch("/api/tracks", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        track?: Track;
        error?: string;
        errors?: MetadataErrors;
      };
      if (!response.ok || !result.track) {
        setErrors(result.errors ?? {});
        throw new Error(result.error ?? "Delivery failed.");
      }
      setTracks((previous) => [result.track!, ...previous]);
      removeStaged(active.id);
      setNotice({
        tone: "success",
        message: `“${result.track.title}” saved with its metadata and approved split sheet. No airplay is generated; spins require actual captured records.`,
      });
      setView("catalogue");
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Delivery failed. Your staged master is still available.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    active,
    activeMeta,
    activeParties,
    agreementId,
    sharePublic,
    removeStaged,
    submitting,
    deliveryAvailable,
    setView,
  ]);

  const handleDelete = useCallback(async (id: string) => {
    if (
      !window.confirm(
        "Withdraw this recording from the catalogue? Its locally stored master and approved split sheet will also be removed.",
      )
    )
      return;
    setPendingDeleteId(id);
    try {
      const response = await authFetch(`/api/tracks/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not withdraw that track.");
      setTracks((previous) => previous.filter((track) => track.id !== id));
      setNotice({
        tone: "success",
        message: "Track withdrawn from the catalogue.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not remove that track.",
      });
    } finally {
      setPendingDeleteId(null);
    }
  }, []);

  const tabs: {
    id: View;
    label: string;
    icon: typeof AudioLines;
    count?: number;
  }[] = [
    { id: "overview", label: "Airplay overview", icon: AudioLines },
    {
      id: "music",
      label: "Artists & music",
      icon: Music2,
      count: REFERENCE_RECORDINGS.length,
    },
    {
      id: "catalogue",
      label: "Your catalogue",
      icon: Disc3,
      count: tracks.length,
    },
    {
      id: "delivery",
      label: "Master delivery",
      icon: Upload,
      count: staged.length || undefined,
    },
  ];
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <PageIntro
        eyebrow="ARTIST & LABEL INTELLIGENCE"
        title={
          view === "music"
            ? "Real artists. Their real music."
            : view === "delivery"
              ? "Give your next release a head start."
              : view === "catalogue"
                ? "Every master. One source of truth."
                : "Your music. Measured."
        }
        description={
          view === "music"
            ? "BARANGA, MR FALLBACK, SOUNDLYKBB and TAI DAI. Explore sourced release details, preserve the credits, and listen through the original music platform."
            : view === "delivery"
              ? "Stage your audio, connect the metadata, and agree the rights. One clear path to delivery."
              : "A clearer picture of your sound across Uganda. Follow the spins, understand the audience, and own what comes next."
        }
        actions={
          <>
            <OnboardingGuide />
            {view !== "music" && (
              <button
                type="button"
                className="btn btn-ghost !text-xs"
                onClick={() => showMusic()}
              >
                <Music2 size={15} />
                Artists & music
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary !text-xs"
              onClick={() => setView("delivery")}
            >
              <Plus size={16} />
              Deliver a master
            </button>
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div
          role="tablist"
          aria-label="Artist portal views"
          className="grid w-full min-w-0 grid-cols-2 gap-x-4 min-[540px]:flex min-[540px]:w-auto min-[540px]:gap-7"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`artist-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              aria-controls={`artist-panel-${tab.id}`}
              tabIndex={view === tab.id ? 0 : -1}
              onClick={() =>
                tab.id === "music" ? showMusic() : setView(tab.id)
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const next =
                    tabs[
                      (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                        tabs.length
                    ];
                  if (next.id === "music") showMusic();
                  else setView(next.id);
                  document.getElementById(`artist-tab-${next.id}`)?.focus();
                }
              }}
              className={`-mb-px flex items-center gap-1.5 border-b-2 pb-3.5 pt-1.5 text-[11px] font-medium sm:gap-2 ${view === tab.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"}`}
            >
              <tab.icon size={14} className="hidden min-[420px]:block" />
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] ${view === tab.id ? "bg-brand/10" : "bg-line/50"}`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="mb-3 hidden items-center gap-1.5 text-[10px] text-muted xl:flex">
          <span className="h-1 w-1 rounded-full bg-brand" />
          {view === "music"
            ? "Public references · not a label roster"
            : "Real release catalogue · Uganda"}
        </span>
      </div>
      {notice && (
        <div
          role="status"
          className={`animate-rise flex items-start justify-between gap-3 rounded-xl border p-3.5 text-xs ${notice.tone === "success" ? "border-brand/20 bg-brand/5 text-brand" : "border-red-400/20 bg-red-500/5 text-red-400"}`}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div
        role="tabpanel"
        id={`artist-panel-${view}`}
        aria-labelledby={`artist-tab-${view}`}
        className="flex flex-col gap-5"
      >
        {view !== "delivery" && view !== "music" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <Headphones size={13} />
                </span>
                <span>
                  <strong className="font-medium text-foreground">
                    Uganda broadcast panel
                  </strong>{" "}
                  <span className="hidden sm:inline">
                    / {panelSize} directory stations · licensed sources required
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative">
                  <span className="sr-only">Filter by artist</span>
                  <select
                    aria-label="Filter by artist"
                    className="field !w-auto max-w-[180px] appearance-none !bg-surface !py-2 !pr-7 !text-[10px]"
                    value={artist}
                    onChange={(event) => setArtist(event.target.value)}
                  >
                    <option value="">Entire label</option>
                    {artists.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                  <ChevronDown
                    size={11}
                    className="pointer-events-none absolute right-2.5 top-3 text-muted"
                  />
                </label>
                <label>
                  <span className="sr-only">Reporting window</span>
                  <select
                    aria-label="Reporting window"
                    className="field !w-auto !bg-surface !py-2 !text-[10px]"
                    value={days}
                    onChange={(event) =>
                      setDays(Number(event.target.value) as 7 | 14)
                    }
                  >
                    <option value={14}>Last 14 reporting days</option>
                    <option value={7}>Last 7 reporting days</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">Filter by region</span>
                  <select
                    aria-label="Filter by region"
                    className="field !w-auto !bg-surface !py-2 !text-[10px]"
                    value={focusRegion}
                    onChange={(event) =>
                      setFocusRegion(event.target.value as Region | "All")
                    }
                  >
                    <option value="All">All Uganda</option>
                    {REGIONS.map((region) => (
                      <option key={region}>{region}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <AirplayKpis
              catalogue={tracks}
              events={filteredEvents}
              scope={`${days} days, ${focusRegion}`}
            />
          </>
        )}
        {(view === "overview" || view === "catalogue") && (
          <CapturedFeedNotice unavailable={feed.unavailable} now={feed.now} />
        )}
        {view === "music" && (
          <ArtistLibrary onDeliver={() => setView("delivery")} />
        )}
        {view === "overview" && (
          <>
            <ArtistSpotlight onSelect={showMusic} />
            <div className="grid gap-4 2xl:grid-cols-[1.35fr_1fr] xl:grid-cols-[1.2fr_1fr]">
              <UgandaAirplayMap
                events={contextualEvents}
                focusRegion={focusRegion}
                onFocusRegion={setFocusRegion}
              />
              <AirplayTrend events={filteredEvents} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">THE RECORDS IN ROTATION</p>
                <h3 className="mt-1 text-sm font-semibold">
                  Leading your airplay
                </h3>
              </div>
              <button
                type="button"
                className="flex items-center gap-1 text-[10px] font-medium text-brand"
                onClick={() => setView("catalogue")}
              >
                All recordings
                <ArrowRight size={12} />
              </button>
            </div>
            {topTracks.length === 0 && (
              <div className="panel border-dashed p-5 text-xs leading-relaxed text-muted">
                No captured plays have been ingested in this reporting window.
                Your real release catalogue is ready; connect a licensed
                station/capture integration to populate rankings and evidence.
                Public music links are not proof of radio airplay.
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              {topTracks.map(({ track, count }, i) => (
                <div
                  key={track.id}
                  className="panel flex items-center gap-3 p-4"
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${i === 0 ? "bg-[#e5eee4] text-[#456b46]" : i === 1 ? "bg-[#e8e6ef] text-[#79678d]" : "bg-[#f5ead9] text-[#a1834c]"}`}
                  >
                    {initials(track.primaryArtist)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {track.title}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-muted">
                      {track.primaryArtist}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold tracking-tight tabular-nums">
                      {formatNumber(count)}
                    </p>
                    <p className="text-[9px] text-muted">spins</p>
                  </div>
                </div>
              ))}
            </div>
            <RecentSpins events={filteredEvents} />
            <DemoStudio />
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand/15 bg-brand/5 px-5 py-4">
              <div className="flex items-center gap-3">
                <ShieldCheck size={22} className="text-brand" />
                <div>
                  <p className="text-xs font-medium">
                    Your next release starts with the right metadata.
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    WAV / MP3 masters, local ISRC reservation and collaborator
                    approvals.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs font-medium text-brand"
                onClick={() => setView("delivery")}
              >
                Prepare a master
                <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
        {view === "delivery" && (
          <section
            className="panel p-4 sm:p-6"
            aria-labelledby="deliver-heading"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">THE DELIVERY DESK</p>
                <h3
                  id="deliver-heading"
                  className="mt-1.5 text-base font-semibold"
                >
                  Deliver a master
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Your audio and rights metadata stay together, from staging to
                  catalogue.
                </p>
              </div>
              <ol
                className="flex items-center gap-2 text-[10px] text-muted"
                aria-label="Master delivery progress"
              >
                {[
                  { label: "Audio", done: !!active },
                  {
                    label: "Metadata",
                    done:
                      !!active &&
                      Object.keys(validateMeta(activeMeta)).length === 0,
                  },
                  {
                    label: "Approvals",
                    done: !!active && !!agreementId,
                  },
                ].map((step, index) => (
                  <li key={step.label} className="flex items-center gap-1.5">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] ${step.done ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted"}`}
                    >
                      {step.done ? <CheckCircle2 size={11} /> : index + 1}
                    </span>
                    {step.label}
                    {index < 2 && <span className="mx-1 h-px w-3 bg-line" />}
                  </li>
                ))}
              </ol>
            </div>
            {!deliveryAvailable && (
              <p
                role="status"
                className="mb-4 rounded-xl border border-brand/20 bg-brand/5 p-4 text-xs leading-relaxed text-muted"
              >
                Local staging, playback and rights-sheet previews are available.
                Server delivery and local-tag reservation are disabled here
                until authenticated durable master storage is configured. No
                file will be uploaded or reported saved.
              </p>
            )}
            <UploadDropzone
              onAccepted={handleAccepted}
              onRejected={setRejected}
            />
            <RejectedFiles issues={rejected} />
            <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="eyebrow mb-3">STAGED MASTERS · {staged.length}</p>
                {staged.length ? (
                  <div className="space-y-2">
                    {staged.map((file) => (
                      <StagedFileRow
                        key={file.id}
                        staged={file}
                        active={file.id === activeId}
                        onSelect={() => {
                          if (!submitting) {
                            setActiveId(file.id);
                            setErrors({});
                          }
                        }}
                        onRemove={() => {
                          if (!submitting) removeStaged(file.id);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-line p-5 text-center">
                    <FileAudio2 size={27} className="mb-3 text-muted/50" />
                    <p className="text-xs font-medium">No audio staged</p>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                      Drop a master above, or prepare its metadata first.
                    </p>
                  </div>
                )}
                {active && (
                  <div className="mt-4 rounded-xl border border-line bg-surface-2/50 p-3.5">
                    <p className="mb-3 flex items-center gap-1.5 text-[10px] font-medium">
                      <Headphones size={13} className="text-brand" />
                      Staged-file preview
                    </p>
                    <audio
                      key={active.id}
                      controls
                      aria-label={`Preview ${active.fileName}`}
                      src={active.previewUrl}
                      className="w-full"
                      preload="metadata"
                    />
                    <p className="mt-3 flex items-center gap-1.5 text-[9px] text-brand">
                      <CheckCircle2 size={11} />
                      Format and size checks passed
                    </p>
                  </div>
                )}
                <p className="mt-4 text-[10px] leading-relaxed text-muted">
                  Filenames prefill artist and title. Review each master
                  individually. Staged files stay in this tab until delivery or
                  removal.
                </p>
              </div>
              <div className="min-w-0">
                <fieldset disabled={submitting} className="min-w-0">
                  <TrackMetadataForm
                    values={activeMeta}
                    errors={errors}
                    onChange={patchMeta}
                    onGenerateIsrc={() => {
                      if (!meta[formKey])
                        setMeta((previous) => ({
                          ...previous,
                          [formKey]: activeMeta,
                        }));
                      void allocate(
                        formKey,
                        isValidIsoDate(activeMeta.releaseDate)
                          ? activeMeta.releaseDate
                          : today,
                        activeMeta.isrc,
                      );
                    }}
                    generationAvailable={deliveryAvailable}
                    generatingIsrc={allocating.includes(formKey)}
                    staged={active}
                    submitting={submitting}
                    onSubmit={() => void handleDeliver()}
                    onClear={() => {
                      patchMeta(blankMeta(today));
                      setErrors({});
                    }}
                    today={today}
                    submissionBlockedReason={
                      !deliveryAvailable
                        ? "Server delivery is disabled on this deployment."
                        : undefined
                    }
                    submissionReady={
                      deliveryAvailable &&
                      splitIssues.length === 0 &&
                      !!agreementId
                    }
                  >
                    {active?.fingerprint && (
                      <MasterSignaturePreview signature={active.fingerprint} />
                    )}
                    <DeliverySplitEditor
                      key={formKey}
                      authenticated
                      accountEmail={session.user?.email ?? ""}
                      parties={activeParties}
                      recordingReady={
                        Object.keys(validateMeta(activeMeta)).length === 0 &&
                        !allocating.includes(formKey)
                      }
                      onChange={(parties) => {
                        setSplits((previous) => ({
                          ...previous,
                          [formKey]: parties,
                        }));
                        setErrors((previous) => ({
                          ...previous,
                          ownership: undefined,
                        }));
                      }}
                    />
                    <ReleaseAgreementPanel
                      metadata={activeMeta}
                      parties={activeParties}
                      signature={active?.fingerprint}
                      draftKey={agreementDraftKey}
                      onReady={onAgreementReady}
                    />
                    <label className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
                      <input
                        type="checkbox"
                        checked={sharePublic}
                        onChange={(e) => setSharePublic(e.target.checked)}
                        className="accent-brand"
                      />
                      Opt this recording’s title and credited artists into
                      public national charts. Audio, private splits and account
                      details remain private.
                    </label>
                  </TrackMetadataForm>
                </fieldset>
              </div>
            </div>
          </section>
        )}
        {view === "catalogue" && (
          <>
            {tracks.some((t) => t.ownerId === session.user?.id) && (
              <section className="panel p-5" aria-label="Your playable masters">
                <h3 className="text-sm font-semibold">Your playable masters</h3>
                <div className="mt-4 space-y-4">
                  {tracks
                    .filter((t) => t.ownerId === session.user?.id)
                    .map((t) => (
                      <div key={t.id}>
                        <p className="mb-2 text-xs">
                          {t.title} · {t.primaryArtist}
                        </p>
                        <audio
                          controls
                          preload="metadata"
                          aria-label={`Play your master ${t.title}`}
                          src={`/api/tracks/${t.id}`}
                          className="h-10 w-full"
                        />
                      </div>
                    ))}
                </div>
              </section>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                <strong className="text-foreground">
                  {tracks.length} recordings
                </strong>{" "}
                · Sourced releases and authorised master deliveries
              </p>
              <span className="flex items-center gap-1.5 text-[10px] text-brand">
                <ShieldCheck size={13} />
                Delivery split sheets saved with new masters
              </span>
            </div>
            <AirplayTable
              tracks={visibleTracks}
              focusRegion={focusRegion}
              onFocusRegion={setFocusRegion}
              onDelete={handleDelete}
              pendingDeleteId={pendingDeleteId}
              description="Public releases and authorised deliveries. Airplay totals require captured broadcast records; missing ISRCs and masters are not invented."
            />
          </>
        )}
      </div>
      <p className="text-center text-[9px] leading-relaxed text-muted">
        {view === "music"
          ? "Public release research does not establish captured airplay. External players follow their provider’s terms and availability; no artist affiliation or permission to ingest a master is implied."
          : "Real source-linked releases; airplay statistics include captured records only. No capture data means unknown airplay, not zero national activity. Audio signatures and account-bound approvals do not establish rights ownership or official ISRC registration."}
      </p>
    </div>
  );
}
