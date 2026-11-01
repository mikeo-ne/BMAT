"use client";
import type { BrowserSession } from "@/lib/auth-types";
let current: BrowserSession = { user: null, csrfToken: null, expiresAt: null };
export const AUTH_CHANGED = "east-sound:auth-changed";
export const DISPLAY_KEY = "east-sound:session-display:v1";
export function configureBrowserSession(value: BrowserSession) {
  current = value;
}
export function browserSession() {
  return current;
}
export async function authFetch(input: string, init: RequestInit = {}) {
  const url = new URL(input, window.location.href);
  if (url.origin !== window.location.origin)
    throw new Error(
      "Authenticated requests must stay on this application's origin.",
    );
  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !current.csrfToken) {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (response.ok) current = await response.json();
  }
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && current.csrfToken)
    headers.set("x-east-sound-csrf", current.csrfToken);
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401) window.dispatchEvent(new Event(AUTH_CHANGED));
  return response;
}

export const PRIVATE_EVICT = "east-sound:private-cache-evict";
export function evictPrivateBrowserState(userId: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("east-sound:") && key.endsWith(":" + userId))
        localStorage.removeItem(key);
    }
  } catch {}
  window.dispatchEvent(new CustomEvent(PRIVATE_EVICT, { detail: userId }));
}
