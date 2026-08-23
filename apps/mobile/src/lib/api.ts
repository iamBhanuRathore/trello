import axios from 'axios';

// Defaults to localhost for iOS Simulator or 10.0.2.2 for Android Emulator
export const API_BASE_URL =
  (globalThis as any).process?.env?.['EXPO_PUBLIC_API_URL'] || 'http://localhost:3001/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

api.interceptors.request.use((config) => {
  if (authToken && config.headers) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// ── Auth APIs ──
export const login = async (email: string, password: string) => {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
};

// ── Workspaces & Projects ──
export const getWorkspaces = async () => {
  const { data } = await api.get('/workspaces');
  return data;
};

export const getWorkspaceProjects = async (workspaceId: string) => {
  const { data } = await api.get(`/workspaces/${workspaceId}/projects`);
  return data;
};

// ── Boards & Lists ──
export const getProjectBoards = async (projectId: string) => {
  const { data } = await api.get(`/projects/${projectId}/boards`);
  return data;
};

export const getBoardDetails = async (boardId: string) => {
  const { data } = await api.get(`/boards/${boardId}`);
  return data;
};

export const getBoardLists = async (boardId: string) => {
  const { data } = await api.get(`/boards/${boardId}/lists`);
  return data;
};

export const getListCards = async (listId: string) => {
  const { data } = await api.get(`/cards?listId=${listId}`);
  return data;
};

// ── Cards & Comments ──
export const getCardDetail = async (cardId: string) => {
  const { data } = await api.get(`/cards/${cardId}`);
  return data;
};

export const createCard = async (payload: { listId: string; title: string; description?: string }) => {
  const { data } = await api.post('/cards', payload);
  return data;
};

export const updateCard = async (cardId: string, payload: any) => {
  const { data } = await api.patch(`/cards/${cardId}`, payload);
  return data;
};

export const moveCard = async (cardId: string, payload: { listId: string; position: number }) => {
  const { data } = await api.post(`/cards/${cardId}/move`, payload);
  return data;
};

export const getCardComments = async (cardId: string) => {
  const { data } = await api.get(`/cards/${cardId}/comments`);
  return data;
};

export const addCardComment = async (cardId: string, text: string) => {
  const { data } = await api.post(`/cards/${cardId}/comments`, { content: text });
  return data;
};

export const toggleChecklistItem = async (cardId: string, itemId: string, isCompleted: boolean) => {
  const { data } = await api.patch(`/cards/${cardId}/checklist-items/${itemId}`, { isCompleted });
  return data;
};

// ── Push Notifications ──
export const registerPushToken = async (payload: { platform: string; token: string; deviceName?: string }) => {
  const { data } = await api.post('/notifications/push-devices', payload);
  return data;
};
