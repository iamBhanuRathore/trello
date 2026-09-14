import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { orgService, type OrgMember, type PendingInvitation } from '../../lib/orgService';
import { api } from '../../lib/api';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@boardly/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@boardly/ui/avatar';
import { EnterpriseDataGrid, type ColumnDef } from '@boardly/ui/enterprise-data-grid';
import { QueryError } from '../../components/common/QueryError';
import {
  UserPlus,
  MoreHorizontal,
  Trash2,
  ShieldCheck,
  Shield,
  Eye,
  Check,
  Copy,
  Users as UsersIcon,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserX,
  Clock,
  LogOut,
  Send,
  RefreshCw,
  Search,
  X,
  FileSpreadsheet,
  Briefcase,
  Timer,
  CheckSquare,
  Lock,
  Unlock,
  Mail,
  Activity,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@boardly/ui/dropdown-menu';
import { toast } from 'sonner';

const ROLE_DESCRIPTIONS: Record<string, { title: string; description: string; icon: any }> = {
  org_owner: {
    title: 'Org Owner',
    description: 'Full root organization control, billing, audit logs, and member management.',
    icon: ShieldCheck,
  },
  org_admin: {
    title: 'Org Admin',
    description: 'Full organization management, member invitations, and security policies.',
    icon: ShieldCheck,
  },
  member: {
    title: 'Member',
    description: 'Standard collaborator. Can create and edit workspaces, boards, and tasks.',
    icon: Shield,
  },
  viewer: {
    title: 'Viewer',
    description: 'Read-only access. Can view projects, boards, and tasks without editing.',
    icon: Eye,
  },
};

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Never';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 2) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Never';
  }
}

