import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { orgService } from '../../lib/orgService';
import { api } from '../../lib/api';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@boardly/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@boardly/ui/avatar';
import {
  UserPlus,
  MoreHorizontal,
  Trash,
  Search,
  ShieldCheck,
  Shield,
  Eye,
  Check,
  Copy,
  Users as UsersIcon,
  Building2,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@boardly/ui/dropdown-menu';

const ROLE_DESCRIPTIONS: Record<string, { title: string; description: string; icon: any }> = {
  org_admin: {
    title: 'Org Admin',
    description: 'Full organization management, member invitations, and billing controls.',
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

export const Users = () => {
  const { user } = useAuthStore();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  // Invite Form State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [invitedSuccess, setInvitedSuccess] = useState<boolean>(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Change Role & Delete Dialog State
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [newRole, setNewRole] = useState('member');
  const [isChangeRoleOpen, setIsChangeRoleOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<any>(null);

  // Queries
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['orgMembers', orgId],
    queryFn: () => orgService.getMembers(orgId!),
    enabled: !!orgId,
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces', orgId],
    queryFn: async () => (await api.get('/workspaces')).data,
    enabled: !!orgId,
  });

  // Mutations
  const inviteMutation = useMutation({
    mutationFn: () =>
      orgService.inviteMember(orgId!, {
        email: inviteEmail.trim(),
        role: inviteRole,
        name: inviteName.trim() || undefined,
        workspaceIds: selectedWorkspaceIds.length > 0 ? selectedWorkspaceIds : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      setInvitedSuccess(true);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      orgService.updateMemberRole(orgId!, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      setIsChangeRoleOpen(false);
      setSelectedMember(null);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => orgService.removeMember(orgId!, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      setMemberToDelete(null);
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    inviteMutation.mutate();
  };

  const handleResetInvite = () => {
    setIsInviteOpen(false);
    setInvitedSuccess(false);
    setInviteName('');
    setInviteEmail('');
    setInviteRole('member');
    setSelectedWorkspaceIds([]);
    setCopiedInviteLink(false);
  };

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || m.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [members, searchQuery, roleFilter, statusFilter]);

  // Metric counts
  const totalCount = members.length;
  const adminCount = members.filter((m) => m.role === 'org_admin' || m.role === 'org_owner').length;
  const activeCount = members.filter((m) => m.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Organization Users</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Manage team members, roles, workspace assignments, and access permissions.
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
            <Button className="gap-2 bg-primary text-primary-foreground font-semibold shadow-xs">
              <UserPlus className="h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
            {!invitedSuccess ? (
              <>
                <div className="p-5 border-b border-border bg-muted/20">
                  <DialogTitle className="text-base font-bold text-foreground">
                    Invite a new user
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Send an invitation to join your company organization.
                  </p>
                </div>

                <form onSubmit={handleInviteSubmit} className="p-5 space-y-4">
                  {/* Full Name */}
                  <div>
                    <Label htmlFor="invite-name" className="text-xs font-semibold mb-1.5 block">
                      Full Name <span className="text-muted-foreground font-normal">(Optional)</span>
                    </Label>
                    <Input
                      id="invite-name"
                      placeholder="e.g. Sarah Jenkins"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <Label htmlFor="invite-email" className="text-xs font-semibold mb-1.5 block">
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="sarah@acme.corp"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Role Selector with Descriptions */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold block">Organization Role</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {Object.entries(ROLE_DESCRIPTIONS).map(([key, info]) => {
                        const Icon = info.icon;
                        const isSelected = inviteRole === key;
                        return (
                          <div
                            key={key}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                              isSelected
                                ? 'bg-primary/10 border-primary shadow-2xs ring-1 ring-primary'
                                : 'bg-card border-border hover:bg-muted/40'
                            }`}
                            onClick={() => setInviteRole(key)}
                          >
                            <div
                              className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-foreground">
                                {info.title}
                              </div>
                              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                                {info.description}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Initial Workspace Access */}
                  {workspaces.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs font-semibold block">
                        Initial Workspace Assignment
                      </Label>
                      <div className="max-h-32 overflow-y-auto p-2 rounded-xl bg-muted/20 border border-border space-y-1.5">
                        {workspaces.map((ws: any) => {
                          const isChecked = selectedWorkspaceIds.includes(ws.id);
                          return (
                            <label
                              key={ws.id}
                              className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/40 p-1.5 rounded-lg transition-colors"
                            >
                              <input
                                type="checkbox"
                                className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
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
                              />
                              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="truncate">{ws.name}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto uppercase font-mono">
                                {ws.visibility}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      className="w-full h-9 text-xs font-semibold"
                      disabled={inviteMutation.isPending || !inviteEmail.trim()}
                    >
                      {inviteMutation.isPending ? 'Sending Invite...' : 'Send Organization Invite'}
                    </Button>
                    {inviteMutation.isError && (
                      <p className="text-xs text-destructive mt-2 text-center">
                        {(inviteMutation.error as any).response?.data?.error ||
                          'Failed to invite user.'}
                      </p>
                    )}
                  </div>
                </form>
              </>
            ) : (
              /* Success State */
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">User Successfully Invited!</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong className="text-foreground">{inviteEmail}</strong> has been provisioned
                    as <strong className="text-foreground">{inviteRole}</strong>.
                  </p>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl border border-border text-left space-y-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Direct Invitation / Access Link
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={`${window.location.origin}/login`}
                      className="bg-background text-xs font-mono px-2.5 py-1.5 rounded-lg border border-input flex-1 text-muted-foreground outline-none"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/login`);
                        setCopiedInviteLink(true);
                        setTimeout(() => setCopiedInviteLink(false), 2000);
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
                </div>

                <div className="pt-2">
                  <Button type="button" className="w-full h-9 text-xs" onClick={handleResetInvite}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* ─── Metric Statistics Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total Members</span>
            <UsersIcon className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">{totalCount}</div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Admins / Owners</span>
            <ShieldCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">{adminCount}</div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Active Status</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">{activeCount}</div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Workspaces</span>
            <Building2 className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">{workspaces.length}</div>
        </div>
      </div>

      {/* ─── Search & Filtering Controls ─── */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search team members by name or email..."
            className="pl-9 h-9 text-xs bg-card"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Role Filter */}
          <select
            className="h-9 px-3 text-xs rounded-lg border border-input bg-card text-foreground outline-none font-medium"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="org_owner">Org Owner</option>
            <option value="org_admin">Org Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>

          {/* Status Filter */}
          <select
            className="h-9 px-3 text-xs rounded-lg border border-input bg-card text-foreground outline-none font-medium"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
          </select>
        </div>
      </div>

      {/* ─── Members Table ─── */}
      <div className="border border-border/80 rounded-2xl bg-card text-card-foreground shadow-xs overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
            <tr>
              <th className="px-6 py-3.5 font-semibold">User</th>
              <th className="px-6 py-3.5 font-semibold">Role</th>
              <th className="px-6 py-3.5 font-semibold">Status</th>
              <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground text-xs">
                  Loading users...
                </td>
              </tr>
            ) : filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground text-xs">
                  No matching users found.
                </td>
              </tr>
            ) : (
              filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 ring-1 ring-border">
                        <AvatarImage src={member.avatarUrl || ''} />
                        <AvatarFallback className="text-xs font-bold bg-primary/15 text-primary">
                          {member.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold text-xs text-foreground flex items-center gap-2">
                          <span>{member.name}</span>
                          {member.userId === user?.id && (
                            <span className="text-[10px] font-bold text-primary px-1.5 py-0.2 rounded-full bg-primary/10 border border-primary/20">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        member.role === 'org_owner'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                          : member.role === 'org_admin'
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25'
                          : member.role === 'viewer'
                          ? 'bg-muted text-muted-foreground border-border'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                      }`}
                    >
                      {member.role === 'org_owner' && <ShieldCheck className="w-3 h-3" />}
                      {member.role === 'org_admin' && <ShieldCheck className="w-3 h-3" />}
                      {member.role === 'member' && <Shield className="w-3 h-3" />}
                      {member.role === 'viewer' && <Eye className="w-3 h-3" />}
                      <span>{member.role.replace('_', ' ')}</span>
                    </span>
                  </td>

                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        member.status === 'active'
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {member.status}
                    </span>
                  </td>

                  <td className="px-6 py-3.5 text-right">
                    <DropdownMenu>
                      {/* @ts-ignore */}
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          className="cursor-pointer text-xs gap-2"
                          onClick={() => {
                            setSelectedMember(member);
                            setNewRole(member.role);
                            setIsChangeRoleOpen(true);
                          }}
                        >
                          <Shield className="w-3.5 h-3.5 text-muted-foreground" /> Change Role
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer text-xs gap-2"
                          onClick={() => setMemberToDelete(member)}
                        >
                          <Trash className="w-3.5 h-3.5" /> Remove User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Change Role Modal ─── */}
      {isChangeRoleOpen && selectedMember && (
        <Dialog open={isChangeRoleOpen} onOpenChange={setIsChangeRoleOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change User Role</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 text-xs">
              <p className="text-muted-foreground">
                Select a new role for <strong className="text-foreground">{selectedMember.name}</strong> ({selectedMember.email}):
              </p>

              <div className="space-y-2">
                {Object.entries(ROLE_DESCRIPTIONS).map(([key, info]) => (
                  <label
                    key={key}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      newRole === key
                        ? 'bg-primary/10 border-primary ring-1 ring-primary'
                        : 'bg-card border-border hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="userRole"
                      value={key}
                      checked={newRole === key}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="mt-0.5 text-primary focus:ring-primary cursor-pointer"
                    />
                    <div>
                      <div className="font-semibold text-foreground">{info.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {info.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setIsChangeRoleOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateRoleMutation.isPending}
                  onClick={() =>
                    updateRoleMutation.mutate({ memberId: selectedMember.id, role: newRole })
                  }
                >
                  {updateRoleMutation.isPending ? 'Updating...' : 'Save Role'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Delete Member Confirmation Dialog ─── */}
      {memberToDelete && (
        <Dialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" /> Remove User
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>
                Are you sure you want to remove <strong className="text-foreground">{memberToDelete.name}</strong> from this organization?
              </p>
              <p className="text-destructive">
                They will lose access to all organization workspaces, projects, and boards.
              </p>
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setMemberToDelete(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={removeMemberMutation.isPending}
                  onClick={() => removeMemberMutation.mutate(memberToDelete.id)}
                >
                  {removeMemberMutation.isPending ? 'Removing...' : 'Remove User'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
