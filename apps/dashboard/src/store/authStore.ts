import { create } from 'zustand';
import { api } from '../lib/api';
import { clearCachedData } from '../lib/queryClient';
import { useChatStore } from './chatStore';

interface User {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  avatarUrl?: string;
  createdAt: string;
  isPlatformAdmin: boolean;
  timezone: string;
  twoFactorEnabled: boolean;
  role?: string | null; // org-level role: org_owner, org_admin, member, etc.
  /** Effective permission keys from GET /auth/me (server-expanded, fail-closed). */
  permissions?: string[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * True once the server has given a DEFINITIVE answer about the session.
   *
   * This exists because `isAuthenticated` alone conflates three states:
   *   - a stored token we have not verified yet  (boot, pre-checkAuth)
   *   - verified, with a user                    (normal)
   *   - "staying authenticated through a 5xx"    (transient outage)
   *
   * Treating the first as authenticated flashed the private route before
   * checkAuth resolved, so an expired token showed a frame of the app shell.
   * Treating the third as authenticated-with-a-user left `user: null`, which
   * silently disabled every query AND emptied the permission set — the UI
   * rendered as if the user had no permissions at all during an outage.
   *
   * Consumers should branch on this: show a loader while false, and only trust
   * `user` once true.
   */
  authResolved: boolean;
  login: (data: { user: User; accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

/**
 * In-flight `/auth/me` request, keyed by the access token it was issued for.
 *
 * `checkAuth` has four independent triggers — the App mount effect, the window
 * `focus` safety net, the 403 interceptor in lib/api.ts, and ProfileSettings —
 * and none of them knew about the others, so concurrent triggers each opened
 * their own request. React 18 StrictMode double-invokes effects in development,
 * which made the mount effect fire twice and put two `/auth/me` calls in the
 * network log on every load. Deduplicating here (rather than removing
 * StrictMode, or removing one trigger) keeps all four callers and makes the
 * duplicate structurally impossible.
 *
 * Keyed by token so a login mid-flight cannot be satisfied by a request that
 * was issued for the previous identity.
 */
let inFlightMe: { token: string; promise: Promise<void> } | null = null;

/** Cleared on every identity transition so no stale promise is ever reused. */
function resetInFlight(): void {
  inFlightMe = null;
}

async function runCheckAuth(): Promise<void> {
  const token = localStorage.getItem('boardly_access_token');
  if (!token) {
    setAuthState({ user: null, isAuthenticated: false, isLoading: false, authResolved: true });
    resetSessionCaches();
    return;
  }

  try {
    const res = await api.get('/auth/me');
    const previousId = useAuthStore.getState().user?.id;
    setAuthState({
      user: res.data,
      isAuthenticated: true,
      isLoading: false,
      authResolved: true,
    });
    // Token swap without a login call (DevTools paste, restored session):
    // a different identity must never inherit the cached identity's data.
    if (previousId && previousId !== res.data?.id) resetSessionCaches();
  } catch (error: any) {
    const status = error?.response?.status;
    // Reboot/network blip (or 5xx): the stored session may still be valid.
    // Keep tokens and stay authenticated — queries retry on their own.
    // Only a definitive rejection clears the session below.
    if (status === undefined || status >= 500) {
      // Stay UNRESOLVED. Tokens are kept, but nothing downstream should treat
      // this as a verified identity — that produced isAuthenticated:true with
      // user:null, which emptied the permission set and disabled every query.
      setAuthState({ isLoading: false, authResolved: false });
      return;
    }
    // If a login just occurred with a new token, do not wipe the new session
    const currentToken = localStorage.getItem('boardly_access_token');
    if (!currentToken || currentToken === token) {
      localStorage.removeItem('boardly_access_token');
      localStorage.removeItem('boardly_refresh_token');
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        authResolved: true,
      });
      resetSessionCaches();
    }
  }
}

/** `set` is not in scope for the hoisted runCheckAuth, so route through the store. */
const setAuthState = (partial: Partial<AuthState>): void => useAuthStore.setState(partial);

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  // A stored token is a HINT, not a verified session. Boot as unresolved so the
  // protected route waits for checkAuth instead of flashing private UI.
  isAuthenticated: false,
  isLoading: !!localStorage.getItem('boardly_access_token'),
  authResolved: !localStorage.getItem('boardly_access_token'),
  login: (data) => {
    if (data.accessToken) localStorage.setItem('boardly_access_token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('boardly_refresh_token', data.refreshToken);
    set({ user: data.user, isAuthenticated: true, isLoading: false, authResolved: true });
    resetInFlight();
    resetSessionCaches();
  },
  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('boardly_refresh_token');
      if (refreshToken) {
        await api.post('/auth/sign-out', { refreshToken });
      }
    } catch {}
    localStorage.removeItem('boardly_access_token');
    localStorage.removeItem('boardly_refresh_token');
    set({ user: null, isAuthenticated: false, isLoading: false, authResolved: true });
    resetInFlight();
    resetSessionCaches();
  },
  checkAuth: () => {
    const token = localStorage.getItem('boardly_access_token');
    // Single-flight: concurrent triggers share one request. Re-keyed on the
    // token so a request issued for a previous identity is never reused.
    if (token && inFlightMe && inFlightMe.token === token) return inFlightMe.promise;
    const promise = runCheckAuth().finally(() => {
      if (inFlightMe?.promise === promise) inFlightMe = null;
    });
    inFlightMe = token ? { token, promise } : null;
    return promise;
  },
}));

/**
 * Drop everything the previous identity could leak into the next session:
 * server cache (query keys are not user-scoped) and persisted/ephemeral chat
 * state (outbox, drafts, channel pointers). Called on every transition that
 * establishes or revokes an identity — never on transient network blips,
 * where the session may still be valid.
 */
function resetSessionCaches(): void {
  clearCachedData();
  useChatStore.getState().resetSessionState();
}
