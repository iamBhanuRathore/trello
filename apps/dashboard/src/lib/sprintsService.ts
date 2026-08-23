import { api } from './api';

export const sprintsService = {
  getSprints: async (projectId: string) => {
    const res = await api.get(`/sprints/projects/${projectId}`);
    return res.data;
  },

  createSprint: async (projectId: string, data: { name: string; type: string; startDate: string; endDate: string; goal?: string }) => {
    const res = await api.post(`/sprints/projects/${projectId}`, data);
    return res.data;
  },

  getSprint: async (sprintId: string) => {
    const res = await api.get(`/sprints/${sprintId}`);
    return res.data;
  },

  updateSprint: async (sprintId: string, data: { name?: string; type?: string; startDate?: string; endDate?: string; goal?: string; status?: string }) => {
    const res = await api.patch(`/sprints/${sprintId}`, data);
    return res.data;
  },

  deleteSprint: async (sprintId: string) => {
    const res = await api.delete(`/sprints/${sprintId}`);
    return res.data;
  },

  getSprintCards: async (sprintId: string) => {
    const res = await api.get(`/sprints/${sprintId}/cards`);
    return res.data;
  },

  addCardToSprint: async (sprintId: string, cardId: string) => {
    const res = await api.post(`/sprints/${sprintId}/cards`, { cardId });
    return res.data;
  },

  removeCardFromSprint: async (sprintId: string, cardId: string) => {
    const res = await api.delete(`/sprints/${sprintId}/cards/${cardId}`);
    return res.data;
  }
};
