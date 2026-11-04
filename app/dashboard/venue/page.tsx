import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function VenueDashboardPage() {
  redirect("/dashboard/monitoring");
}
