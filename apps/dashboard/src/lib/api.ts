import axios from 'axios';
import { toast } from 'sonner';
import { edenV1 } from './eden';
import type { ImportTasksBody, ImportTrelloBody } from '@boardly/backend/modules/importers/schema';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/v1';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Standard utility to parse error responses from the backend API.
 * Handles validation error arrays, message summaries, and standard error fields.
 */
export function getApiErrorMessage(
  err: any,
  fallbackMessage: string = 'An error occurred. Please try again.'
): string {
  // Request cancellations are intentional — never surface them as errors.
  if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return fallbackMessage;

  // No HTTP response at all: the request died before the server answered
  // (backend down/restarting, offline, or browser-blocked). DevTools labels
  // these as "CORS errors" even though the server's CORS headers are fine —
  // the response simply never arrived. Name the real cause instead.
  if (!err?.response) {
    return 'Cannot reach the API server — it may be restarting or offline. Wait a moment and try again.';
  }

  const data = err?.response?.data;
  if (!data) return err?.message || fallbackMessage;

  // 1. If detailed validation error array exists, return the first field message
  if (Array.isArray(data.details) && data.details.length > 0 && data.details[0]?.message) {
    return data.details[0].message;
  }

  // 2. If a specific message string exists
  if (data.message && typeof data.message === 'string' && data.message !== 'Validation failed') {
    return data.message;
  }

  // 3. If standard error string exists
  if (data.error && typeof data.error === 'string') {
    return data.error;
  }

  return fallbackMessage;
}

/**
 * Convert an Eden Treaty `{ error }` into a readable message using the same
 * backend-error parser as the axios calls. Eden carries the response body on
 * `.value` (falls back to the error itself for network-level failures).
 */
export function edenErrorMessage(
  error: unknown,
  fallbackMessage: string = 'An error occurred. Please try again.'
): string {
  const body =
    typeof error === 'object' && error !== null && 'value' in error
      ? (error as { value: unknown }).value
      : error;
  return getApiErrorMessage({ response: { data: body } }, fallbackMessage);
}

/**
 * Shared Eden Treaty unwrapper — use for EVERY Eden call instead of hand-rolling
 * `{ data, error }` checks. Throws on transport errors AND on backend error-shape
 * bodies (handlers return those inline, so Eden types `data` as a union), and
 * narrows the error member out — callers keep the success shape with autocomplete.
 */
export async function edenCall<TData>(
  request: Promise<{ data: TData; error: unknown }>,
  fallbackMessage: string = 'An error occurred. Please try again.'
): Promise<Exclude<TData, { error: string }>> {
  const { data, error } = await request;
  if (error) throw new Error(edenErrorMessage(error, fallbackMessage));
  if (isEdenErrorBody(data)) {
    throw new Error(edenErrorMessage({ value: data }, fallbackMessage));
  }
  return data as Exclude<TData, { error: string }>;
}

function isEdenErrorBody(data: unknown): data is { error: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  );
}

// Notifications
export const getNotifications = async () => {
  return api.get('/notifications');
};

export const markNotificationAsRead = (notificationId: string) => {
  return api.patch(`/notifications/${notificationId}/read`);
};

export const markAllNotificationsAsRead = () => {
  return api.post('/notifications/read-all');
};

export const getNotificationPreferences = async () => {
  const { data } = await api.get('/notifications/preferences');
  return data;
};

export const updateNotificationPreferences = async (preferences: any[]) => {
  const { data } = await api.put('/notifications/preferences', { preferences });
  return data;
};

// Webhooks
export const getWebhooks = async (orgId: string) => {
  const { data } = await api.get(`/organizations/${orgId}/webhooks`);
  return data;
};

export const createWebhook = async (orgId: string, payload: { url: string; events: string[] }) => {
  const { data } = await api.post(`/organizations/${orgId}/webhooks`, payload);
  return data;
};

export const updateWebhook = async (orgId: string, id: string, payload: any) => {
  const { data } = await api.put(`/organizations/${orgId}/webhooks/${id}`, payload);
  return data;
};

export const deleteWebhook = async (orgId: string, id: string) => {
  const { data } = await api.delete(`/organizations/${orgId}/webhooks/${id}`);
  return data;
};

// Reports & Analytics
export const getProjectSummaryReport = async (projectId: string) => {
  const { data } = await api.get(`/reports/projects/${projectId}/summary`);
  return data;
};

export const getProjectVelocity = async (projectId: string) => {
  const { data } = await api.get(`/reports/projects/${projectId}/velocity`);
  return data;
};

export const getSprintBurndown = async (sprintId: string) => {
  const { data } = await api.get(`/reports/sprints/${sprintId}/burndown`);
  return data;
};

export const getBoardSummaryReport = async (boardId: string) => {
  const { data } = await api.get(`/reports/boards/${boardId}/summary`);
  return data;
};

