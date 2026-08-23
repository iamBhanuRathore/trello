import { api } from './api';

export interface OrgMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  joinedAt: string;
}

export const orgService = {
  getOrg: async (orgId: string) => {
    const res = await api.get(`/orgs/${orgId}`);
    return res.data;
  },

  updateOrg: async (
    orgId: string,
    data: { name?: string; logoUrl?: string | null; primaryColor?: string | null }
  ) => {
    const res = await api.patch(`/orgs/${orgId}`, data);
    return res.data;
  },

  getMembers: async (
    orgId: string,
    params?: { search?: string; limit?: number; offset?: number; role?: string }
  ): Promise<OrgMember[]> => {
    const res = await api.get(`/orgs/${orgId}/members`, { params });
    return res.data;
  },

  inviteMember: async (
    orgId: string,
    data: { email: string; role: string; name?: string; workspaceIds?: string[] }
  ) => {
    const res = await api.post(`/orgs/${orgId}/members/invite`, data);
    return res.data;
  },

  updateMemberRole: async (orgId: string, memberId: string, role: string) => {
    const res = await api.patch(`/orgs/${orgId}/members/${memberId}`, { role });
    return res.data;
  },

  removeMember: async (orgId: string, memberId: string) => {
    const res = await api.delete(`/orgs/${orgId}/members/${memberId}`);
    return res.data;
  },
};
