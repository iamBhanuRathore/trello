import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

/**
 * `/auth/me` was requested twice on every dashboard load.
 *
 * `checkAuth` has four independent triggers — the App mount effect, the window
 * `focus` staleness net, the 403 interceptor in lib/api.ts, and ProfileSettings.
 * None knew about the others, and there was no in-flight guard, so every
 * concurrent trigger opened its own request. React 18 StrictMode
 * double-invokes effects in development, which fired the mount effect twice and
 * made the duplicate visible on every load.
 *
 * The fix deduplicates at the store (single-flight, keyed by access token) and
 * seeds the focus throttle with the mount time. Both are verified here against
 * the real store with `api.get` mocked and a call counter — not asserted in prose.
 */

/**
 * The store reads localStorage at module-init time, and this suite runs without
 * a DOM (the repo has no jsdom/happy-dom). Stub the minimum surface it uses
 * BEFORE the dynamic import below.
 */
const ls = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => void ls.set(k, v),
  removeItem: (k: string) => void ls.delete(k),
  clear: () => ls.clear(),
  key: (i: number) => [...ls.keys()][i] ?? null,
  get length() {
    return ls.size;
  },
} as Storage;

const getCalls: string[] = [];
let resolveMe: ((v: unknown) => void) | null = null;
let meGate: Promise<unknown> | null = null;

const apiGet = mock(async (url: string) => {
  getCalls.push(url);
  // Hold the response open so concurrent triggers provably overlap.
  if (url === '/auth/me' && meGate) await meGate;
  return { data: { id: 'user-1', name: 'Test', email: 't@e.com', organizationId: 'org-1' } };
});

mock.module('../lib/api', () => ({
  api: { get: apiGet, post: async () => ({ data: {} }) },
}));
mock.module('../lib/queryClient', () => ({ clearCachedData: () => {} }));
mock.module('./chatStore', () => ({
  useChatStore: { getState: () => ({ resetSessionState: () => {} }) },
}));

const { useAuthStore } = await import('./authStore');

const store = () => useAuthStore.getState();

function primeToken(token = 'token-abc') {
  localStorage.setItem('boardly_access_token', token);
}

describe('checkAuth single-flight', () => {
  beforeEach(() => {
    getCalls.length = 0;
    meGate = null;
    primeToken();
    store().checkAuth();
    // Wait for the boot request to land so each case starts from a clean slate.
    return Promise.resolve().then(() => undefined);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('two concurrent triggers produce ONE /auth/me request', async () => {
    getCalls.length = 0;
    meGate = new Promise((r) => {
      resolveMe = r;
    });

    // StrictMode's double-invoked effect.
    const a = store().checkAuth();
    const b = store().checkAuth();

    resolveMe?.({});
    await Promise.all([a, b]);

    expect(getCalls.filter((u) => u === '/auth/me').length).toBe(1);
  });

  it('four concurrent triggers still produce ONE request', async () => {
    getCalls.length = 0;
    meGate = new Promise((r) => {
      resolveMe = r;
    });

    // Mount effect x2 (StrictMode) + focus net + 403 interceptor.
    const calls = [
      store().checkAuth(),
      store().checkAuth(),
      store().checkAuth(),
      store().checkAuth(),
    ];

    resolveMe?.({});
    await Promise.all(calls);

    expect(getCalls.filter((u) => u === '/auth/me').length).toBe(1);
  });

  it('resolves every caller with the same result', async () => {
    meGate = new Promise((r) => {
      resolveMe = r;
    });
    const a = store().checkAuth();
    const b = store().checkAuth();
    resolveMe?.({});
    await Promise.all([a, b]);

    expect(store().isAuthenticated).toBe(true);
    expect(store().authResolved).toBe(true);
    expect(store().user?.id).toBe('user-1');
  });

  it('a NEW token is not served by an in-flight request for the old one', async () => {
    getCalls.length = 0;
    meGate = new Promise((r) => {
      resolveMe = r;
    });

    // A check for the old token is in flight...
    const stale = store().checkAuth();
    // ...then the identity changes before it resolves.
    primeToken('token-def');

    const fresh = store().checkAuth();
    resolveMe?.({});
    await Promise.all([stale, fresh]);

    // Two different tokens must not share one cached promise.
    expect(getCalls.filter((u) => u === '/auth/me').length).toBe(2);
  });

  it('a later trigger after settle issues a fresh request', async () => {
    getCalls.length = 0;
    await store().checkAuth();
    await store().checkAuth();

    // Single-flight dedupes CONCURRENT calls only; a settled one must not
    // permanently pin the store to "already verified".
    expect(getCalls.filter((u) => u === '/auth/me').length).toBe(2);
  });

  it('no stored token short-circuits without a request', async () => {
    getCalls.length = 0;
    localStorage.removeItem('boardly_access_token');
    await store().checkAuth();

    expect(getCalls.filter((u) => u === '/auth/me').length).toBe(0);
    expect(store().authResolved).toBe(true);
  });
});
