import { api } from './api';

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  isPlatformAdmin: boolean;
  lastLoginAt?: string | null;
  deactivatedAt?: string | null;
  createdAt: string;
  organizationsCount: number;
  isMultiCompany: boolean;
  organizations: Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
    status: string;
    lastActiveAt?: string | null;
    joinedAt: string;
  }>;
}

export interface TenantOrg {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  isDedicatedDb?: boolean;
  dedicatedDbUrl?: string | null;
  plan?: {
    id: string;
    name: string;
    tier: string;
  } | null;
  subscription?: {
    status: string;
    seatCount: number;
  } | null;
  memberCounts?: {
    total: number;
    active: number;
    deactivated: number;
  };
}

export interface PlatformPlan {
  id: string;
  name: string;
  tier: string;
  stripePriceId?: string | null;
  maxSeats?: number | null;
  maxWorkspaces?: number | null;
  maxBoards?: number | null;
  maxStorageGb?: number | null;
  featureFlags?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export const superAdminService = {
  getOrgs: async (): Promise<TenantOrg[]> => {
    const res = await api.get('/superadmin/orgs');
    return res.data;
  },

  updateTenantDatabase: async (
    orgId: string,
    data: { isDedicatedDb: boolean; dedicatedDbUrl?: string | null }
  ) => {
    const res = await api.patch(`/superadmin/orgs/${orgId}/database`, data);
    return res.data;
  },

  getPlans: async (): Promise<PlatformPlan[]> => {
    const res = await api.get('/superadmin/plans');
    return res.data;
  },

  updatePlan: async (planId: string, data: Partial<PlatformPlan>) => {
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
