import { randomUUID } from "node:crypto";
import type { AccountRole } from "@/lib/auth-types";
/** Test-only credentials. These helpers must run against an explicitly isolated data directory. */
export async function testActor(
  role: AccountRole = "artist",
  email = `qa-${randomUUID()}@example.com`,
  stationIds = role === "broadcaster" ? ["capital-kla"] : [],
) {
  if (!process.env.EAST_SOUND_DATA_DIR)
    throw new Error(
      "Use an isolated test data directory before provisioning a test actor.",
    );
  const { createAccount, issueSession } = await import("@/lib/auth-core");
  const user = await createAccount(
    {
      email,
      name: "Quality Test Account",
      password: "Test only password with 26 characters!",
      role,
      stationIds,
    },
    true,
  );
  const issued = await issueSession(user);
  return {
    user,
    ...issued,
    request: (path: string, init: RequestInit = {}) =>
      actorRequest(issued, path, init),
  };
}
export function actorRequest(
  actor: { token: string; session: { csrfToken: string } },
  path: string,
  init: RequestInit = {},
) {
  const url = path.startsWith("http") ? path : "https://app.example.com" + path;
  const headers = new Headers({
    cookie: "east_sound_session=" + actor.token,
    origin: new URL(url).origin,
    "x-east-sound-csrf": actor.session.csrfToken,
  });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return new Request(url, { ...init, headers });
}
