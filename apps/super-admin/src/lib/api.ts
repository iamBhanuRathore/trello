import axios from 'axios';
import { captureApiError } from './sentry';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const ACCESS_KEY = 'boardly_superadmin_token';
const REFRESH_KEY = 'boardly_superadmin_refresh_token';
// Fallback for sessions created by the main dashboard login.
const FALLBACK_ACCESS_KEY = 'boardly_access_token';

function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY) || localStorage.getItem(FALLBACK_ACCESS_KEY);
}

api.interceptors.request.use((config) => {
  if (
    config.url?.includes('/auth/sign-in') ||
    config.url?.includes('/auth/sign-up') ||
    config.url?.includes('/auth/refresh')
  ) {
    return config;
  }
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight refresh (mirrors apps/dashboard/src/lib/api.ts): concurrent
// 401s share one rotation; navigator.locks dedups across tabs. Without this,
// parallel 401s race into the server reuse detector and burn the family.
let refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;

function singleFlightRefresh(): Promise<{ accessToken: string; refreshToken: string }> {
  if (refreshPromise) return refreshPromise;
  const attempt = async () => {
    const failedAccess = getAccessToken();
    const run = async () => {
      const currentAccess = getAccessToken();
      const currentRefresh = localStorage.getItem(REFRESH_KEY);
      if (!currentRefresh) throw new Error('No refresh token');
      if (currentAccess !== failedAccess && failedAccess !== null) {
        return { accessToken: currentAccess ?? '', refreshToken: currentRefresh };
      }
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL || '/v1'}/auth/refresh`,
        { refreshToken: currentRefresh },
        { headers: { 'Content-Type': 'application/json' }, withCredentials: true }
      );
      localStorage.setItem(ACCESS_KEY, data.accessToken);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      return data as { accessToken: string; refreshToken: string };
    };
    const locks =
      typeof navigator !== 'undefined' &&
      typeof (navigator as Navigator & { locks?: { request: Function } }).locks?.request ===
        'function'
        ? (
            navigator as Navigator & {
              locks: { request<T>(name: string, cb: () => Promise<T>): Promise<T> };
            }
          ).locks
        : null;
    return locks ? locks.request('boardly-superadmin-refresh', run) : run();
  };
  const p = attempt();
  refreshPromise = p;
  p.then(
    () => {
      if (refreshPromise === p) refreshPromise = null;
    },
    () => {
      if (refreshPromise === p) refreshPromise = null;
    }
  );
  return p;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute =
      originalRequest?.url?.includes('/auth/sign-in') ||
      originalRequest?.url?.includes('/auth/sign-up') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/sign-out');

    // Explicit capture: these rejections are consumed by the query layer and
    // toasted, so the global unhandledrejection handler never sees them.
    // 5xx and unreachable-API are defects; 401/403/404/422 are not.
    if (!isAuthRoute && (!error.response || (error.response?.status ?? 0) >= 500)) {
      captureApiError(error, originalRequest?.url ?? 'unknown');
    }

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        const data = await singleFlightRefresh();
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (err) {
        // Only a definitive auth rejection clears the session — network/5xx
        // on refresh must never nuke it.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403 || status === 404) {
          localStorage.removeItem(ACCESS_KEY);
          localStorage.removeItem(REFRESH_KEY);
        }
        return Promise.reject(error);
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem(ACCESS_KEY);
    }
    return Promise.reject(error);
  }
);
