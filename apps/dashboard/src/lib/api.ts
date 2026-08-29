import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/v1';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

// Importers
export const importTrelloBoard = async (projectId: string, trelloData: any) => {
  const { data } = await api.post(`/import/projects/${projectId}/trello`, { trelloData });
  return data;
};

export const importTasksData = async (
  projectId: string,
  payload: {
    boardName: string;
    lists: {
      name: string;
      tasks: { title: string; description?: string; storyPoints?: number; dueDate?: string }[];
    }[];
  }
) => {
  const { data } = await api.post(`/import/projects/${projectId}/tasks`, payload);
  return data;
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

export const updateRole = async (id: string, payload: { name?: string; permissionIds?: string[] }) => {
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
export const createDoc = async (projectId: string, payload: { title: string; content?: string }) => {
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

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('boardly_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken }, {
          headers: { 'Content-Type': 'application/json' },
          withCredentials: true,
        });
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
