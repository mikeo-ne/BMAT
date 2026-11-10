"use client";

import { useState } from "react";

import { approveStationRequest, loadStationRequests, rejectStationRequest } from "@/lib/db/cmo";
import { useLoad } from "@/lib/db/core";
import { Badge, DataTable, Section } from "@/components/dashboard/ui";

/**
 * Approval queue for station claims.
 *
 * Linking an organisation to a station decides whose playout data that
 * organisation can read, so it stays a deliberate human decision — but it
 * should not require a SQL console either. Approve creates or claims the
 * station; reject records why.
 */
export function StationRequests() {
  const state = useLoad(() => loadStationRequests(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = state.data?.rows ?? [];
  const pending = rows.filter((r) => r.status === "pending");

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    setError(null);
    try {
      if (action === "approve") await approveStationRequest(id);
      else await rejectStationRequest(id, "Not approved by the CMO.");
      state.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the request.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      id="station-requests"
      title="Station Requests"
      actions={<span className="text-xs text-slate-400">{pending.length} awaiting review</span>}
    >
      {error && <p role="alert" className="mb-3 text-sm text-rose-300">{error}</p>}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        maxHeight={340}
        empty="No broadcaster has asked to connect a station yet."
        columns={[
          { key: "station", header: "Station", render: (r) => <span className="font-medium text-white">{r.name ?? "—"}</span> },
          {
            key: "detail",
            header: "Detail",
            render: (r) => (
              <span className="text-xs text-slate-400">
                {[r.frequency, r.region, r.kind === "tv" ? "TV" : "Radio"].filter(Boolean).join(" · ")}
              </span>
            ),
          },
          { key: "stream", header: "Stream", render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.streamUrl ?? "panel stream"}</span> },
          { key: "who", header: "Requested by", render: (r) => r.requestedBy },
          {
            key: "status",
            header: "Status",
            render: (r) => (
              <Badge tone={r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "bad"}>{r.status}</Badge>
            ),
          },
          {
            key: "action",
            header: "",
            render: (r) =>
              r.status === "pending" ? (
                <div className="flex gap-2">
                  <button type="button" className="btn-primary !px-3 !py-1 text-xs" disabled={busy === r.id} onClick={() => act(r.id, "approve")}>
                    {busy === r.id ? "…" : "Approve"}
                  </button>
                  <button type="button" className="btn-ghost !px-3 !py-1 text-xs" disabled={busy === r.id} onClick={() => act(r.id, "reject")}>
                    Reject
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-500">{r.created}</span>
              ),
          },
        ]}
      />
      <p className="mt-3 text-xs text-slate-500">
        Approving links the station to the requesting organisation (or creates it with the supplied stream URL).
        The monitor picks up a new stream on its next restart and reports its real status — nothing is assumed.
      </p>
    </Section>
  );
}
