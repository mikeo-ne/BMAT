import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth";
import { IntegrationSetup } from "@/components/integration-setup";
export const metadata: Metadata = { title: "Notification integration setup" };
export const dynamic = "force-dynamic";
export default async function IntegrationSetupPage() {
  const actor = await requirePageRole(["artist"], "/dashboard/alerts/setup");
  return <IntegrationSetup key={actor.id} />;
}
