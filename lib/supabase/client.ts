"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

/** Browser Supabase client, or null in demo mode. Never throws. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!isSupabaseConfigured || typeof window === "undefined") return null;
  if (!client) {
    try {
      client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch {
      client = null;
    }
  }
  return client;
}
