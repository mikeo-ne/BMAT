"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { formatBytes, formatDuration } from "@/lib/format";
import {
  hasAudioSignature,
  MAX_UPLOAD_BYTES,
  probeAudio,
  validateAudioFile,
  type StagedFile,
} from "@/lib/upload";

interface UploadDropzoneProps {
  onAccepted: (files: StagedFile[]) => void;
  onRejected: (issues: { fileName: string; reason: string }[]) => void;
}

export function UploadDropzone({
  onAccepted,
  onRejected,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [probing, setProbing] = useState(false);
  const [checking, setChecking] = useState("");
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const dragDepth = useRef(0);

  // Revoke object URLs that never made it into the staged list.
  const pendingUrls = useRef<string[]>([]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingUrls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const ingest = useCallback(
    async (fileList: FileList | File[]) => {
      if (busyRef.current) return;
      const incoming = Array.from(fileList);
      if (incoming.length === 0) return;
      busyRef.current = true;
      setProbing(true);
      onRejected([]);
      const issues: { fileName: string; reason: string }[] = [];
      const staged: StagedFile[] = [];
      try {
        for (const file of incoming) {
          if (!mounted.current) break;
          setChecking(file.name);
          const reason = validateAudioFile(file);
          if (reason) {
            issues.push({ fileName: file.name, reason });
            continue;
          }
          const format = file.name.toLowerCase().endsWith(".wav")
            ? "WAV"
            : "MP3";
          const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
          if (!hasAudioSignature(header, format)) {
            issues.push({
              fileName: file.name,
              reason: `“${file.name}” does not contain a valid ${format} audio header.`,
            });
            continue;
          }
          const durationSec = await probeAudio(file);
          if (!mounted.current) break;
          if (durationSec === null || durationSec <= 0) {
            issues.push({
              fileName: file.name,
              reason: `“${file.name}” could not be decoded. Check the master’s encoding and try again.`,
            });
            continue;
          }
          const previewUrl = URL.createObjectURL(file);
          pendingUrls.current.push(previewUrl);
          staged.push({
            id: `stg_${crypto.randomUUID().slice(0, 8)}`,
            file,
            fileName: file.name,
            sizeBytes: file.size,
            format,
            mimeType: format === "WAV" ? "audio/wav" : "audio/mpeg",
            durationSec,
            previewUrl,
          });
        }
        if (!mounted.current) {
          for (const file of staged) URL.revokeObjectURL(file.previewUrl);
          return;
        }
        if (staged.length) {
          onAccepted(staged);
          const transferred = new Set(staged.map((file) => file.previewUrl));
          pendingUrls.current = pendingUrls.current.filter(
            (url) => !transferred.has(url),
          );
        }
        if (issues.length) onRejected(issues);
      } catch {
        for (const file of staged) URL.revokeObjectURL(file.previewUrl);
        if (mounted.current)
          onRejected([
            {
              fileName: "Audio master",
              reason: "The file could not be read. Please select it again.",
            },
          ]);
      } finally {
        busyRef.current = false;
        if (mounted.current) {
          setProbing(false);
          setChecking("");
        }
      }
    },
    [onAccepted, onRejected],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void ingest(event.dataTransfer.files);
    },
    [ingest],
  );

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-busy={probing}
      aria-disabled={probing}
      aria-label="Drop audio masters here, or press Enter to browse your files"
      onClick={() => {
        if (!probing) inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (!probing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors",
        dragging
          ? "border-brand bg-brand/10"
          : "border-brand/25 bg-brand/[0.025] hover:border-brand/60 hover:bg-brand/5",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav"
        multiple
        disabled={probing}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) void ingest(e.target.files);
          e.target.value = "";
        }}
      />

      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="text-brand"
      >
        <path
          d="M9 18V6l10-2v10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="6.5"
          cy="18"
          r="2.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle
          cx="16.5"
          cy="14"
          r="2.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>

      <p className="text-sm font-medium">
        {probing
          ? "Checking your audio master…"
          : dragging
            ? "Drop to stage for delivery"
            : "Drag & drop your masters here"}
      </p>
      <p className="max-w-sm text-xs leading-relaxed text-muted">
        MP3 or WAV only, up to {MAX_UPLOAD_BYTES / 1048576} MB per file. Drop
        several at once to batch a release, or{" "}
        <span className="text-foreground underline underline-offset-2">
          browse your computer
        </span>
        .
      </p>

      <div
        className="mt-2 flex items-center gap-2"
        role="status"
        aria-live="polite"
      >
        <span className="chip">MP3</span>
        <span className="chip">WAV</span>
        {probing ? (
          <span className="chip max-w-56 truncate text-brand">
            Validating · {checking}
          </span>
        ) : (
          <span className="text-[10px] text-muted">
            80 MB / file · header & playback checks
          </span>
        )}
      </div>
    </div>
  );
}

/** Small list under the dropzone showing why a file was refused. */
export function RejectedFiles({
  issues,
}: {
  issues: { fileName: string; reason: string }[];
}) {
  if (issues.length === 0) return null;

  return (
    <ul
      className="mt-3 space-y-1.5"
      role="alert"
      aria-label="Rejected audio files"
    >
      {issues.map((issue, i) => (
        <li
          key={`${issue.fileName}-${i}`}
          className="animate-rise flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          <span aria-hidden className="mt-0.5 text-red-400">
            ✕
          </span>
          <span>
            <strong className="block font-medium">{issue.fileName}</strong>
            {issue.reason}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StagedFileRow({
  staged,
  active,
  onSelect,
  onRemove,
}: {
  staged: StagedFile;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={[
        "animate-rise flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
        active
          ? "border-brand bg-brand/10"
          : "border-line bg-surface-2 hover:border-muted",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-pressed={active}
        aria-label={`Edit ${staged.fileName} metadata`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface text-[10px] font-semibold text-brand">
          {staged.format}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {staged.fileName}
          </span>
          <span className="block text-[11px] text-muted tabular-nums">
            {formatBytes(staged.sizeBytes)} ·{" "}
            {formatDuration(staged.durationSec)}
            {staged.durationSec === null ? " (unreadable duration)" : ""}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-muted transition-colors hover:text-red-300"
        aria-label={`Remove ${staged.fileName} from staging`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
