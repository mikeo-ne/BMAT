"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  authFetch,
  browserSession,
  AUTH_CHANGED,
  PRIVATE_EVICT,
} from "@/lib/auth-client";
import { sessionScope } from "@/lib/auth-types";
import { cacheSnapshot } from "@/lib/browser-cache";
import {
  defaultNotificationPreferences,
  NOTIFICATION_CHANGE_EVENT,
  parseNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications";
const EMPTY = defaultNotificationPreferences();
const snapshots = new Map<string, NotificationPreferences>(),
  loaded = new Set<string>(),
  invalid = new Set<string>();
const pending = new Map<string, Promise<void>>();
function emit() {
  window.dispatchEvent(new Event(NOTIFICATION_CHANGE_EVENT));
}
function subscribe(callback: () => void) {
  window.addEventListener(NOTIFICATION_CHANGE_EVENT, callback);
  window.addEventListener(AUTH_CHANGED, callback);
  const evict = (event: Event) => {
    const id = (event as CustomEvent<string>).detail;
    snapshots.delete(id);
    loaded.delete(id);
    invalid.delete(id);
    callback();
  };
  window.addEventListener(PRIVATE_EVICT, evict);
  return () => {
    window.removeEventListener(NOTIFICATION_CHANGE_EVENT, callback);
    window.removeEventListener(AUTH_CHANGED, callback);
    window.removeEventListener(PRIVATE_EVICT, evict);
  };
}
export function readNotificationPreferences(): NotificationPreferences {
  return snapshots.get(browserSession().user?.id ?? "") ?? EMPTY;
}
async function load(userId: string, scope: string) {
  if (pending.has(scope)) return pending.get(scope);
  const operation = (async () => {
    try {
      const response = await authFetch("/api/preferences");
      const body = await response.json();
      const config = response.ok
        ? parseNotificationPreferences(body.config)
        : null;
      if (!config) throw new Error("Preferences unavailable.");
      if (
        browserSession().user?.id === userId &&
        sessionScope(browserSession().user) === scope
      ) {
        snapshots.set(userId, config);
        invalid.delete(userId);
        void cacheSnapshot(userId, "preferences", config, scope);
      }
    } catch {
      if (sessionScope(browserSession().user) === scope) invalid.add(userId);
    } finally {
      if (sessionScope(browserSession().user) === scope) loaded.add(userId);
      pending.delete(scope);
      emit();
    }
  })();
  pending.set(scope, operation);
  return operation;
}
export async function saveNotificationPreferences(
  config: NotificationPreferences,
): Promise<{ persisted: boolean }> {
  const user = browserSession().user;
  const scope = sessionScope(user);
  if (!user || user.role !== "artist")
    throw new Error("Sign in with your artist account to save preferences.");
  const validated = parseNotificationPreferences(config);
  if (!validated)
    throw new Error("Invalid notification preferences. No changes were saved.");
  const response = await authFetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validated),
    }),
    body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "Preferences could not be saved.");
  const saved = parseNotificationPreferences(body.config);
  if (!saved) throw new Error("The server returned invalid preferences.");
  if (sessionScope(browserSession().user) !== scope)
    throw new Error(
      "The account changed while saving. Refresh this workspace.",
    );
  snapshots.set(user.id, saved);
  loaded.add(user.id);
  invalid.delete(user.id);
  void cacheSnapshot(user.id, "preferences", saved, scope);
  emit();
  return { persisted: true };
}
export function useNotificationPreferences() {
  const { session } = useAuth(),
    userId = session.user?.role === "artist" ? session.user.id : "";
  const scope = sessionScope(session.user);
  const read = useCallback(() => snapshots.get(userId) ?? EMPTY, [userId]);
  const config = useSyncExternalStore(subscribe, read, () => EMPTY);
  const status = useSyncExternalStore(
    subscribe,
    () => `${loaded.has(userId)}:${invalid.has(userId)}`,
    () => "false:false",
  );
  useEffect(() => {
    if (userId) void load(userId, scope);
  }, [userId, scope]);
  return {
    config,
    save: saveNotificationPreferences,
    invalid: status.endsWith(":true"),
    sessionOnly: false,
    loading: !!userId && !status.startsWith("true:"),
  };
}
