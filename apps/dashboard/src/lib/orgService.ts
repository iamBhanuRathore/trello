import { api } from './api';

export interface OrgMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  status: 'active' | 'invited' | 'deactivated';
  joinedAt: string;
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
  deactivationReason?: string | null;
  deactivatedBy?: string | null;
  invitedBy?: string | null;
}

export interface PendingInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface MemberActivitySummary {
  member: OrgMember;
  workspaces: Array<{
    workspaceId: string;
    name: string;
    role: string;
  }>;
  stats: {
    totalCardsAssigned: number;
    activeCardsCount: number;
    archivedCardsCount: number;
    timeLogged30dHours: number;
    billableTime30dHours: number;
  };
}

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
    params?: { search?: string; limit?: number; offset?: number; role?: string; status?: string }
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

  bulkInviteMembers: async (
    orgId: string,
    invites: Array<{ email: string; role?: string; name?: string; workspaceIds?: string[] }>
  ) => {
    const res = await api.post(`/orgs/${orgId}/members/bulk-invite`, { invites });
    return res.data;
  },

  getPendingInvitations: async (orgId: string): Promise<PendingInvitation[]> => {
    const res = await api.get(`/orgs/${orgId}/invitations`);
    return res.data;
  },

  resendInvitation: async (orgId: string, invitationId: string) => {
    const res = await api.post(`/orgs/${orgId}/invitations/${invitationId}/resend`);
    return res.data;
  },

  revokeInvitation: async (orgId: string, invitationId: string) => {
    const res = await api.delete(`/orgs/${orgId}/invitations/${invitationId}`);
    return res.data;
  },

  updateMemberRole: async (orgId: string, memberId: string, role: string) => {
    const res = await api.patch(`/orgs/${orgId}/members/${memberId}`, { role });
    return res.data;
  },

  deactivateMember: async (orgId: string, memberId: string, reason?: string) => {
    const res = await api.post(`/orgs/${orgId}/members/${memberId}/deactivate`, { reason });
    return res.data;
  },

  reactivateMember: async (orgId: string, memberId: string) => {
    const res = await api.post(`/orgs/${orgId}/members/${memberId}/reactivate`);
    return res.data;
  },

  forceLogoutUser: async (orgId: string, memberId: string) => {
    const res = await api.post(`/orgs/${orgId}/members/${memberId}/force-logout`);
    return res.data;
  },

  getMemberActivitySummary: async (orgId: string, memberId: string): Promise<MemberActivitySummary> => {
    const res = await api.get(`/orgs/${orgId}/members/${memberId}/summary`);
    return res.data;
  },

  removeMember: async (orgId: string, memberId: string) => {
    const res = await api.delete(`/orgs/${orgId}/members/${memberId}`);
    return res.data;
  },

  // Super Admin Cross-Org intelligence
  getPlatformUsers: async (): Promise<PlatformUser[]> => {
    const res = await api.get('/superadmin/users');
    return res.data;
  },

  getPlatformUser: async (userId: string) => {
    const res = await api.get(`/superadmin/users/${userId}`);
    return res.data;
  },

  forceLogoutPlatformUser: async (userId: string) => {
    const res = await api.post(`/superadmin/users/${userId}/force-logout`);
    return res.data;
  },
};