export const Users: React.FC = () => {
  const { user } = useAuthStore();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  // Active Tab: 'members' | 'invitations'
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Invite Modal State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteModalTab, setInviteModalTab] = useState<'single' | 'bulk'>('single');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState('member');
  const [invitedSuccessData, setInvitedSuccessData] = useState<{
    inviteToken?: string;
    count?: number;
  } | null>(null);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);

  // Dialog States
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const [newRole, setNewRole] = useState('member');
  const [isChangeRoleOpen, setIsChangeRoleOpen] = useState(false);

  // Deactivate Modal State
  const [memberToDeactivate, setMemberToDeactivate] = useState<OrgMember | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);

  // Remove Modal State
  const [memberToDelete, setMemberToDelete] = useState<OrgMember | null>(null);

  // Activity Drawer State
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

  const {
    data: activitySummary,
    isLoading: isLoadingSummary,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['memberActivity', orgId, drawerMemberId],
    queryFn: () => orgService.getMemberActivitySummary(orgId!, drawerMemberId!),
    enabled: !!orgId && !!drawerMemberId,
  });

  const navigate = useNavigate();

  // Mutations
  const singleInviteMutation = useMutation({
    mutationFn: () =>
      orgService.inviteMember(orgId!, {
        email: inviteEmail.trim(),
        role: inviteRole,
        name: inviteName.trim() || undefined,
        workspaceIds: selectedWorkspaceIds.length > 0 ? selectedWorkspaceIds : undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      queryClient.invalidateQueries({ queryKey: ['orgInvitations', orgId] });
      setInvitedSuccessData({ inviteToken: data.inviteToken, count: 1 });
      toast.success(`Invitation generated for ${inviteEmail.trim()}`);
    },
    onError: (err: any) => {
      const isBillingError =
        err.response?.status === 402 || err.response?.data?.code === 'PLAN_UPGRADE_REQUIRED';
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to invite user';
      if (isBillingError) {
        toast.error(msg, {
          action: {
            label: 'Manage Seats',
            onClick: () => navigate('/admin/billing'),
          },
          duration: 8000,
        });
      } else {
        toast.error(msg);
      }
    },
  });

  const bulkInviteMutation = useMutation({
    mutationFn: (invites: Array<{ email: string; name?: string; role?: string }>) =>
      orgService.bulkInviteMembers(orgId!, invites),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      queryClient.invalidateQueries({ queryKey: ['orgInvitations', orgId] });
      setInvitedSuccessData({ count: data.successfulCount });
      toast.success(
        `Successfully onboarded ${data.successfulCount} members (${data.failedCount} failed)`
      );
    },
    onError: (err: any) => {
      const isBillingError =
        err.response?.status === 402 || err.response?.data?.code === 'PLAN_UPGRADE_REQUIRED';
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Bulk invite failed';
      if (isBillingError) {
        toast.error(msg, {
          action: {
            label: 'Manage Seats',
            onClick: () => navigate('/admin/billing'),
          },
          duration: 8000,
        });
      } else {
        toast.error(msg);
      }
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      orgService.updateMemberRole(orgId!, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      setIsChangeRoleOpen(false);
      setSelectedMember(null);
      toast.success('Member role updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update role');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason?: string }) =>
      orgService.deactivateMember(orgId!, memberId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      if (drawerMemberId)
        queryClient.invalidateQueries({ queryKey: ['memberActivity', orgId, drawerMemberId] });
      setIsDeactivateOpen(false);
      setMemberToDeactivate(null);
      setDeactivationReason('');
      toast.success('Member deactivated (soft-delete applied, access revoked)');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to deactivate member');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (memberId: string) => orgService.reactivateMember(orgId!, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      if (drawerMemberId)
        queryClient.invalidateQueries({ queryKey: ['memberActivity', orgId, drawerMemberId] });
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

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => orgService.removeMember(orgId!, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      setMemberToDelete(null);
      if (drawerMemberId) setDrawerMemberId(null);
      toast.success('Member removed from organization');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to remove member');
    },
  });

  // Handle Bulk Invite Submit
  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;

    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsedInvites: Array<{ email: string; name?: string; role?: string }> = [];

    for (const line of lines) {
      if (line.includes(',')) {
        const parts = line.split(',').map((p) => p.trim());
        const email = parts[0]!;
        const name = parts[1] || undefined;
        const role = parts[2] || bulkRole;
        if (email.includes('@')) {
          parsedInvites.push({ email, name, role });
        }
      } else {
        if (line.includes('@')) {
          parsedInvites.push({ email: line, role: bulkRole });
        }
      }
    }

    if (parsedInvites.length === 0) {
      toast.error('No valid email addresses detected. Please check formatting.');
      return;
    }

    bulkInviteMutation.mutate(parsedInvites);
  };

  const handleResetInvite = () => {
    setIsInviteOpen(false);
    setInvitedSuccessData(null);
    setInviteName('');
    setInviteEmail('');
    setInviteRole('member');
    setSelectedWorkspaceIds([]);
    setBulkText('');
    setCopiedInviteLink(false);
  };

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

  // DataGrid Columns for Members
  const memberColumns: ColumnDef<OrgMember>[] = useMemo(
    () => [
      {
        id: 'user',
        header: 'User & Profile',
        sortable: true,
        accessorFn: (row) => row.name,
        cell: ({ row }) => (
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setDrawerMemberId(row.id)}
          >
            <Avatar className="h-9 w-9 ring-1 ring-border group-hover:ring-primary transition-all">
              <AvatarImage src={row.avatarUrl || ''} />
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                {row.name ? row.name.substring(0, 2).toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold text-xs text-foreground flex items-center gap-2 group-hover:text-primary transition-colors">
                <span>{row.name}</span>
                {row.userId === user?.id && (
                  <span className="text-[10px] font-bold text-primary px-1.5 py-0.2 rounded-full bg-primary/10 border border-primary/20">
                    You
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">{row.email}</div>
            </div>
          </div>
        ),
        exportValue: (row) => `${row.name} (${row.email})`,
      },
      {
        id: 'role',
        header: 'Organization Role',
        sortable: true,
        filterable: true,
        accessorFn: (row) => row.role,
        cell: ({ row }) => {
          const roleConfig = ROLE_DESCRIPTIONS[row.role] || {
            title: row.role ? row.role.replace('_', ' ') : 'Member',
            icon: Shield,
          };
          const RoleIcon = roleConfig.icon;
          return (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                row.role === 'org_owner'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                  : row.role === 'org_admin'
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25'
                    : row.role === 'viewer'
                      ? 'bg-muted text-muted-foreground border-border'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
              }`}
            >
              <RoleIcon className="w-3 h-3" />
              <span>{roleConfig.title}</span>
            </span>
          );
        },
        exportValue: (row) => row.role,
      },
      {
        id: 'status',
        header: 'Account Status',
        sortable: true,
        filterable: true,
        accessorFn: (row) => row.status,
        cell: ({ row }) => {
          if (row.status === 'deactivated') {
            return (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                <Lock className="w-3 h-3" />
                <span>Deactivated</span>
              </span>
            );
          }
          if (row.status === 'invited') {
            return (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Mail className="w-3 h-3" />
                <span>Invited</span>
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              <span>Active</span>
            </span>
          );
        },
        exportValue: (row) => row.status,
      },
      {
        id: 'lastSeen',
        header: 'Last Active',
        sortable: true,
        accessorFn: (row) => row.lastActiveAt || row.lastLoginAt,
        cell: ({ row }) => (
          <div className="flex flex-col text-xs">
            <span className="text-foreground font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              {formatRelativeTime(row.lastActiveAt || row.lastLoginAt)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Joined {formatRelativeTime(row.joinedAt)}
            </span>
          </div>
        ),
        exportValue: (row) => formatRelativeTime(row.lastActiveAt || row.lastLoginAt),
      },
      {
        id: 'actions',
        header: 'Actions',
        align: 'right',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-primary gap-1 cursor-pointer hidden sm:flex"
              onClick={() => setDrawerMemberId(row.id)}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Activity</span>
            </Button>
            <DropdownMenu>
              {/* @ts-ignore */}
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  className="cursor-pointer text-xs gap-2"
                  onClick={() => setDrawerMemberId(row.id)}
                >
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" /> View Member Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-xs gap-2"
                  onClick={() => {
                    setSelectedMember(row);
                    setNewRole(row.role);
                    setIsChangeRoleOpen(true);
                  }}
                >
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" /> Change Role
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {row.status === 'deactivated' ? (
                  <DropdownMenuItem
                    className="cursor-pointer text-xs gap-2 text-emerald-600 dark:text-emerald-400 focus:bg-emerald-500/10"
                    onClick={() => reactivateMutation.mutate(row.id)}
                  >
                    <Unlock className="w-3.5 h-3.5" /> Reactivate Account
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="cursor-pointer text-xs gap-2 text-amber-600 dark:text-amber-400 focus:bg-amber-500/10"
                    onClick={() => {
                      setMemberToDeactivate(row);
                      setIsDeactivateOpen(true);
                    }}
                  >
                    <UserX className="w-3.5 h-3.5" /> Deactivate Account (Soft)
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  className="cursor-pointer text-xs gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => forceLogoutMutation.mutate(row.id)}
                >
                  <LogOut className="w-3.5 h-3.5" /> Terminate Sessions
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer text-xs gap-2"
                  onClick={() => setMemberToDelete(row)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [user?.id]
  );

  // DataGrid Columns for Pending Invitations
  const invitationColumns: ColumnDef<PendingInvitation>[] = useMemo(
    () => [
      {
        id: 'email',
        header: 'Invited Email',
        sortable: true,
        accessorFn: (row) => row.email,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground">{row.email}</div>
              <div className="text-[10px] text-muted-foreground">
                Sent {formatRelativeTime(row.createdAt)}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'role',
        header: 'Target Role',
        sortable: true,
        accessorFn: (row) => row.role,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            <Shield className="w-3 h-3" />
            <span>{row.role ? row.role.replace('_', ' ') : 'Member'}</span>
          </span>
        ),
      },
      {
        id: 'expires',
        header: 'Expires In',
        sortable: true,
        accessorFn: (row) => row.expiresAt,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            {formatRelativeTime(row.expiresAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        align: 'right',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 cursor-pointer hover:border-primary"
              onClick={() => {
                const link = `${window.location.origin}/invite?token=${row.token}`;
                navigator.clipboard.writeText(link);
                toast.success('Invite link copied to clipboard!');
              }}
            >
              <Copy className="w-3 h-3" />
              <span>Copy Link</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 cursor-pointer hover:text-primary"
              onClick={() => resendInviteMutation.mutate(row.id)}
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
              onClick={() => revokeInviteMutation.mutate(row.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
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

        <Dialog
          open={isInviteOpen}
          onOpenChange={(open) => {
            if (!open) handleResetInvite();
            else setIsInviteOpen(true);
          }}
        >
          {/* @ts-ignore */}
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0 cursor-pointer shadow-sm">
              <UserPlus className="w-4 h-4" />
              <span>Onboard & Invite</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg p-0 overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
            <DialogHeader className="p-5 border-b border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Onboard New Team Members
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Provision member accounts, assign roles, and configure workspace access.
                  </p>
                </div>
              </div>

              {/* Mode Tabs */}
              {!invitedSuccessData && (
                <div className="flex items-center gap-2 mt-4 bg-muted/50 p-1 rounded-lg border border-border/50">
                  <button
                    type="button"
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      inviteModalTab === 'single'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setInviteModalTab('single')}
                  >
                    Single Member Invite
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      inviteModalTab === 'bulk'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setInviteModalTab('bulk')}
                  >
                    Bulk Onboarding (CSV / Multi)
                  </button>
                </div>
              )}
            </DialogHeader>

            {!invitedSuccessData ? (
              inviteModalTab === 'single' ? (
                /* ── Single Invite Form ── */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!inviteEmail) return;
                    singleInviteMutation.mutate();
                  }}
                  className="p-5 space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Full Name</Label>
                    <Input
                      placeholder="e.g. Elena Rostova"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="bg-background text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Email Address *</Label>
                    <Input
                      required
                      type="email"
                      placeholder="name@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="bg-background text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Organization Role</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {['org_admin', 'member', 'viewer'].map((r) => {
                        const isSelected = inviteRole === r;
                        const config = ROLE_DESCRIPTIONS[r] || { title: r, icon: Shield };
                        const Icon = config.icon;
                        return (
                          <div
                            key={r}
                            onClick={() => setInviteRole(r)}
                            className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                              isSelected
                                ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
                                : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                            }`}
                          >
                            <Icon className="w-4 h-4 mx-auto mb-1" />
                            <div className="font-semibold text-xs text-foreground">
                              {config.title}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {workspaces.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Assign Initial Workspaces</Label>
                      <div className="max-h-32 overflow-y-auto space-y-1.5 p-2 rounded-xl border bg-muted/20">
                        {workspaces.map((ws: any) => {
                          const isChecked = selectedWorkspaceIds.includes(ws.id);
                          return (
                            <label
                              key={ws.id}
                              className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:bg-background/80 p-1.5 rounded-lg transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedWorkspaceIds([...selectedWorkspaceIds, ws.id]);
                                  } else {
                                    setSelectedWorkspaceIds(
                                      selectedWorkspaceIds.filter((id) => id !== ws.id)
                                    );
                                  }
                                }}
                                className="rounded border-border text-primary focus:ring-primary"
                              />
                              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="font-medium truncate">{ws.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t border-border">
                    <Button variant="outline" type="button" onClick={handleResetInvite} size="sm">
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={singleInviteMutation.isPending}
                      className="gap-2"
                    >
                      {singleInviteMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Send Onboarding Invite</span>
                    </Button>
                  </div>
                </form>
              ) : (
                /* ── Bulk Invite Form ── */
                <form onSubmit={handleBulkSubmit} className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Paste Emails or CSV List</Label>
                      <span className="text-[11px] text-muted-foreground">
                        Format: email, name, role
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder={`alex@acme.corp, Alex Vance, org_admin\nelena@acme.corp, Elena Rostova, member\nmarcus@acme.corp, Marcus Brody, member`}
                      className="w-full text-xs font-mono p-3 rounded-xl border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                    <div className="text-xs">
                      <span className="font-semibold text-foreground">Default Fallback Role:</span>
                      <span className="text-muted-foreground ml-1">Applies if role is omitted</span>
                    </div>
                    <select
                      value={bulkRole}
                      onChange={(e) => setBulkRole(e.target.value)}
                      className="text-xs p-1.5 rounded-lg border bg-background text-foreground"
                    >
                      <option value="member">Member</option>
                      <option value="org_admin">Org Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-border">
                    <Button variant="outline" type="button" onClick={handleResetInvite} size="sm">
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={bulkInviteMutation.isPending}
                      className="gap-2"
                    >
                      {bulkInviteMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      )}
                      <span>Process Bulk Onboarding</span>
                    </Button>
                  </div>
                </form>
              )
            ) : (
              /* ── Success State ── */
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {invitedSuccessData.count && invitedSuccessData.count > 1
                      ? `${invitedSuccessData.count} Invitations Sent`
                      : 'Invitation Email Sent ✉️'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                    {invitedSuccessData.count && invitedSuccessData.count > 1
                      ? `${invitedSuccessData.count} personalized invitation emails have been sent. Members will set up their accounts through a secure onboarding link.`
                      : "A personalized invitation email has been sent. They'll receive a secure link to set up their account and join your organization."}
                  </p>
                </div>

                {/* Email sent badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 font-medium">
                  <Mail className="w-3.5 h-3.5" />
                  Invitation email dispatched
                </div>

                {invitedSuccessData.inviteToken && (
                  <details className="text-left mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                      Show backup invite link
                    </summary>
                    <div className="flex items-center gap-2 p-2 rounded-xl border bg-muted/40 mt-2">
                      <input
                        readOnly
                        value={`${window.location.origin}/invite?token=${invitedSuccessData.inviteToken}`}
                        className="text-xs bg-transparent border-none focus:outline-none flex-1 text-muted-foreground font-mono truncate"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs gap-1 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/invite?token=${invitedSuccessData!.inviteToken}`
                          );
                          setCopiedInviteLink(true);
                          toast.success('Link copied to clipboard!');
                        }}
                      >
                        {copiedInviteLink ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedInviteLink ? 'Copied' : 'Copy'}</span>
                      </Button>
                    </div>
                  </details>
                )}

                <div className="pt-2">
                  <Button onClick={handleResetInvite} size="sm" className="w-full max-w-xs mx-auto">
                    Done
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
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
            {/* Search Input */}
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

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs py-1 px-2.5 rounded-lg border bg-background text-foreground focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="deactivated">Deactivated Only</option>
              <option value="invited">Invited Only</option>
            </select>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs py-1 px-2.5 rounded-lg border bg-background text-foreground focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="org_owner">Org Owner</option>
              <option value="org_admin">Org Admin</option>
              <option value="workspace_admin">Workspace Admin</option>
              <option value="billing_manager">Billing Manager</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
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

      {/* ─── Member Activity / Governance Drawer ─── */}
      {drawerMemberId && (
        <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border-l border-border h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div>
              {/* Drawer Header */}
              <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm text-foreground">
                    Member Intelligence & Governance
                  </span>
                </div>
                <button
                  onClick={() => setDrawerMemberId(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isLoadingSummary ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs">Loading member summary...</span>
                </div>
              ) : isSummaryError && !activitySummary ? (
                <div className="p-5">
                  <QueryError
                    message="Couldn't load this member's summary."
                    onRetry={() => refetchSummary()}
                  />
                </div>
              ) : activitySummary ? (
                <div className="p-5 space-y-6">
                  {/* Profile Header */}
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                      <AvatarImage src={activitySummary.member.avatarUrl || ''} />
                      <AvatarFallback className="text-base font-bold bg-primary/10 text-primary">
                        {activitySummary.member.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-base text-foreground">
                        {activitySummary.member.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {activitySummary.member.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 capitalize">
                          {activitySummary.member.role.replace('_', ' ')}
                        </span>
                        {activitySummary.member.status === 'deactivated' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Deactivated
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Deactivation Reason if present */}
                  {activitySummary.member.status === 'deactivated' &&
                    activitySummary.member.deactivationReason && (
                      <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Deactivation Note:</span>{' '}
                          <span>{activitySummary.member.deactivationReason}</span>
                        </div>
                      </div>
                    )}

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border bg-muted/20">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5 text-primary" />
                        <span>Active Tasks</span>
                      </div>
                      <div className="text-xl font-bold text-foreground mt-1">
                        {activitySummary.stats.activeCardsCount}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border bg-muted/20">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Timer className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Logged Time (30d)</span>
                      </div>
                      <div className="text-xl font-bold text-foreground mt-1">
                        {activitySummary.stats.timeLogged30dHours} hrs
                      </div>
                    </div>
                  </div>

                  {/* Workspace Memberships */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Workspace Assignments ({activitySummary.workspaces.length})</span>
                    </h4>
                    {activitySummary.workspaces.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No workspace memberships found.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {activitySummary.workspaces.map((ws) => (
                          <div
                            key={ws.workspaceId}
                            className="flex items-center justify-between p-2 rounded-lg border bg-background text-xs"
                          >
                            <span className="font-medium text-foreground">{ws.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground capitalize font-semibold">
                              {ws.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Activity Timestamps */}
                  <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Joined Organization:</span>
                      <span className="font-medium text-foreground">
                        {formatRelativeTime(activitySummary.member.joinedAt)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Platform Login:</span>
                      <span className="font-medium text-foreground">
                        {formatRelativeTime(activitySummary.member.lastLoginAt)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Organization Activity:</span>
                      <span className="font-medium text-foreground">
                        {formatRelativeTime(activitySummary.member.lastActiveAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Drawer Footer Actions */}
            {activitySummary && (
              <div className="p-4 border-t border-border bg-muted/20 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => {
                      setSelectedMember(activitySummary.member);
                      setNewRole(activitySummary.member.role);
                      setIsChangeRoleOpen(true);
                    }}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Change Role</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => forceLogoutMutation.mutate(activitySummary.member.id)}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Force Logout</span>
                  </Button>
                </div>

                {activitySummary.member.status === 'deactivated' ? (
                  <Button
                    size="sm"
                    className="w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => reactivateMutation.mutate(activitySummary.member.id)}
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Reactivate Account</span>
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full text-xs gap-1.5"
                    onClick={() => {
                      setMemberToDeactivate(activitySummary.member);
                      setIsDeactivateOpen(true);
                    }}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Deactivate Member (Soft Delete)</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Change Role Dialog ─── */}
      <Dialog open={isChangeRoleOpen} onOpenChange={setIsChangeRoleOpen}>
        <DialogContent className="sm:max-w-md p-5 bg-card border border-border rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              Modify Organization Role
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select new security privilege level for{' '}
              <span className="font-semibold text-foreground">{selectedMember?.name}</span>.
            </p>
          </DialogHeader>

          <div className="space-y-3 my-3">
            {['org_owner', 'org_admin', 'member', 'viewer'].map((r) => {
              const isSelected = newRole === r;
              const config = ROLE_DESCRIPTIONS[r] || { title: r, description: '', icon: Shield };
              const Icon = config.icon;
              return (
                <div
                  key={r}
                  onClick={() => setNewRole(r)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary/20'
                      : 'border-border bg-background hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${isSelected ? 'bg-primary/10 text-primary' : 'bg-muted'}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-foreground">{config.title}</div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed">
                      {config.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsChangeRoleOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={updateRoleMutation.isPending}
              onClick={() => {
                if (!selectedMember) return;
                updateRoleMutation.mutate({ memberId: selectedMember.id, role: newRole });
              }}
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Deactivate Member Dialog (Soft Delete) ─── */}
      <Dialog open={isDeactivateOpen} onOpenChange={setIsDeactivateOpen}>
        <DialogContent className="sm:max-w-md p-5 bg-card border border-border rounded-2xl shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <DialogTitle className="text-base font-bold text-foreground">
                Deactivate Member Account
              </DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Deactivating{' '}
              <span className="font-semibold text-foreground">{memberToDeactivate?.name}</span> will
              immediately revoke their access and terminate all active sessions. Their historical
              data (tasks, time logs, comments) will be preserved intact.
            </p>
          </DialogHeader>

          <div className="space-y-2 my-2">
            <Label className="text-xs font-semibold">Reason for Deactivation (Optional)</Label>
            <Input
              placeholder="e.g. Contract ended / Offboarding"
              value={deactivationReason}
              onChange={(e) => setDeactivationReason(e.target.value)}
              className="text-xs bg-background"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsDeactivateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deactivateMutation.isPending}
              onClick={() => {
                if (!memberToDeactivate) return;
                deactivateMutation.mutate({
                  memberId: memberToDeactivate.id,
                  reason: deactivationReason,
                });
              }}
            >
              Confirm Deactivation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Remove Member Confirmation Dialog ─── */}
      <Dialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <DialogContent className="sm:max-w-md p-5 bg-card border border-border rounded-2xl shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <DialogTitle className="text-base font-bold text-foreground">
                Remove Member from Organization
              </DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Are you sure you want to remove{' '}
              <span className="font-semibold text-foreground">{memberToDelete?.name}</span>? This
              will revoke their organization membership.
            </p>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setMemberToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={removeMemberMutation.isPending}
              onClick={() => {
                if (!memberToDelete) return;
                removeMemberMutation.mutate(memberToDelete.id);
              }}
            >
              Remove Member
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
