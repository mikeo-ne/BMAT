"use client";

import { useEffect, useState } from "react";

import { installState, type InstallState } from "@/lib/pwa";
import { safeStorage } from "@/lib/safe";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

const DISMISS_KEY = "est_pwa_dismissed";

/**
 * "Add to home screen", offered once and never nagged.
 *
 * Chrome/Android fires `beforeinstallprompt` (we keep it and show our own
 * button); iOS has no event, so we show the Share → Add to Home Screen hint
 * instead. Dismissal is remembered so the card does not follow people around.
 */
export function PwaInstall() {
  const [state, setState] = useState<InstallState>("unsupported");
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (safeStorage.get<boolean>(DISMISS_KEY, false)) return;

    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
      setState(installState({ hasPrompt: true, standalone, userAgent: navigator.userAgent }));
      setHidden(false);
    };
    const next = installState({ hasPrompt: false, standalone, userAgent: navigator.userAgent });
    setState(next);
    setHidden(next === "unsupported" || next === "installed");

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setHidden(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    safeStorage.set(DISMISS_KEY, true);
    setHidden(false);
    setHidden(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md sm:left-auto sm:right-6 sm:w-96">
      <div className="glass flex items-start gap-3 p-4 shadow-2xl shadow-black/40">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-sm font-bold text-emerald-300">
          ES
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Keep East Sound on your phone</p>
          <p className="mt-1 text-xs text-slate-400">
            {state === "ios"
              ? "Tap Share, then “Add to Home Screen” — it opens like an app and still gets your alerts."
              : "Install it once: opens full screen, works on a weak connection, and can send airplay alerts."}
          </p>
          <div className="mt-3 flex gap-2">
            {state === "prompt" && prompt && (
              <button
                type="button"
                className="btn-primary !px-3 !py-1.5 text-xs"
                onClick={() => {
                  void prompt.prompt();
                  setHidden(true);
                }}
              >
                Install
              </button>
            )}
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={dismiss}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
