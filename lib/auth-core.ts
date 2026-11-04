import "server-only";
import { RequestBodyError } from "@/lib/integration-auth";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import {
  type AccountRole,
  type BrowserSession,
  type SessionUser,
} from "@/lib/auth-types";
import {
  authenticationAvailable,
  audit,
  findAccount,
  findSession,
  insertAccount,
  putSession,
  revokeSession,
  takeRateLimit,
  type Account,
  type StoredSession,
} from "@/lib/security-store";
import { validEmail } from "@/lib/notifications";
import { FM_STATIONS } from "@/lib/regions";

function derive(password: string, salt: string, p = 3): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export const SESSION_COOKIE = "east_sound_session";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function userDto(user: Account): SessionUser {
  const { id, name, email, role, stationIds, mock } = user;
  return { id, name, email, role, stationIds, mock };
}
export function mockOAuthEnabled() {
  return (
    process.env.EAST_SOUND_MOCK_OAUTH === "1" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL !== "1" &&
    process.env.EAST_SOUND_STATIC_EXPORT !== "1"
  );
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128)
    throw new HttpError(422, "Use a password between 12 and 128 characters.");
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt);
  return `scrypt:32768:8:3:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split(":");
  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt" ||
    parts[1] !== "32768" ||
    parts[2] !== "8" ||
    !["1", "3"].includes(parts[3]) ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{128}$/.test(parts[5]) ||
    password.length > 128
  )
    return false;
  const key = await derive(password, parts[4], Number(parts[3]));
  return timingSafeEqual(key, Buffer.from(parts[5], "hex"));
}
export async function createAccount(
  input: {
    email: string;
    name: string;
    password: string;
    role?: AccountRole;
    stationIds?: string[];
    mock?: boolean;
  },
  provisioned = false,
) {
  if (!authenticationAvailable())
    throw new HttpError(
      503,
      "Persistent authentication requires a configured Node datastore or PostgreSQL.",
    );
  const email = input.email.trim().toLowerCase(),
    name = input.name.trim();
  if (!validEmail(email) || name.length < 2 || name.length > 120)
    throw new HttpError(
      422,
      "Enter a valid email and a name of 2–120 characters.",
    );
  const role = provisioned ? (input.role ?? "artist") : "artist";
  if (!["artist", "broadcaster", "cmo", "label", "venue"].includes(role))
    throw new HttpError(422, "Unsupported account role.");
  const stationIds = provisioned ? [...new Set(input.stationIds ?? [])] : [];
  if (
    stationIds.some(
      (id) => !FM_STATIONS.some((s) => s.id === id) && id !== "nbs-tv-kla",
    ) ||
    (role === "broadcaster" && !stationIds.length)
  )
    throw new HttpError(
      422,
      "Station-manager accounts require operator-assigned directory stations.",
    );
  const user: Account = {
    id: randomUUID(),
    email,
    name,
    role,
    stationIds,
    passwordHash: await hashPassword(input.password),
    disabled: false,
    mock: input.mock === true && mockOAuthEnabled(),
    createdAt: new Date().toISOString(),
  };
  if (!(await insertAccount(user)))
    throw new HttpError(
      409,
      "Registration could not be completed. Try signing in or contact the operator.",
    );
  await audit(user.id, "account.created", user.id, { role });
  return user;
}
export async function loginAccount(
  emailInput: string,
  password: string,
): Promise<Account> {
  if (!authenticationAvailable())
    throw new HttpError(503, "Persistent authentication is not configured.");
  const email = emailInput.trim().toLowerCase();
  if (email.length > 254 || password.length > 128)
    throw new HttpError(401, "Email or password is incorrect.");
  if (!(await takeRateLimit(tokenHash("login:" + email), 10)))
    throw new HttpError(
      429,
      "Too many sign-in attempts. Try again in fifteen minutes.",
    );
  const user = await findAccount(email);
  // A missing account still pays the password-KDF cost; no fast existence oracle.
  const encoded =
    user?.passwordHash ??
    "scrypt:32768:8:3:00000000000000000000000000000000:" + "00".repeat(64);
  const ok = await verifyPassword(password, encoded);
  if (!user || !ok || user.disabled || (user.mock && !mockOAuthEnabled()))
    throw new HttpError(401, "Email or password is incorrect.");
  await audit(user.id, "session.login", user.id);
  return user;
}
export async function issueSession(user: Account, remember = true) {
  const token = randomBytes(32).toString("hex"),
    csrfToken = randomBytes(32).toString("hex");
  const session: StoredSession = {
    tokenHash: tokenHash(token),
    userId: user.id,
    csrfToken,
    expiresAt: new Date(
      Date.now() + (remember ? 7 * 86400000 : 12 * 3600000),
    ).toISOString(),
  };
  await putSession(session);
  return {
    token,
    session,
    browser: {
      user: userDto(user),
      csrfToken,
      expiresAt: session.expiresAt,
    } satisfies BrowserSession,
  };
}
function cookieToken(header: string | null): string | null {
  const values = (header ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(SESSION_COOKIE + "="));
  if (values.length !== 1) return null;
  const value = values[0].slice(SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function sessionForToken(
  token: string | null,
): Promise<{ user: Account; session: StoredSession } | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await findSession(tokenHash(token));
  if (!session) return null;
  const user = await findAccount(session.userId, true);
  if (!user || user.disabled || (user.mock && !mockOAuthEnabled())) return null;
  return { user, session };
}
export async function requestSession(request: Request) {
  return sessionForToken(cookieToken(request.headers.get("cookie")));
}

/**
 * The origin this request was actually addressed at.
 *
 * Next.js builds `request.url` from the interface the server is bound to
 * (e.g. `http://0.0.0.0:3000` when started with `--hostname 0.0.0.0`), which
 * never equals the origin a browser sends in its `Origin` header. The Host
 * header (and the forwarded variants a reverse proxy sets from it) carry the
 * address the client used, so origin and cookie-security decisions must be
 * made from those headers instead. Browsers control both headers, so the
 * CSRF comparison stays sound: a malicious site sends its own Origin with the
 * victim site's Host, and the two no longer match.
 */
