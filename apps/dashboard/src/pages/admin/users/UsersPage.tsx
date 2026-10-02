import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/authStore';
import { orgService, type OrgMember } from '../../../lib/orgService';
import { api } from '../../../lib/api';
import { Button } from '@boardly/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { EnterpriseDataGrid } from '@boardly/ui/enterprise-data-grid';
import { UserPlus, Users as UsersIcon, UserCheck, UserX, Mail, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { getMemberColumns } from './columns/memberColumns';
import { getInvitationColumns } from './columns/invitationColumns';
import { InviteMemberDialog } from './components/InviteMemberDialog';
import { ChangeRoleDialog } from './components/ChangeRoleDialog';
import { DeactivateMemberDialog } from './components/DeactivateMemberDialog';
import { RemoveMemberDialog } from './components/RemoveMemberDialog';
import { MemberActivityDrawer } from './components/MemberActivityDrawer';

export const UsersPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  // Active Tab: 'members' | 'invitations'
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Dialog / Drawer States
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const [memberToDeactivate, setMemberToDeactivate] = useState<OrgMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<OrgMember | null>(null);
  const [drawerMemberId, setDrawerMemberId] = useState<string | null>(null);

  // Queries
  const {
    data: members = [],
    isLoading: isLoadingMembers,
    isError: isMembersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ['orgMembers', orgId],
    queryFn: () => orgService.getMembers(orgId!),
    enabled: !!orgId,
  });

  const {
    data: pendingInvitations = [],
    isLoading: isLoadingInvites,
    isError: isInvitesError,
    refetch: refetchInvites,
  } = useQuery({
    queryKey: ['orgInvitations', orgId],
    queryFn: () => orgService.getPendingInvitations(orgId!),
    enabled: !!orgId,
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces', orgId],
    queryFn: async () => (await api.get('/workspaces')).data,
    enabled: !!orgId,
  });

  // Action Mutations
  const reactivateMutation = useMutation({
    mutationFn: (memberId: string) => orgService.reactivateMember(orgId!, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      if (drawerMemberId) {
        queryClient.invalidateQueries({ queryKey: ['memberActivity', orgId, drawerMemberId] });
      }
      toast.success('Member reactivated successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to reactivate member');
    },
  });

  const forceLogoutMutation = useMutation({
    mutationFn: (memberId: string) => orgService.forceLogoutUser(orgId!, memberId),
    onSuccess: () => {
      toast.success('All active sessions for this member have been revoked');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to force logout user');
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (invitationId: string) => orgService.resendInvitation(orgId!, invitationId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgInvitations', orgId] });
      navigator.clipboard.writeText(`${window.location.origin}/invite?token=${data.token}`);
      toast.success('Invitation refreshed & new link copied to clipboard!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to resend invitation');
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (invitationId: string) => orgService.revokeInvitation(orgId!, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgInvitations', orgId] });
      toast.success('Invitation revoked successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to revoke invitation');
    },
  });

  // Metrics
  const totalMembers = members.length;
  const activeCount = members.filter((m) => m.status === 'active').length;
  const deactivatedCount = members.filter((m) => m.status === 'deactivated').length;
  const pendingCount = pendingInvitations.length;

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.name?.toLowerCase().includes(q);
        const matchEmail = m.email?.toLowerCase().includes(q);
        const matchRole = m.role?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchRole) return false;
      }
      return true;
    });
  }, [members, statusFilter, roleFilter, searchQuery]);

  // DataGrid Columns
  const memberColumns = useMemo(
    () =>
      getMemberColumns({
        currentUserId: user?.id,
        onSelectMember: (id) => setDrawerMemberId(id),
        onOpenChangeRole: (member) => setSelectedMember(member),
        onOpenDeactivate: (member) => setMemberToDeactivate(member),
        onReactivate: (id) => reactivateMutation.mutate(id),
        onForceLogout: (id) => forceLogoutMutation.mutate(id),
        onRemoveMember: (member) => setMemberToDelete(member),
      }),
    [user?.id, reactivateMutation, forceLogoutMutation]
  );

  const invitationColumns = useMemo(
    () =>
      getInvitationColumns({
        onResend: (id) => resendInviteMutation.mutate(id),
        onRevoke: (id) => revokeInviteMutation.mutate(id),
      }),
    [resendInviteMutation, revokeInviteMutation]
  );

  return (
    <div className="space-y-6">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>User Management & Access Governance</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
              Enterprise
            </span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Seamlessly onboard employees, govern workspace roles, track user activity, and manage
            deactivation.
          </p>
        </div>

        <Button
          onClick={() => setIsInviteOpen(true)}
          className="gap-2 shrink-0 cursor-pointer shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          <span>Onboard & Invite</span>
        </Button>
      </div>

      {/* ─── Metric Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border bg-card/60 backdrop-blur-md shadow-xs flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{totalMembers}</div>
            <div className="text-xs text-muted-foreground">Total Team Members</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border bg-card/60 backdrop-blur-md shadow-xs flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{activeCount}</div>
            <div className="text-xs text-muted-foreground">Active Accounts</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border bg-card/60 backdrop-blur-md shadow-xs flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive">
            <UserX className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{deactivatedCount}</div>
            <div className="text-xs text-muted-foreground">Deactivated (Soft-Deleted)</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border bg-card/60 backdrop-blur-md shadow-xs flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending Invitations</div>
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs & Filters ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <UsersIcon className="w-3.5 h-3.5" />
            <span>Organization Members ({members.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('invitations')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'invitations'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Pending Invitations ({pendingInvitations.length})</span>
          </button>
        </div>

        {/* Filters (When in members tab) */}
        {activeTab === 'members' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none w-48 sm:w-56"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="deactivated">Deactivated Only</SelectItem>
                <SelectItem value="invited">Invited Only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="org_owner">Org Owner</SelectItem>
                <SelectItem value="org_admin">Org Admin</SelectItem>
                <SelectItem value="workspace_admin">Workspace Admin</SelectItem>
                <SelectItem value="billing_manager">Billing Manager</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* ─── Main Content Views ─── */}
      {activeTab === 'members' ? (
        <EnterpriseDataGrid
          data={filteredMembers}
          columns={memberColumns}
          isLoading={isLoadingMembers}
          isError={isMembersError}
          errorMessage="Couldn't load members. Check your connection and try again."
          onRetry={() => refetchMembers()}
          searchable={false}
          exportable={true}
          exportFilename="boardly_members_export"
          pageSize={10}
        />
      ) : (
        <EnterpriseDataGrid
          data={pendingInvitations}
          columns={invitationColumns}
          isLoading={isLoadingInvites}
          isError={isInvitesError}
          errorMessage="Couldn't load invitations. Check your connection and try again."
          onRetry={() => refetchInvites()}
          searchable={true}
          exportable={true}
          exportFilename="boardly_pending_invitations"
          pageSize={10}
        />
      )}

      {/* ─── Modular Dialogs & Drawers ─── */}
      {orgId && (
        <>
          <InviteMemberDialog
            isOpen={isInviteOpen}
            onClose={() => setIsInviteOpen(false)}
            orgId={orgId}
            workspaces={workspaces}
          />

          <ChangeRoleDialog
            isOpen={!!selectedMember}
            onClose={() => setSelectedMember(null)}
            member={selectedMember}
            orgId={orgId}
          />

          <DeactivateMemberDialog
            isOpen={!!memberToDeactivate}
            onClose={() => setMemberToDeactivate(null)}
            member={memberToDeactivate}
            orgId={orgId}
            drawerMemberId={drawerMemberId}
          />

          <RemoveMemberDialog
            isOpen={!!memberToDelete}
            onClose={() => setMemberToDelete(null)}
            member={memberToDelete}
            orgId={orgId}
            onRemoved={() => {
              if (drawerMemberId === memberToDelete?.id) {
                setDrawerMemberId(null);
              }
            }}
          />

          <MemberActivityDrawer
            memberId={drawerMemberId}
            onClose={() => setDrawerMemberId(null)}
            orgId={orgId}
            onOpenChangeRole={(member) => setSelectedMember(member)}
            onOpenDeactivate={(member) => setMemberToDeactivate(member)}
            onReactivate={(id) => reactivateMutation.mutate(id)}
            onForceLogout={(id) => forceLogoutMutation.mutate(id)}
          />
        </>
      )}
    </div>
  );
};