// Time Tracking
export const logCardTime = async (
  cardId: string,
  payload: { minutes: number; description?: string; loggedDate?: string; isBillable?: boolean }
) => {
  const { data } = await api.post(`/time-tracking/cards/${cardId}`, payload);
  return data;
};

export const getCardTimeLogs = async (cardId: string) => {
  const { data } = await api.get(`/time-tracking/cards/${cardId}`);
  return data;
};

export const deleteTimeLog = async (id: string) => {
  const { data } = await api.delete(`/time-tracking/logs/${id}`);
  return data;
};

export const getTimesheet = async (params?: {
  userId?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
}) => {
  const { data } = await api.get('/time-tracking/timesheet', { params });
  return data;
};

// Importers (Eden Treaty — typed body/query; unwrap via shared edenCall).
// Payloads are annotated with the backend's exported `Static` body types
// (`modules/importers/schema.ts`, single source with route validation), so
// annotated literals complete on ANY TS language-server version.
export const importTrelloBoard = async (projectId: string, trelloData: any) => {
  const body: ImportTrelloBody = { trelloData };
  return edenCall(
    edenV1.import.projects({ projectId }).trello.post(body),
    'Import failed. Please try again.'
  );
};

export const importTasksData = async (projectId: string, payload: ImportTasksBody) => {
  return edenCall(
    edenV1.import.projects({ projectId }).tasks.post(payload),
    'Import failed. Please try again.'
  );
};

// Roles & Permissions
export const getRoles = async () => {
  const { data } = await api.get('/roles');
  return data;
};

export const getPermissions = async () => {
  const { data } = await api.get('/roles/permissions');
  return data;
};

export const createRole = async (payload: { name: string; permissionIds?: string[] }) => {
  const { data } = await api.post('/roles', payload);
  return data;
};

export const updateRole = async (
  id: string,
  payload: { name?: string; permissionIds?: string[] }
) => {
  const { data } = await api.patch(`/roles/${id}`, payload);
  return data;
};

export const deleteRole = async (id: string) => {
  const { data } = await api.delete(`/roles/${id}`);
  return data;
};

// Audit Logs
export const getAuditLogs = async (params?: {
  actorId?: string;
  action?: string;
  target?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}) => {
  const { data } = await api.get('/audit/logs', { params });
  return data;
};

export const logAuditEvent = async (payload: {
  action: string;
  target?: string;
  targetId?: string;
  metadata?: any;
}) => {
  const { data } = await api.post('/audit/logs', payload);
  return data;
};

// Project Docs & Wiki
export const createDoc = async (
  projectId: string,
  payload: { title: string; content?: string }
) => {
  const { data } = await api.post(`/projects/${projectId}/docs`, payload);
  return data;
};

export const getProjectDocs = async (projectId: string) => {
  const { data } = await api.get(`/projects/${projectId}/docs`);
  return data;
};

export const getDoc = async (id: string) => {
  const { data } = await api.get(`/docs/${id}`);
  return data;
};

export const updateDoc = async (
  id: string,
  payload: { title?: string; content?: string; isArchived?: boolean }
) => {
  const { data } = await api.patch(`/docs/${id}`, payload);
  return data;
};

export const deleteDoc = async (id: string) => {
  const { data } = await api.delete(`/docs/${id}`);
  return data;
};

export const linkCardToDoc = async (docId: string, cardId: string) => {
  const { data } = await api.post(`/docs/${docId}/cards/${cardId}`);
  return data;
};

export const unlinkCardFromDoc = async (docId: string, cardId: string) => {
  const { data } = await api.delete(`/docs/${docId}/cards/${cardId}`);
  return data;
};

// Advanced Reports (CFD, Cycle Time, Portfolio)
export const getProjectCFD = async (projectId: string, days = 14) => {
  const { data } = await api.get(`/reports/projects/${projectId}/cfd`, { params: { days } });
  return data;
};

export const getProjectCycleTime = async (projectId: string) => {
  const { data } = await api.get(`/reports/projects/${projectId}/cycle-time`);
  return data;
};

export const getWorkspacePortfolio = async (workspaceId: string) => {
  const { data } = await api.get(`/reports/workspaces/${workspaceId}/portfolio`);
  return data;
};

// Intake Forms & SLAs
export const getPublicForm = async (slug: string) => {
  const { data } = await api.get(`/forms/public/${slug}`);
  return data;
};

export const submitPublicForm = async (
  slug: string,
  payload: { submittedByName?: string; submittedByEmail?: string; data: Record<string, any> }
) => {
  const { data } = await api.post(`/forms/public/${slug}/submit`, payload);
  return data;
};

export const getBoardForms = async (boardId: string) => {
  const { data } = await api.get(`/forms/boards/${boardId}`);
  return data;
};

export const createIntakeForm = async (payload: {
  boardId: string;
  listId: string;
  title: string;
  description?: string;
  fields?: any[];
  isPublished?: boolean;
  defaultAssigneeId?: string;
  slaHours?: number;
}) => {
  const { data } = await api.post('/forms', payload);
  return data;
};

