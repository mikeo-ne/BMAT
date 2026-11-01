"use client";
import { useSyncExternalStore } from "react";
import {
  defaultNotificationPreferences,
  NOTIFICATION_CHANGE_EVENT,
  NOTIFICATION_STORAGE_KEY,
  parseNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications";

const EMPTY = defaultNotificationPreferences();
let memory: string | null = null;
let previous: string | null | undefined;
let snapshot: NotificationPreferences = EMPTY;
let corrupt = false;
function rawSettings() {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
  } catch {
    return null;
  }
}
export function readNotificationPreferences(): NotificationPreferences {
  const raw = rawSettings();
  if (raw === previous) return snapshot;
  previous = raw;
  corrupt = false;
  try {
    const parsed = raw ? parseNotificationPreferences(JSON.parse(raw)) : EMPTY;
    corrupt = raw !== null && !parsed;
    snapshot = parsed ?? EMPTY;
  } catch {
    corrupt = true;
    snapshot = EMPTY;
  }
  return snapshot;
}
function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === NOTIFICATION_STORAGE_KEY || event.key === null) {
      memory = null;
      previous = undefined;
      callback();
    }
  };
  window.addEventListener("storage", storage);
  window.addEventListener(NOTIFICATION_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(NOTIFICATION_CHANGE_EVENT, callback);
  };
}
export function saveNotificationPreferences(config: NotificationPreferences): {
  persisted: boolean;
} {
  const validated = parseNotificationPreferences(config);
  if (!validated)
    throw new Error("Invalid notification preferences. No changes were saved.");
  const raw = JSON.stringify(validated);
  let persisted = true;
  try {
    window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, raw);
    memory = null;
  } catch {
    memory = raw;
    persisted = false;
  }
  previous = undefined;
  window.dispatchEvent(new Event(NOTIFICATION_CHANGE_EVENT));
  return { persisted };
}
export function useNotificationPreferences() {
  const config = useSyncExternalStore(
    subscribe,
    readNotificationPreferences,
    () => EMPTY,
  );
  return {
    config,
    save: saveNotificationPreferences,
    invalid: corrupt,
    sessionOnly: memory !== null,
  };
}
