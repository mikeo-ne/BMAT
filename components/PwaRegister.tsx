"use client";

import { useEffect } from "react";

import { PwaInstall } from "./PwaInstall";

/**
 * Registers the service worker that makes the app installable and keeps the
 * shell available offline. Production only: a caching worker in front of `next
 * dev` hides hot reloads and confuses debugging.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return <PwaInstall />;
}
