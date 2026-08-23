import { api } from './api';

export const superAdminService = {
  getOrgs: async () => {
    const res = await api.get('/superadmin/orgs');
    return res.data;
  },

  getPlans: async () => {
    const res = await api.get('/superadmin/plans');
    return res.data;
  },

  updatePlan: async (planId: string, data: any) => {
    const res = await api.patch(`/superadmin/plans/${planId}`, data);
    return res.data;
  }
};
