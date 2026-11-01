import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CMO & Regulatory Audit",
  description:
    "Captured-play allocations with station, region, period and local rights-holder filters, illustrative daypart estimates and logging-sheet exports for UPRS review.",
};

export const dynamic = "force-dynamic";

export { CmoAuditWorkspace as default } from "@/components/cmo-audit-workspace";
