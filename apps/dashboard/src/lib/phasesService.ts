import { api } from './api';

export const phasesService = {
  getPhases: async (projectId: string) => {
    const res = await api.get(`/phases/projects/${projectId}`);
    return res.data;
  },

  createPhase: async (projectId: string, data: { name: string; position: number; startDate?: string; endDate?: string }) => {
    const res = await api.post(`/phases/projects/${projectId}`, data);
    return res.data;
  },

  getPhase: async (phaseId: string) => {
    const res = await api.get(`/phases/${phaseId}`);
    return res.data;
  },

  updatePhase: async (phaseId: string, data: { name?: string; position?: number; startDate?: string; endDate?: string; status?: string }) => {
    const res = await api.patch(`/phases/${phaseId}`, data);
    return res.data;
  },

  deletePhase: async (phaseId: string) => {
    const res = await api.delete(`/phases/${phaseId}`);
    return res.data;
  },

  getPhaseCards: async (phaseId: string) => {
    const res = await api.get(`/phases/${phaseId}/cards`);
    return res.data;
  },

  addCardToPhase: async (phaseId: string, cardId: string) => {
    const res = await api.post(`/phases/${phaseId}/cards`, { cardId });
    return res.data;
  },

  removeCardFromPhase: async (phaseId: string, cardId: string) => {
    const res = await api.delete(`/phases/${phaseId}/cards/${cardId}`);
    return res.data;
  }
};
