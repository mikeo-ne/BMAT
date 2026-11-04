import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/** Email-confirmation landing: exchanges the PKCE code for a session, then the
 *  middleware routes the user to their own dashboard. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const dest = req.nextUrl.clone();
  dest.pathname = "/dashboard";
  dest.search = "";
  const res = NextResponse.redirect(dest);

  if (!isSupabaseConfigured || !code) {
    dest.pathname = "/";
    dest.search = "?auth=signin";
    return NextResponse.redirect(dest);
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    dest.pathname = "/";
    dest.search = "?auth=signin";
    return NextResponse.redirect(dest);
  }
  return res;
}
