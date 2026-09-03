"use client";

import { checkIsrc } from "@/lib/isrc";
import { formatBytes, formatDuration } from "@/lib/format";
import type { StagedFile } from "@/lib/upload";

export interface MetadataValues {
  title: string;
  primaryArtist: string;
  featuredArtists: string;
  releaseDate: string;
  isrc: string;
}

export interface MetadataErrors {
  title?: string;
  primaryArtist?: string;
  featuredArtists?: string;
  releaseDate?: string;
  isrc?: string;
}

interface TrackMetadataFormProps {
  values: MetadataValues;
  errors: MetadataErrors;
  onChange: (patch: Partial<MetadataValues>) => void;
  onGenerateIsrc: () => void;
  generatingIsrc: boolean;
  staged: StagedFile | null;
  submitting: boolean;
  onSubmit: () => void;
  onClear: () => void;
  today: string;
}

export function TrackMetadataForm({
  values,
  errors,
  onChange,
  onGenerateIsrc,
  generatingIsrc,
  staged,
  submitting,
  onSubmit,
  onClear,
  today,
}: TrackMetadataFormProps) {
  const isrcCheck = checkIsrc(values.isrc);
  const canSubmit =
    !submitting &&
    staged !== null &&
    values.title.trim().length > 0 &&
    values.primaryArtist.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(values.releaseDate) &&
    isrcCheck.valid;

  return (
    <form
      className="panel p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Delivery metadata</h3>
          <p className="text-xs text-muted">
            Required by the Uganda FM panel for spin matching and royalty splits.
          </p>
        </div>
        {staged && (
          <span className="chip font-mono">
            {staged.format} · {formatBytes(staged.sizeBytes)} · {formatDuration(staged.durationSec)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="md-title">
            Song title <span className="text-brand">*</span>
          </label>
          <input
            id="md-title"
            className="field"
            placeholder="Nkwagala"
            value={values.title}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "md-title-error" : undefined}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          {errors.title && (
            <p id="md-title-error" className="mt-1 text-[11px] text-red-300">
              {errors.title}
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="md-artist">
            Primary artist <span className="text-brand">*</span>
          </label>
          <input
            id="md-artist"
            className="field"
            placeholder="Ray Bwete"
            value={values.primaryArtist}
            aria-invalid={Boolean(errors.primaryArtist)}
            aria-describedby={errors.primaryArtist ? "md-artist-error" : undefined}
            onChange={(e) => onChange({ primaryArtist: e.target.value })}
          />
          {errors.primaryArtist && (
            <p id="md-artist-error" className="mt-1 text-[11px] text-red-300">
              {errors.primaryArtist}
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="md-featured">
            Featured artists
          </label>
          <input
            id="md-featured"
            className="field"
            placeholder="Aisha Nakato, Peter Okoth"
            value={values.featuredArtists}
            aria-describedby="md-featured-hint"
            onChange={(e) => onChange({ featuredArtists: e.target.value })}
          />
          <p id="md-featured-hint" className="mt-1 text-[11px] text-muted">
            Comma separated — each feature gets its own royalty share.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="md-date">
            Release date <span className="text-brand">*</span>
          </label>
          <input
            id="md-date"
            type="date"
            className="field"
            max="2099-12-31"
            value={values.releaseDate}
            aria-invalid={Boolean(errors.releaseDate)}
            aria-describedby={errors.releaseDate ? "md-date-error" : undefined}
            onChange={(e) => onChange({ releaseDate: e.target.value })}
          />
          {errors.releaseDate ? (
            <p id="md-date-error" className="mt-1 text-[11px] text-red-300">
              {errors.releaseDate}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted">Drives the ISRC year block.</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="md-isrc">
            ISRC <span className="text-brand">*</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="md-isrc"
              className="field font-mono uppercase"
              placeholder="UG-ESD-26-00001"
              value={values.isrc}
              aria-invalid={Boolean(errors.isrc)}
              aria-describedby="md-isrc-status"
              spellCheck={false}
              onChange={(e) => onChange({ isrc: e.target.value.toUpperCase() })}
            />
            <button
              type="button"
              className="btn btn-ghost sm:w-48"
              onClick={onGenerateIsrc}
              disabled={generatingIsrc}
            >
              {generatingIsrc ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border border-muted border-t-brand" />
                  Allocating…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 0 0 6 5.3M4 15a8 8 0 0 0 14 2.7"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Generate ISRC
                </>
              )}
            </button>
          </div>
          <p
            id="md-isrc-status"
            className={[
              "mt-1.5 flex items-center gap-1.5 text-[11px]",
              errors.isrc
                ? "text-red-300"
                : isrcCheck.valid
                  ? "text-accent"
                  : "text-muted",
            ].join(" ")}
          >
            <span aria-hidden>{errors.isrc ? "✕" : isrcCheck.valid ? "✓" : "•"}</span>
            {errors.isrc ?? isrcCheck.message}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <button type="button" className="btn btn-ghost" onClick={onClear}>
          Clear form
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {submitting
            ? "Delivering…"
            : staged
              ? "Deliver to catalogue"
              : "Attach audio to deliver"}
        </button>
      </div>

      <p className="mt-2 text-right text-[11px] text-muted">
        Release window opens {today}. Masters are matched to spin logs within 24 hours.
      </p>
    </form>
  );
}