export const updateIntakeForm = async (id: string, payload: any) => {
  const { data } = await api.patch(`/forms/${id}`, payload);
  return data;
};

export const deleteIntakeForm = async (id: string) => {
  const { data } = await api.delete(`/forms/${id}`);
  return data;
};

// WorkOS OAuth & Enterprise SSO
export const getGoogleAuthUrl = async (redirectUri?: string) => {
  const { data } = await api.get('/auth/workos/google-url', {
    params: redirectUri ? { redirectUri } : undefined,
  });
  return data;
};

export const getWorkOSSSOAuthUrl = async (domain: string, redirectUri?: string) => {
  const { data } = await api.post('/auth/workos/sso-url', {
    domain,
    redirectUri,
  });
  return data;
};

export const exchangeWorkOSCode = async (code: string) => {
  const { data } = await api.post('/auth/workos/callback', { code });
  return data;
};

// Enterprise SSO & SCIM
export const getSSOConfig = async () => {
  const { data } = await api.get('/sso');
  return data;
};

export const updateSSOConfig = async (payload: {
  provider?: string;
  domain?: string;
  idpMetadataUrl?: string;
  clientId?: string;
  clientSecret?: string;
  workosOrganizationId?: string;
  workosConnectionId?: string;
  scimEnabled?: boolean;
  enforceSSO?: boolean;
}) => {
  const { data } = await api.patch('/sso', payload);
  return data;
};

export const getSSOLoginUrl = async (domain: string) => {
  const { data } = await api.post('/sso/login-url', { domain });
  return data;
};

// Developer API Keys
export const getApiKeys = async () => {
  const { data } = await api.get('/developer/keys');
  return data;
};

export const createApiKey = async (payload: {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
}) => {
  const { data } = await api.post('/developer/keys', payload);
  return data;
};

export const revokeApiKey = async (id: string) => {
  const { data } = await api.delete(`/developer/keys/${id}`);
  return data;
};

// Marketplace & Power-Ups
export const getMarketplaceApps = async (category?: string, search?: string) => {
  const { data } = await api.get('/marketplace/apps', {
    params: { category, search },
  });
  return data;
};

export const getMarketplaceAppDetail = async (id: string) => {
  const { data } = await api.get(`/marketplace/apps/${id}`);
  return data;
};

export const installMarketplaceApp = async (
  id: string,
  payload?: { boardId?: string; config?: Record<string, any> }
) => {
  const { data } = await api.post(`/marketplace/apps/${id}/install`, payload);
  return data;
};

export const updateInstalledAppConfig = async (
  installedId: string,
  payload: { config?: Record<string, any>; isEnabled?: boolean }
) => {
  const { data } = await api.patch(`/marketplace/apps/installed/${installedId}`, payload);
  return data;
};

export const uninstallMarketplaceApp = async (installedId: string) => {
  const { data } = await api.delete(`/marketplace/apps/installed/${installedId}`);
  return data;
};

// Request interceptor to attach access token
api.interceptors.request.use((config) => {
  if (
    config.url?.includes('/auth/sign-in') ||
    config.url?.includes('/auth/sign-up') ||
    config.url?.includes('/auth/refresh')
  ) {
    return config;
  }
  const token = localStorage.getItem('boardly_access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Cooldown so a burst of failing requests (e.g. during a backend restart)
// shows one toast instead of stacking one per request.
let lastUnreachableToastAt = 0;

// Interceptor to handle token refresh if 401 occurs
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute =
      originalRequest?.url?.includes('/auth/sign-in') ||
      originalRequest?.url?.includes('/auth/sign-up') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/sign-out');

    // No HTTP response: the API never answered (server down/restarting,
    // offline, or browser-blocked — DevTools mislabels these "CORS errors").
    // Surface it once so failures are never silent, then let the caller's
    // onError (via getApiErrorMessage) show the same cause.
    if (
      !error.response &&
      !isAuthRoute &&
      error?.code !== 'ERR_CANCELED' &&
      error?.name !== 'CanceledError'
    ) {
      const now = Date.now();
      if (now - lastUnreachableToastAt > 5000) {
        lastUnreachableToastAt = now;
        toast.error(
          'Cannot reach the API server — it may be restarting. Please retry in a few seconds.'
        );
      }
    }

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('boardly_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          { refreshToken },
          {
            headers: { 'Content-Type': 'application/json' },
            withCredentials: true,
          }
        );
        localStorage.setItem('boardly_access_token', data.accessToken);
        localStorage.setItem('boardly_refresh_token', data.refreshToken);

        // Update the original request's Authorization header
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (err) {
        // If refresh fails, log out the user
        localStorage.removeItem('boardly_access_token');
        localStorage.removeItem('boardly_refresh_token');
        useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

// We need a way to break circular dependencies since api is used in the store
// We'll import useAuthStore dynamically or inject it.
import { useAuthStore } from '../store/authStore';
