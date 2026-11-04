import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware: enforces session presence on /dashboard routes.
 *
 * Role-level authorization is enforced server-side by requirePageRole() in
 * each page; this middleware provides the first gate — unauthenticated users
 * never reach dashboard pages, and signed-out users are redirected to login.
 */

const SESSION_COOKIE = "east_sound_session";
const PUBLIC_DASHBOARD_PATHS = new Set([
  "/dashboard/charts",
  "/dashboard/stats",
]);

function isDashboardPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard/");
}

function hasSessionCookie(request: NextRequest): boolean {
  const cookie = request.cookies.get(SESSION_COOKIE);
  return Boolean(cookie?.value) && /^[a-f0-9]{64}$/.test(cookie!.value);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isDashboardPath(pathname)) {
    return NextResponse.next();
  }

  // Public dashboard paths are accessible without authentication.
  if (PUBLIC_DASHBOARD_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
