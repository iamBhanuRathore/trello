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
    params?: {
      search?: string;
      limit?: number;
      offset?: number;
      role?: string;
      status?: string;
      userIds?: string[];
    }
  ): Promise<OrgMember[]> => {
    const { members } = await orgService.getMembersWithCount(orgId, params);
    return members;
  },

  getMembersWithCount: async (
    orgId: string,
    params?: {
      search?: string;
      limit?: number;
      offset?: number;
      role?: string;
      status?: string;
      userIds?: string[];
    }
  ): Promise<{ members: OrgMember[]; total: number }> => {
    const queryParams: Record<string, any> = {};
    if (params?.search) queryParams.search = params.search;
    if (params?.limit !== undefined) queryParams.limit = params.limit;
    if (params?.offset !== undefined) queryParams.offset = params.offset;
    if (params?.role) queryParams.role = params.role;
    if (params?.status) queryParams.status = params.status;
    if (params?.userIds && params.userIds.length > 0) {
      queryParams.userIds = params.userIds.join(',');
    }
    const res = await api.get(`/orgs/${orgId}/members`, { params: queryParams });
    const headerVal = res.headers?.['x-total-count'] || res.headers?.['X-Total-Count'];
    const total = headerVal !== undefined ? parseInt(headerVal, 10) : res.data.length;
    return {
      members: res.data,
      total: isNaN(total) ? res.data.length : total,
    };
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

  getMemberActivitySummary: async (
    orgId: string,
    memberId: string
  ): Promise<MemberActivitySummary> => {
    const res = await api.get(`/orgs/${orgId}/members/${memberId}/summary`);
    return res.data;
  },

  removeMember: async (orgId: string, memberId: string) => {
    const res = await api.delete(`/orgs/${orgId}/members/${memberId}`);
    return res.data;
  },
};
