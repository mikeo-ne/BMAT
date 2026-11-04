// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureBrowserSession } from "@/lib/auth-client";
import { sessionScope, type BrowserSession } from "@/lib/auth-types";
import {
  cachedSnapshot,
  cacheSnapshot,
  evictUserCache,
} from "@/lib/browser-cache";
const session = (
  id = "alpha",
  stationIds = ["capital-kla"],
): BrowserSession => ({
  user: {
    id,
    stationIds,
    name: "QA Manager",
    email: "qa@example.com",
    role: "broadcaster",
    mock: false,
  },
  csrfToken: "a".repeat(64),
  expiresAt: null,
});
function database() {
  const opened: {
    result: IDBDatabase;
    onsuccess?: () => void;
    onerror?: () => void;
    onblocked?: () => void;
  }[] = [];
  const read: {
    result: unknown;
    onsuccess?: () => void;
    onerror?: () => void;
  } = { result: null };
  const cursor: { result: unknown; onsuccess?: () => void } = { result: null };
  const tx = {
    oncomplete: undefined as (() => void) | undefined,
    onerror: undefined as (() => void) | undefined,
    onabort: undefined as (() => void) | undefined,
    abort: vi.fn(),
  };
  const put = vi.fn(() => {
    queueMicrotask(() => tx.oncomplete?.());
  });
  const get = vi.fn(() => read);
  const db = {
    close: vi.fn(),
    transaction: vi.fn(() => ({
      ...tx,
      objectStore: () => ({ put, get, openCursor: () => cursor }),
    })),
  };
  // Assign handlers to the same transaction object instead of copying them.
  db.transaction.mockImplementation(() =>
    Object.assign(tx, {
      objectStore: () => ({ put, get, openCursor: () => cursor }),
    }),
  );
  vi.stubGlobal("indexedDB", {
    open: vi.fn(() => {
      const request = { result: db as unknown as IDBDatabase };
      opened.push(request);
      return request;
    }),
  });
  return {
    opened,
    db,
    put,
    get,
    tx,
    read,
    cursor,
    succeed: (index = 0) => opened[index].onsuccess?.(),
  };
}
beforeEach(() => configureBrowserSession(session()));
afterEach(() => {
  configureBrowserSession({ user: null, csrfToken: null, expiresAt: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("non-authoritative browser cache races and bounded persistence", () => {
  it.each([session("beta"), session("alpha", ["cbs-kla"])])(
    "never inserts a pending old snapshot after an identity/assignment change",
    async (next) => {
      const fake = database(),
        pending = cacheSnapshot("alpha", "stations", ["private source"]);
      configureBrowserSession(next);
      fake.succeed();
      await pending;
      expect(fake.put).not.toHaveBeenCalled();
      expect(fake.db.close).toHaveBeenCalledOnce();
    },
  );
  it("does not open the database for an explicitly stale source scope", async () => {
    const fake = database(),
      old = sessionScope(session().user);
    configureBrowserSession(session("alpha", ["cbs-kla"]));
    await cacheSnapshot("alpha", "stations", ["old station"], old);
    expect(fake.opened).toHaveLength(0);
  });
  it.each([session("beta"), session("alpha", ["cbs-kla"])])(
    "discards an in-flight read if identity or assignments change",
    async (next) => {
      const fake = database(),
        scope = sessionScope(session().user);
      const pending = cachedSnapshot("alpha", "stations");
      fake.succeed();
      await Promise.resolve();
      fake.read.result = { value: "old private source", scope };
      configureBrowserSession(next);
      fake.read.onsuccess?.();
      expect(await pending).toBeNull();
    },
  );
  it("binds a successful snapshot envelope to the current scope", async () => {
    const fake = database(),
      scope = sessionScope(session().user);
    const pending = cacheSnapshot("alpha", "stations", ["CBS"]);
    fake.succeed();
    await pending;
    expect(fake.put).toHaveBeenCalledWith(
      expect.objectContaining({ value: ["CBS"], scope }),
      "alpha:stations",
    );
    const read = cachedSnapshot<string[]>("alpha", "stations");
    fake.succeed(1);
    await Promise.resolve();
    fake.read.result = { value: ["CBS"], scope };
    fake.read.onsuccess?.();
    expect(await read).toEqual(["CBS"]);
  });
  it("ignores snapshots from an obsolete assignment or an older unscoped cache version", async () => {
    const fake = database();
    for (const value of [
      { value: "old" },
      { value: "old", scope: "obsolete" },
    ]) {
      const pending = cachedSnapshot("alpha", "stations");
      fake.succeed(fake.opened.length - 1);
      await Promise.resolve();
      fake.read.result = value;
      fake.read.onsuccess?.();
      expect(await pending).toBeNull();
    }
  });
  it("times out a blocked database and closes a late successful open", async () => {
    vi.useFakeTimers();
    const fake = database(),
      pending = cachedSnapshot("alpha", "stations");
    await vi.advanceTimersByTimeAsync(3001);
    expect(await pending).toBeNull();
    fake.succeed();
    expect(fake.db.close).toHaveBeenCalledOnce();
  });
  it("does not leave logout waiting on a stalled browser transaction", async () => {
    vi.useFakeTimers();
    const fake = database(),
      pending = evictUserCache("alpha");
    fake.succeed();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3001);
    await pending;
    expect(fake.tx.abort).toHaveBeenCalledOnce();
    expect(fake.db.close).toHaveBeenCalledOnce();
  });
  it("tolerates denied IndexedDB without using localStorage as private authority", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(
      cacheSnapshot("alpha", "stations", ["CBS"]),
    ).resolves.toBeUndefined();
    expect(await cachedSnapshot("alpha", "stations")).toBeNull();
  });
});
