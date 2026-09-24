import { api } from './api';

export interface GitRepository {
  id: string;
  organizationId: string;
  projectId?: string | null;
  provider: string;
  owner: string;
  repo: string;
  isActive: boolean;
  lastEventAt?: string | null;
  lastError?: string | null;
  linkCount: number;
  createdAt: string;
}

export interface GitLink {
  id: string;
  kind: string;
  ref: string;
  url?: string | null;
  title?: string | null;
  state: string;
  author?: string | null;
  createdAt: string;
  owner: string;
  repo: string;
}

export const gitService = {
  async listRepos(): Promise<GitRepository[]> {
    const res = await api.get('/git/repos');
    return res.data;
  },

  async connectRepo(payload: {
    owner: string;
    repo: string;
    projectId?: string;
    webhookSecret?: string;
  }): Promise<GitRepository & { webhookSecret: string }> {
    const res = await api.post('/git/repos', payload);
    return res.data;
  },

  async disconnectRepo(id: string): Promise<void> {
    await api.delete(`/git/repos/${id}`);
  },

  async cardLinks(cardId: string): Promise<GitLink[]> {
    const res = await api.get(`/git/cards/${cardId}/links`);
    return res.data;
  },

  async branchName(cardId: string): Promise<{ branch: string }> {
    const res = await api.get(`/git/cards/${cardId}/branch`);
    return res.data;
  },

  webhookUrl(): string {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/v1';
    return `${base}/git/webhooks/github`;
  },
};
