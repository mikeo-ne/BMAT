import { redirect } from "next/navigation";
import { serverSession } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/auth-types";
export default async function Home() {
  const auth = await serverSession();
  redirect(ROLE_HOME[auth?.user.role ?? "public"]);
}
