import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEMO_ROLE_COOKIE, isRole, ROLE_META, roleForPath, type Role } from "./lib/roles";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./lib/supabase/config";

/**
 * Server-side role router — the first of three isolation layers:
 *   1. middleware (this file): a role can only reach /dashboard/<its-role>
 *   2. <RoleGuard> client check on every dashboard page
 *   3. Postgres RLS policies (supabase/migrations) on every table
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const { pathname } = req.nextUrl;

  let role: Role | null = null;
  let approved = true;

  if (isSupabaseConfigured) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          }
        },
      },
    });
    const { data } = await supabase.auth.getUser(); // verified with Supabase, not just decoded
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, approved")
        .eq("id", data.user.id)
        .maybeSingle();
      role = isRole(profile?.role) ? profile.role : null;
      approved = profile?.approved !== false;
    }
  } else {
    const c = req.cookies.get(DEMO_ROLE_COOKIE)?.value;
    role = isRole(c) ? c : null;
  }

  const redirect = (to: string) => {
    const url = req.nextUrl.clone();
    const [path, query] = to.split("?");
    url.pathname = path;
    url.search = query ? `?${query}` : "";
    const r = NextResponse.redirect(url);
    // carry refreshed auth cookies across the redirect
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (!role) return redirect("/?auth=signin");
  if (!approved) return redirect("/pending");

  const requested = roleForPath(pathname);
  if (pathname === "/dashboard" || pathname === "/dashboard/" || requested !== role) {
    return redirect(ROLE_META[role].path);
  }
  return res;
}

export const config = { matcher: ["/dashboard", "/dashboard/:path*"] };