export function requestOrigin(request: Request): string {
  const configured = process.env.EAST_SOUND_APP_ORIGIN;
  if (configured) return configured;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol = forwardedProto ?? new URL(request.url).protocol.replace(":", "");
  return new URL(`${protocol}://${host}`).origin;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = requestOrigin(request);
  if (
    (origin && origin !== expected) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(403, "Cross-origin mutation rejected.");
}
export function cookieHeader(
  request: Request,
  token: string,
  expiresAt: string,
  clear = false,
) {
  const address = new URL(requestOrigin(request));
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(address.hostname);
  const secure =
    address.protocol === "https:" ||
    (process.env.NODE_ENV === "production" && !local) ||
    process.env.VERCEL === "1";
  return `${SESSION_COOKIE}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=${clear ? 0 : Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000))}; Expires=${clear ? "Thu, 01 Jan 1970 00:00:00 GMT" : new Date(expiresAt).toUTCString()}`;
}
export async function requireApiRole(
  request: Request,
  roles: AccountRole[],
  mutate = false,
): Promise<SessionUser> {
  const auth = await requestSession(request);
  if (!auth) throw new HttpError(401, "Sign in to continue.");
  if (!roles.includes(auth.user.role))
    throw new HttpError(
      403,
      "Your account is not permitted to use this module.",
    );
  if (mutate) {
    assertSameOrigin(request);
    const csrf = request.headers.get("x-east-sound-csrf") ?? "";
    if (
      !/^[a-f0-9]{64}$/.test(csrf) ||
      !timingSafeEqual(Buffer.from(csrf), Buffer.from(auth.session.csrfToken))
    )
      throw new HttpError(
        403,
        "Session verification failed. Refresh and try again.",
      );
  }
  return userDto(auth.user);
}
export function authError(error: unknown): Response {
  const known = error instanceof HttpError || error instanceof RequestBodyError;
  const status = known ? error.status : 503;
  return Response.json(
    {
      error: known
        ? error.message
        : "The secure datastore is unavailable. Refresh or retry the request.",
    },
    { status, headers: { "cache-control": "no-store", vary: "Cookie" } },
  );
}
export async function logout(request: Request) {
  const token = cookieToken(request.headers.get("cookie"));
  if (token) await revokeSession(tokenHash(token));
}

export async function guardedApi(
  request: Request | undefined,
  roles: AccountRole[],
  mutate: boolean,
  operation: (actor: SessionUser) => Promise<Response>,
): Promise<Response> {
  try {
    if (!request) throw new HttpError(401, "Sign in to continue.");
    const actor = await requireApiRole(request, roles, mutate);
    const response = await operation(actor);
    response.headers.set("cache-control", "no-store");
    response.headers.set("vary", "Cookie");
    return response;
  } catch (error) {
    return authError(error);
  }
}
