import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { mockOAuthEnabled, serverSession } from "@/lib/auth";
import { authenticationAvailable } from "@/lib/security-store";
import { ROLE_HOME } from "@/lib/auth-types";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await serverSession();
  if (auth) redirect(ROLE_HOME[auth.user.role]);
  const query =
    process.env.EAST_SOUND_STATIC_EXPORT === "1" ? {} : await searchParams;
  return (
    <AuthForm
      next={query.next ?? ""}
      mockEnabled={mockOAuthEnabled()}
      available={authenticationAvailable()}
    />
  );
}
