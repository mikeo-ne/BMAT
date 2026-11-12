"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

/** Bump when the Terms of Use or Privacy Notice change in a way people must re-accept. */
export const TERMS_VERSION = "2026-11-12";

export type ConsentState = { version: string | null; acceptedAt: string | null; deletionRequestedAt: string | null };

export async function loadConsent(): Promise<ConsentState | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data } = await sb.from("profiles").select("terms_version, terms_accepted_at, deletion_requested_at").eq("id", u.user.id).maybeSingle();
  if (!data) return null;
  return { version: data.terms_version ?? null, acceptedAt: data.terms_accepted_at ?? null, deletionRequestedAt: data.deletion_requested_at ?? null };
}

export async function acceptTerms(): Promise<void> {
  const sb = getSupabaseBrowser();
  if (!sb) return;
  const { error } = await sb.rpc("accept_terms", { p_version: TERMS_VERSION, p_offshore: true });
  if (error) throw new Error(error.message);
}

export async function exportMyData(): Promise<Record<string, unknown>> {
  const sb = getSupabaseBrowser();
  if (!sb) return { demo: true, note: "Demo mode — no personal data is stored." };
  const { data, error } = await sb.rpc("my_data_export");
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}

export async function requestDeletion(): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return new Date().toISOString();
  const { data, error } = await sb.rpc("request_account_deletion");
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function cancelDeletion(): Promise<void> {
  const sb = getSupabaseBrowser();
  if (!sb) return;
  const { error } = await sb.rpc("cancel_account_deletion");
  if (error) throw new Error(error.message);
}

export type CopyrightReport = {
  reporter_name: string; reporter_email: string; reporter_role: "owner" | "authorised_agent" | "other";
  work_title: string; where_on_east_sound: string; details: string; good_faith: boolean;
};

export async function submitCopyrightReport(r: CopyrightReport): Promise<void> {
  const sb = getSupabaseBrowser();
  if (!sb) return;
  const { error } = await sb.from("copyright_reports").insert(r);
  if (error) throw new Error(/check constraint/i.test(error.message) ? "Please complete every field — details need at least 10 characters." : error.message);
}
