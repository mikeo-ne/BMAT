"use client";

import { loadPlanRequests, type PlanRequestRow } from "@/lib/db/cmo";
import { useLoad } from "@/lib/db/core";
import { formatUgx } from "@/lib/plans";
import { Badge, DataTable, Section } from "@/components/dashboard/ui";
import { ExportCsv } from "@/components/dashboard/ExportCsv";

/**
 * The billing side of self-serve plans: what people asked for, with a reference
 * they can quote and a number worth calling. Until a MoMo collection account
 * exists, this list *is* the checkout.
 */
export function PlanRequests() {
  const state = useLoad(() => loadPlanRequests(), []);
  const rows = state.data?.rows ?? [];
  const live = state.data?.live ?? false;

  return (
    <Section
      id="plan-requests"
      title="Plan Requests"
      actions={
        <ExportCsv
          label="Export"
          disabled={rows.length === 0}
          sheets={[
            {
              subject: "east-sound-plan-requests",
              headers: ["Reference", "Plan", "Billing", "Amount UGX", "Mobile money", "Status", "Requested", "Note"],
              rows: rows.map((r) => [r.reference, r.plan, r.billing, r.amountUgx, r.msisdn ?? "", r.status, r.created, r.note ?? ""]),
            },
          ]}
        />
      }
    >
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        maxHeight={320}
        empty="No plan requests yet."
        columns={[
          { key: "reference", header: "Reference", render: (r) => <span className="font-mono text-xs text-white">{r.reference}</span> },
          { key: "plan", header: "Plan", render: (r) => <span className="capitalize">{r.plan}</span> },
          { key: "amount", header: "Amount", render: (r) => <span className="font-mono text-xs">{r.amountUgx ? formatUgx(r.amountUgx) : "Quoted"}</span> },
          { key: "msisdn", header: "Mobile money", render: (r) => <span className="font-mono text-xs">{r.msisdn ?? "—"}</span> },
          {
            key: "status",
            header: "Status",
            render: (r) => (
              <Badge tone={r.status === "active" ? "ok" : r.status === "cancelled" ? "bad" : "warn"}>{r.status}</Badge>
            ),
          },
          { key: "created", header: "Requested", render: (r) => <span className="font-mono text-xs">{r.created}</span> },
        ]}
      />
      <p className="mt-3 text-xs text-slate-500">
        {live
          ? "Live requests. A CMO moves a request to contacted or active; nobody can activate a plan from a browser."
          : "Sample requests. In live mode these come from the pricing page."}
      </p>
    </Section>
  );
}
