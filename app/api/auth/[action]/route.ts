import { randomBytes } from "node:crypto";
import {
  assertSameOrigin,
  authError,
  cookieHeader,
  createAccount,
  HttpError,
  issueSession,
  loginAccount,
  logout,
  mockOAuthEnabled,
  requestSession,
  requireApiRole,
  tokenHash,
  userDto,
} from "@/lib/auth-core";
import { takeRateLimit } from "@/lib/security-store";
import { readBoundedJson } from "@/lib/integration-auth";
import { safeReturnPath } from "@/lib/auth-types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store", vary: "Cookie" };
export async function GET(
  request: Request,
  context: RouteContext<"/api/auth/[action]">,
) {
  try {
    const { action } = await context.params;
    if (action !== "session") throw new HttpError(404, "Not found.");
    const auth = await requestSession(request);
    return Response.json(
      auth
        ? {
            user: userDto(auth.user),
            csrfToken: auth.session.csrfToken,
            expiresAt: auth.session.expiresAt,
          }
        : { user: null, csrfToken: null, expiresAt: null },
      { headers },
    );
  } catch (error) {
    return authError(error);
  }
}
export async function POST(
  request: Request,
  context: RouteContext<"/api/auth/[action]">,
) {
  try {
    assertSameOrigin(request);
    const { action } = await context.params;
    if (action === "logout") {
      await requireApiRole(request, ["artist", "broadcaster", "cmo"], true);
      await logout(request);
      return Response.json(
        { ok: true },
        {
          headers: {
            ...headers,
            "set-cookie": cookieHeader(
              request,
              "",
              new Date(0).toISOString(),
              true,
            ),
          },
        },
      );
    }
    if (!["login", "register", "mock-oauth"].includes(action))
      throw new HttpError(404, "Not found.");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new HttpError(415, "Use application/json.");
    const raw = await readBoundedJson(request, 8192);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new HttpError(422, "Invalid sign-in request.");
    const body = raw as Record<string, unknown>;
    let user;
    if (action === "mock-oauth") {
      if (!mockOAuthEnabled())
        throw new HttpError(
          404,
          "Mock OAuth is disabled. Configure a real identity provider for production social sign-in.",
        );
      if (!["google", "microsoft"].includes(String(body.provider)))
        throw new HttpError(422, "Unsupported mock provider.");
      user = await createAccount({
        email: `mock-${randomBytes(8).toString("hex")}@demo.invalid`,
        name: "Mock OAuth artist",
        password: randomBytes(32).toString("hex"),
        mock: true,
      });
    } else {
      if (typeof body.email !== "string" || typeof body.password !== "string")
        throw new HttpError(422, "Enter your email and password.");
      if (action === "register") {
        if (body.role !== undefined && body.role !== "artist")
          throw new HttpError(
            403,
            "Privileged roles are operator-provisioned, never selected during registration.",
          );
        if (
          !(await takeRateLimit(
            tokenHash(
              "registration:" + (request.headers.get("origin") ?? "direct"),
            ),
            30,
            3600000,
          ))
        )
          throw new HttpError(429, "Registration is temporarily rate limited.");
        user = await createAccount({
          email: body.email,
          password: body.password,
          name: String(body.name ?? ""),
        });
      } else user = await loginAccount(body.email, body.password);
    }
    // Rotate any existing browser session; a supplied localStorage role is never consulted.
    await logout(request);
    const issued = await issueSession(user, body.remember !== false);
    return Response.json(
      {
        ...issued.browser,
        next: safeReturnPath(
          typeof body.next === "string" ? body.next : null,
          user.role,
        ),
      },
      {
        status: action === "register" ? 201 : 200,
        headers: {
          ...headers,
          "set-cookie": cookieHeader(
            request,
            issued.token,
            issued.session.expiresAt,
          ),
        },
      },
    );
  } catch (error) {
    return authError(error);
  }
}
