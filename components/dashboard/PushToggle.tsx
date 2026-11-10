"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/db/core";
import { PUSH_TEST_PAYLOAD, subscriptionRow, urlBase64ToUint8Array } from "@/lib/pwa";

/** PushManager wants a real ArrayBuffer, not a Uint8Array view. */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.length);
  new Uint8Array(out).set(bytes);
  return out;
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Status = "unsupported" | "off" | "on" | "blocked" | "busy";

/**
 * "Send my alerts to this phone."
 *
 * Push is the channel SongBoost sells ("it's in my pocket"); ours rides on the
 * same alert rules as email and WhatsApp. The subscription is written from the
 * browser straight into `push_subscriptions`, where RLS only allows a person to
 * register their own devices — there is no endpoint that can subscribe someone
 * else, and no service key in the browser.
 */
export function PushToggle() {
  const { session } = useAuth();
  const [status, setStatus] = useState<Status>("off");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (!VAPID || !session) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "on" : "off"))
      .catch(() => setStatus("off"));
  }, [session]);

  const enable = useCallback(async () => {
    const sb = db();
    if (!sb || !session) return;
    setStatus("busy");
    setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toBuffer(urlBase64ToUint8Array(VAPID)),
        }));
      const row = subscriptionRow(session.userId, sub.toJSON() as never, navigator.userAgent);
      if (!row) throw new Error("This browser returned an unusable subscription.");
      const { error } = await sb.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
      if (error) throw new Error(error.message);
      setStatus("on");
      setNote("Airplay alerts will reach this device.");
    } catch (e) {
      setStatus("off");
      setNote(e instanceof Error ? e.message : "Could not enable notifications.");
    }
  }, [session]);

  const disable = useCallback(async () => {
    const sb = db();
    setStatus("busy");
    setNote("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        if (sb) await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
      setNote("Notifications are off for this device.");
    } catch (e) {
      setStatus("on");
      setNote(e instanceof Error ? e.message : "Could not turn notifications off.");
    }
  }, []);

  const test = useCallback(async () => {
    setNote("");
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(PUSH_TEST_PAYLOAD.title, {
        body: PUSH_TEST_PAYLOAD.body,
        icon: "/api/pwa-icon?size=192",
        data: { url: PUSH_TEST_PAYLOAD.url },
      });
    } catch {
      setNote("Your browser blocked the preview — the real notification still arrives by push.");
    }
  }, []);

  if (status === "unsupported") {
    return (
      <p className="text-xs text-slate-500">
        Notifications need an installed app and a configured push key. Email and WhatsApp alerts still work.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "on" ? (
          <>
            <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={disable}>
              Turn off on this device
            </button>
            <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={test}>
              Preview notification
            </button>
            <span className="text-xs text-emerald-300">On for this device</span>
          </>
        ) : (
          <button type="button" className="btn-primary !py-1.5 text-xs" onClick={enable} disabled={status === "busy" || status === "blocked"}>
            {status === "busy" ? "Enabling…" : status === "blocked" ? "Blocked in browser settings" : "Enable phone notifications"}
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-slate-400">{note}</p>}
    </div>
  );
}
