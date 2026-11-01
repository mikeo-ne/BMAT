"use client";
import { browserSession } from "@/lib/auth-client";
import { sessionScope } from "@/lib/auth-types";
const DB = "east-sound-private-cache-v1";
const TIMEOUT = 3000;
function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) {
        db?.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT);
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("snapshots"))
          request.result.createObjectStore("snapshots");
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}
function currentScope(userId: string, expectedScope: string): boolean {
  const user = browserSession().user;
  return user?.id === userId && sessionScope(user) === expectedScope;
}
/** Browser caches never authorize a request. Both the user and assignment scope fence asynchronous work. */
export async function cacheSnapshot(
  userId: string,
  key: string,
  value: unknown,
  expectedScope = sessionScope(browserSession().user),
) {
  if (!currentScope(userId, expectedScope)) return;
  const db = await open();
  if (!db) return;
  try {
    if (!currentScope(userId, expectedScope)) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction("snapshots", "readwrite");
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch {}
        finish();
      }, TIMEOUT);
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
      try {
        tx.objectStore("snapshots").put(
          { value, at: Date.now(), scope: expectedScope },
          userId + ":" + key,
        );
      } catch {
        try {
          tx.abort();
        } catch {}
        finish();
      }
    });
  } catch {
    // Blocked storage does not invalidate an authenticated server save.
  } finally {
    db.close();
  }
}
/** Eviction deliberately does not require the old identity to remain active. */
export async function evictUserCache(userId: string) {
  const db = await open();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction("snapshots", "readwrite");
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch {}
        finish();
      }, TIMEOUT);
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
      try {
        const cursor = tx.objectStore("snapshots").openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) return;
          if (String(item.key).startsWith(userId + ":")) item.delete();
          item.continue();
        };
      } catch {
        try {
          tx.abort();
        } catch {}
        finish();
      }
    });
  } catch {
    // Never block server logout on an unavailable browser database.
  } finally {
    db.close();
  }
}
export async function cachedSnapshot<T>(
  userId: string,
  key: string,
  expectedScope = sessionScope(browserSession().user),
): Promise<T | null> {
  if (!currentScope(userId, expectedScope)) return null;
  const db = await open();
  if (!db) return null;
  try {
    if (!currentScope(userId, expectedScope)) return null;
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction("snapshots"),
        request = tx.objectStore("snapshots").get(userId + ":" + key);
      const finish = (value: T | null) => {
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch {}
        finish(null);
      }, TIMEOUT);
      request.onsuccess = () =>
        finish(
          currentScope(userId, expectedScope) &&
            request.result?.scope === expectedScope
            ? request.result.value
            : null,
        );
      request.onerror = () => finish(null);
      tx.onabort = () => finish(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}
