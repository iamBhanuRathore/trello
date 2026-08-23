import { api } from './api';

export const stagesService = {
  getTemplates: async (orgId: string) => {
    const res = await api.get(`/stages/orgs/${orgId}/templates`);
    return res.data;
  },

  createTemplate: async (orgId: string, data: { name: string; isDefault?: boolean }) => {
    const res = await api.post(`/stages/orgs/${orgId}/templates`, data);
    return res.data;
  },

  getTemplate: async (templateId: string) => {
    const res = await api.get(`/stages/templates/${templateId}`);
    return res.data;
  },

  updateTemplate: async (templateId: string, data: { name?: string; isDefault?: boolean }) => {
    const res = await api.patch(`/stages/templates/${templateId}`, data);
    return res.data;
  },

  deleteTemplate: async (templateId: string) => {
    const res = await api.delete(`/stages/templates/${templateId}`);
    return res.data;
  },

  createStage: async (templateId: string, data: { name: string; color: string; position: number; category: string }) => {
    const res = await api.post(`/stages/templates/${templateId}/stages`, data);
    return res.data;
  },

  updateStage: async (stageId: string, data: { name?: string; color?: string; position?: number; category?: string }) => {
    const res = await api.patch(`/stages/${stageId}`, data);
    return res.data;
  },

  deleteStage: async (stageId: string) => {
    const res = await api.delete(`/stages/${stageId}`);
    return res.data;
  }
};
