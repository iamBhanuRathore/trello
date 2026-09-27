import { api } from './api';

export interface Priority {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  rank: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const priorityService = {
  async list(): Promise<Priority[]> {
    const res = await api.get('/priorities');
    return res.data;
  },
  async create(input: { name: string; color?: string }): Promise<Priority> {
    const res = await api.post('/priorities', input);
    return res.data;
  },
  async update(
    id: string,
    input: { name?: string; color?: string; rank?: number }
  ): Promise<Priority> {
    const res = await api.patch(`/priorities/${id}`, input);
    return res.data;
  },
  async remove(id: string): Promise<{ success: boolean; reassignedTo: string }> {
    const res = await api.delete(`/priorities/${id}`);
    return res.data;
  },
  async setDefault(id: string): Promise<Priority> {
    const res = await api.post(`/priorities/${id}/default`);
    return res.data;
  },
};
