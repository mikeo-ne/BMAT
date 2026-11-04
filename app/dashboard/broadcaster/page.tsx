import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BroadcasterDashboardPage() {
  redirect("/dashboard/playout");
}
