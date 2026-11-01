"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ROLE_HOME, sessionScope, type BrowserSession } from "@/lib/auth-types";
import {
  AUTH_CHANGED,
  DISPLAY_KEY,
  authFetch,
  browserSession,
  configureBrowserSession,
  evictPrivateBrowserState,
} from "@/lib/auth-client";
import { evictUserCache } from "@/lib/browser-cache";
const EMPTY: BrowserSession = { user: null, csrfToken: null, expiresAt: null };
interface AuthContextValue {
  session: BrowserSession;
  update: (session: BrowserSession) => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue>({
  session: EMPTY,
  update: async () => {},
  signOut: async () => {},
});
export function AuthProvider({
  initial,
  children,
  available = true,
}: {
  initial: BrowserSession;
  children: ReactNode;
  available?: boolean;
}) {
  const [session, setSession] = useState(initial),
    router = useRouter();
  const previous = useRef(initial),
    channel = useRef<BroadcastChannel | null>(null),
    revision = useRef(0);
  const update = useCallback((next: BrowserSession) => {
    const old = previous.current;
    const changed =
      sessionScope(old.user) !== sessionScope(next.user) ||
      old.csrfToken !== next.csrfToken;
    const retiring =
      old.user && sessionScope(old.user) !== sessionScope(next.user)
        ? old.user.id
        : null;
    const eviction = retiring ? evictUserCache(retiring) : Promise.resolve();
    if (retiring) evictPrivateBrowserState(retiring);
    if (changed) revision.current++;
    previous.current = next;
    configureBrowserSession(next);
    setSession(next);
    try {
      if (next.user)
        localStorage.setItem(
          DISPLAY_KEY,
          JSON.stringify({
            id: next.user.id,
            name: next.user.name,
            role: next.user.role,
          }),
        );
      else localStorage.removeItem(DISPLAY_KEY);
    } catch {}
    // Payload never conveys identity/permissions. Other tabs must re-fetch the HttpOnly session.
    if (changed)
      try {
        channel.current?.postMessage("session-changed");
      } catch {}
    // Account-change navigation must wait for deletion; unload can abort an open IDB request.
    return eviction;
  }, []);
  // Child preference/cache effects must see the trusted session on first mount.
  // Layout effects run only on the client, never mutating shared SSR module state.
  useLayoutEffect(() => {
    configureBrowserSession(session);
  }, [session]);
  useEffect(() => {
    if (!available) return;
    let closed = false;
    async function refresh() {
      const started = revision.current;
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!response.ok || closed) return;
        const next: BrowserSession = await response.json();
        if (closed || started !== revision.current) return;
        const changedIdentity =
          sessionScope(browserSession().user) !== sessionScope(next.user);
        await update(next);
        if (
          closed ||
          sessionScope(browserSession().user) !== sessionScope(next.user)
        )
          return;
        // A full navigation drops old React state, decoded files and stale RSC payloads.
        // A same-role account swap must not relabel the previous artist's catalogue/cache.
        if (changedIdentity)
          window.location.replace(ROLE_HOME[next.user?.role ?? "public"]);
      } catch {
        /* A network/cache failure never promotes a cached identity. */
      }
    }
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === DISPLAY_KEY) void refresh();
    };
    try {
      channel.current = new BroadcastChannel("east-sound:session-events:v1");
      channel.current.onmessage = () => void refresh();
    } catch {}
    window.addEventListener(AUTH_CHANGED, refresh);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(refresh, 60000);
    return () => {
      closed = true;
      clearInterval(timer);
      channel.current?.close();
      channel.current = null;
      window.removeEventListener(AUTH_CHANGED, refresh);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [available, update]);
  async function signOut() {
    const response = await authFetch("/api/auth/logout", { method: "POST" });
    if (!response.ok && response.status !== 401)
      throw new Error("Sign-out could not be confirmed. Retry.");
    await update(EMPTY);
    router.replace("/dashboard/charts");
    router.refresh();
  }
  return (
    <AuthContext.Provider value={{ session, update, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
