"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCheck,
  Copy,
  FileCheck2,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { authFetch } from "@/lib/auth-client";
import {
  RIGHTS,
  RIGHT_LABELS,
  type DeliveryParty,
} from "@/lib/delivery-splits";
import type { AgreementInvitation, AgreementView } from "@/lib/agreement-types";
import type { MetadataValues } from "@/components/track-metadata-form";
import type { AudioSignature } from "@/lib/types";
function ready(agreement: AgreementView) {
  return agreement.parties.every((p) =>
    agreement.approvals.some(
      (a) => a.partyId === p.id && a.bindingDigest === agreement.bindingDigest,
    ),
  );
}
async function action(body: Record<string, unknown>) {
  const response = await authFetch("/api/agreements", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Agreement could not be saved.");
  return data;
}
function ApprovalCard({
  agreement,
  partyId,
  invite,
  onApproved,
}: {
  agreement: AgreementView;
  partyId: string;
  invite?: string;
  onApproved: (agreement: AgreementView) => void;
}) {
  const { session } = useAuth();
  const [typedName, setTypedName] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const party = agreement.parties.find((p) => p.id === partyId),
    signed = agreement.approvals.some((a) => a.partyId === partyId);
  if (!party) return null;
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {agreement.metadata.title} · {party.name}
        </h3>
        <span className="chip text-brand">
          <CheckCheck size={12} />
          {agreement.approvals.length}/{agreement.parties.length} signed
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {agreement.metadata.isrc} · {agreement.metadata.primaryArtist} ·{" "}
        {agreement.status}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[10px]">
          <thead>
            <tr>
              <th className="p-2">Collaborator</th>
              {RIGHTS.map((r) => (
                <th key={r} className="p-2">
                  {RIGHT_LABELS[r]}
                </th>
              ))}
              <th className="p-2">Sign-off</th>
            </tr>
          </thead>
          <tbody>
            {agreement.parties.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="p-2">
                  {p.name}
                  <span className="mt-1 block text-muted">{p.role}</span>
                </td>
                {RIGHTS.map((r) => (
                  <td key={r} className="p-2">
                    {p.shares[r]}%
                  </td>
                ))}
                <td className="p-2">
                  {agreement.approvals.some((a) => a.partyId === p.id)
                    ? "Signed in & approved"
                    : "Awaiting account approval"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 break-all font-mono text-[9px] text-muted">
        Agreement {agreement.id}
        <br />
        Binding SHA-256 {agreement.bindingDigest}
        <br />
        Source SHA-256 {agreement.sourceSha256}
      </p>
      {agreement.mock && (
        <p className="mt-2 text-[10px] text-amber-200">
          Development mock agreement. Not a production identity.
        </p>
      )}
      {signed ? (
        <p className="mt-4 text-xs text-brand">
          Your approval has been recorded against this exact version.
        </p>
      ) : (
        agreement.status === "pending" && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-3 text-[11px] text-muted">
              Signed in as {session.user?.email}. You can approve only your
              allocation; another collaborator must use their own account and
              private invitation.
            </p>
            <label className="label" htmlFor={`name-${agreement.id}`}>
              Type your credited name: {party.name}
            </label>
            <input
              id={`name-${agreement.id}`}
              className="field"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="off"
            />
            <label className="mt-3 flex gap-2 text-[11px] leading-relaxed text-muted">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="accent-brand"
              />
              I reviewed the audio hash, credits and all three rights pools, and
              approve this immutable agreement for my own allocation.
            </label>
            <button
              type="button"
              className="btn btn-primary mt-4 !text-xs"
              disabled={
                busy ||
                !ack ||
                typedName.trim().toLowerCase() !== party.name.toLowerCase()
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const data = await action({
                    action: "approve",
                    id: agreement.id,
                    partyId,
                    invite,
                    typedName,
                    acknowledgement: ack,
                  });
                  onApproved(data.agreement);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Approval failed.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FileCheck2 size={14} />
              {busy ? "Saving approval…" : "Approve my allocation"}
            </button>
          </div>
        )
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-200">
          {error}
        </p>
      )}
      <p className="mt-4 text-[10px] leading-relaxed text-muted">
        Account-authenticated attestation, not legal identity certification,
        email-provider verification or a regulated e-signature service. Material
        edits require a new agreement and new approvals.
      </p>
    </article>
  );
}
export function ReleaseAgreementPanel({
  metadata,
  parties,
  signature,
  draftKey,
  onReady,
}: {
  metadata: MetadataValues;
  parties: DeliveryParty[];
  signature?: AudioSignature;
  draftKey: string;
  onReady: (id: string | null, key: string) => void;
}) {
  const [stored, setStored] = useState<{
      key: string;
      agreement: AgreementView;
      invitations: AgreementInvitation[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState("");
  const current = stored?.key === draftKey ? stored : null,
    agreement = current?.agreement,
    approved = agreement?.status === "pending" && ready(agreement);
  useEffect(
    () => onReady(approved && agreement ? agreement.id : null, draftKey),
    [approved, agreement, draftKey, onReady],
  );
  const refresh = useCallback(async () => {
    if (!agreement) return;
    const response = await authFetch(
      "/api/agreements?id=" + encodeURIComponent(agreement.id),
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Refresh failed.");
    setStored((old) =>
      old && old.key === draftKey ? { ...old, agreement: body.agreement } : old,
    );
  }, [agreement, draftKey]);
  useEffect(() => {
    if (!agreement || agreement.status !== "pending") return;
    const timer = setInterval(
      () => void refresh().catch(() => undefined),
      8000,
    );
    return () => clearInterval(timer);
  }, [agreement, refresh]);
  return (
    <section
      className="mt-5 space-y-3 rounded-xl border border-brand/20 bg-brand/5 p-4"
      aria-label="Authenticated release agreement"
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <LockKeyhole size={15} className="text-brand" />
        Account-bound split sign-off
      </h4>
      <p className="text-[11px] leading-relaxed text-muted">
        Freeze the credits, source audio and split allocations. Every
        contributor must approve from their own authenticated account before
        this master can be released. Private invitation links are shown once;
        share them yourself, not through a configured email provider.
      </p>
      {!agreement ? (
        <button
          type="button"
          className="btn btn-primary !text-xs"
          disabled={!signature || !metadata.isrc || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const data = await action({
                action: "create",
                metadata,
                parties,
                sourceSha256: signature?.sourceSha256,
                fingerprintDigest: signature?.digest,
              });
              setStored({
                key: draftKey,
                agreement: data.agreement,
                invitations: data.invitations,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Agreement failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Creating immutable version…"
            : "Create agreement & invite collaborators"}
        </button>
      ) : (
        <>
          <ApprovalCard
            agreement={agreement}
            partyId="primary"
            onApproved={(next) =>
              setStored((old) => (old ? { ...old, agreement: next } : old))
            }
          />
          {current?.invitations.map((invite) => (
            <div
              key={invite.partyId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-[11px]"
            >
              <span>
                {invite.name} · {invite.email}
              </span>
              <button
                type="button"
                className="btn btn-ghost !text-[10px]"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      window.location.origin +
                        "/dashboard/splits?invite=" +
                        invite.token,
                    );
                    setCopied(invite.partyId);
                  } catch {
                    setError(
                      "Clipboard unavailable. Use a browser with secure-context clipboard support.",
                    );
                  }
                }}
              >
                <Copy size={12} />
                {copied === invite.partyId
                  ? "Private link copied"
                  : "Copy private invitation"}
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => void refresh().catch((e) => setError(e.message))}
            >
              <RefreshCw size={12} />
              Refresh sign-offs
            </button>
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              disabled={busy || agreement.status !== "pending"}
              onClick={async () => {
                setBusy(true);
                try {
                  await action({ action: "cancel", id: agreement.id });
                  setStored(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Cancellation failed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancel version
            </button>
            {approved && (
              <span role="status" className="text-xs text-brand">
                All accounts approved. Delivery unlocked.
              </span>
            )}
          </div>
        </>
      )}
      {stored && !current && (
        <p className="text-[10px] text-amber-200">
          This draft changed. Previous approvals cannot release the changed
          version. Manage or cancel older agreements in Rights & splits.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
export function AuthenticatedSplitInbox() {
  const { session } = useAuth(),
    query = useSearchParams(),
    invite = query.get("invite");
  const [result, setResult] = useState<{
      agreements?: AgreementView[];
      agreement?: AgreementView;
      partyId?: string;
    } | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await authFetch(
      "/api/agreements" +
        (invite ? "?invite=" + encodeURIComponent(invite) : ""),
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Agreements unavailable.");
    setResult(body);
  }, [invite]);
  useEffect(() => {
    if (session.user?.role !== "artist") return;
    let closed = false;
    void authFetch(
      "/api/agreements" +
        (invite ? "?invite=" + encodeURIComponent(invite) : ""),
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Agreements unavailable.");
        if (!closed) setResult(body);
      })
      .catch((e) => {
        if (!closed) setError(e.message);
      });
    return () => {
      closed = true;
    };
  }, [invite, session.user?.role]);
  if (session.user?.role !== "artist") return null;
  return (
    <section className="mx-auto mb-6 w-full max-w-[1500px] space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">AUTHENTICATED COLLABORATION</p>
          <h2 className="mt-2 text-xl font-semibold">
            Your release agreements
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-ghost !text-xs"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-200">
          {error}
        </p>
      )}
      {result?.agreement ? (
        <ApprovalCard
          agreement={result.agreement}
          partyId={result.partyId ?? "primary"}
          invite={invite ?? undefined}
          onApproved={(agreement) =>
            setResult((old) => ({ ...old, agreement }))
          }
        />
      ) : result?.agreements?.length ? (
        result.agreements.map((agreement) => (
          <div key={agreement.id} className="space-y-2">
            <ApprovalCard
              agreement={agreement}
              partyId="primary"
              onApproved={() => void load()}
            />
            {agreement.status === "pending" && (
              <button
                type="button"
                className="btn btn-ghost !text-[10px]"
                onClick={() =>
                  void action({ action: "cancel", id: agreement.id })
                    .then(load)
                    .catch((e) => setError(e.message))
                }
              >
                Cancel this pending version
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="rounded-xl border border-line p-4 text-xs text-muted">
          No release agreements yet. Prepare a master or open the private
          invitation from your collaborator.
        </p>
      )}
    </section>
  );
}
