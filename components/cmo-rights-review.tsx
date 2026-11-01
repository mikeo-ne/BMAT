"use client";
import { useEffect, useRef, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { authFetch } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/format";
import {
  REVIEW_DECISIONS,
  REVIEW_LABELS,
  type ReviewDecision,
  type RightsReview,
} from "@/lib/rights-review-types";
export function CmoRightsReview({
  recordings,
}: {
  recordings: {
    id: string;
    title: string;
    primaryArtist: string;
    isrc: string;
  }[];
}) {
  const [reviews, setReviews] = useState<RightsReview[]>([]),
    [trackId, setTrackId] = useState(recordings[0]?.id ?? ""),
    [decision, setDecision] = useState<ReviewDecision>("needs-correction"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const requestId = useRef<string | null>(null);
  const changed = () => {
    requestId.current = null;
    setSaved(false);
  };
  useEffect(() => {
    let closed = false;
    void authFetch("/api/rights-reviews")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Review ledger unavailable.");
        if (!closed) setReviews(body.reviews);
      })
      .catch(() => {
        if (!closed)
          setError(
            "The rights-review ledger could not be loaded. Retry this page.",
          );
      });
    return () => {
      closed = true;
    };
  }, []);
  async function submit() {
    setBusy(true);
    setError("");
    setSaved(false);
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await authFetch("/api/rights-reviews", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: requestId.current,
            trackId,
            decision,
            note,
          }),
        }),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "The review was not saved.");
      setReviews((old) => [
        body.review,
        ...old.filter((r) => r.id !== body.review.id),
      ]);
      setSaved(true);
      requestId.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The review was not saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel p-4 sm:p-6"
      aria-label="CMO split resolution ledger"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FileCheck2 size={17} className="text-brand" />
        Audited split resolution
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Record an immutable review against the recording’s signed agreement. A
        correction requires new contributor approvals; an auditor cannot
        silently replace their shares. These account-bound decisions are not
        UPRS certification, statutory holds, payment instructions or legal
        adjudication.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-xs">
          Review recording
          <select
            className="field mt-2"
            value={trackId}
            onChange={(e) => {
              changed();
              setTrackId(e.target.value);
            }}
          >
            {recordings.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · {t.primaryArtist}
                {t.isrc ? ` · ${t.isrc}` : " · ISRC unknown"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Resolution decision
          <select
            className="field mt-2"
            value={decision}
            onChange={(e) => {
              changed();
              setDecision(e.target.value as ReviewDecision);
            }}
          >
            {REVIEW_DECISIONS.map((d) => (
              <option value={d} key={d}>
                {REVIEW_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-4 block text-xs">
        Review rationale
        <textarea
          className="field mt-2 min-h-24"
          maxLength={2000}
          value={note}
          onChange={(e) => {
            changed();
            setNote(e.target.value);
          }}
          placeholder="Describe the claim, supporting evidence and next action. Minimum 12 characters."
        />
      </label>
      <button
        type="button"
        className="btn btn-primary mt-4 !text-xs"
        disabled={busy || !trackId || note.trim().length < 12}
        onClick={() => void submit()}
      >
        {busy ? "Recording decision…" : "Record signed review decision"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-200">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-3 text-xs text-brand">
          Review and audit entry saved to the authoritative datastore.
        </p>
      )}
      <div className="mt-5 space-y-3 border-t border-line pt-4">
        {!reviews.length && (
          <p className="text-xs text-muted">
            No review decisions recorded. No clearance is inferred from an empty
            ledger.
          </p>
        )}
        {reviews.slice(0, 20).map((r) => (
          <article
            key={`${r.auditorId}:${r.id}`}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <p className="text-xs font-semibold">
              {r.title} · {REVIEW_LABELS[r.decision]}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted">
              {r.note}
            </p>
            <p className="mt-3 text-[10px] text-muted">
              {r.auditorName} · {formatDateTime(r.decidedAt)} ·{" "}
              {r.isrc || "ISRC unknown"}
            </p>
            <p className="mt-2 break-all font-mono text-[9px] text-muted">
              Agreement: {r.agreementId ?? "No signed agreement on file"}
              {r.bindingDigest ? ` · SHA-256 ${r.bindingDigest}` : ""}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
