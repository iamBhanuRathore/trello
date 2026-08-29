import { api } from './api';
import type { PlatformUser } from './orgService';

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
  },

  getUsers: async (): Promise<PlatformUser[]> => {
    const res = await api.get('/superadmin/users');
    return res.data;
  },

  getUser: async (userId: string) => {
    const res = await api.get(`/superadmin/users/${userId}`);
    return res.data;
  },

  forceLogoutUser: async (userId: string) => {
    const res = await api.post(`/superadmin/users/${userId}/force-logout`);
    return res.data;
  },
};
