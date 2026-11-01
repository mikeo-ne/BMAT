import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ROLE_HOME,
  type AccountRole,
  type SessionUser,
} from "@/lib/auth-types";
import { SESSION_COOKIE, sessionForToken, userDto } from "@/lib/auth-core";
export * from "@/lib/auth-core";
export async function serverSession() {
  if (process.env.EAST_SOUND_STATIC_EXPORT === "1") return null;
  const jar = await cookies();
  return sessionForToken(jar.get(SESSION_COOKIE)?.value ?? null);
}
export async function requirePageRole(
  roles: AccountRole[],
  path: string,
): Promise<SessionUser> {
  const auth = await serverSession();
  if (!auth) redirect("/login?next=" + encodeURIComponent(path));
  if (!roles.includes(auth.user.role))
    redirect(ROLE_HOME[auth.user.role] + "?denied=1");
  return userDto(auth.user);
}
