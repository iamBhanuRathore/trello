import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { superAdminService, type PlatformUser } from '../lib/superAdminService';
import { Avatar, AvatarFallback, AvatarImage } from '@boardly/ui/avatar';
import { Button } from '@boardly/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { EnterpriseDataGrid, type ColumnDef } from '@boardly/ui/enterprise-data-grid';
import { ConfirmDialog } from '@boardly/ui/confirm-dialog';
import {
  Users,
  Building2,
  ShieldCheck,
  Sparkles,
  Search,
  Lock,
  Clock,
  LogOut,
  Layers,
  X,
  RotateCcw,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';

export function isSystemBot(
  user?: { email?: string | null; name?: string | null } | null
): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  const name = (user.name || '').toLowerCase();
  return email.endsWith('@boardly.internal') || email.includes('bot') || name.includes('bot');
}

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

export const PlatformUsers: React.FC = () => {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<'all' | 'multi' | 'single' | 'admin'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [userToLogout, setUserToLogout] = useState<PlatformUser | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['superAdminUsers'],
    queryFn: superAdminService.getUsers,
  });

  const forceLogoutMutation = useMutation({
    mutationFn: (userId: string) => superAdminService.forceLogoutUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdminUsers'] });
      toast.success('All platform sessions for this user have been terminated');
      setUserToLogout(null);
      if (selectedUser?.id === userToLogout?.id) {
        setSelectedUser(null);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to revoke sessions');
    },
  });

  // Metric counts
  const totalUsers = users.length;
  const multiCompanyCount = users.filter((u) => u.isMultiCompany).length;
  const singleCompanyCount = users.filter((u) => u.organizationsCount === 1).length;
  const platformAdminCount = users.filter((u) => u.isPlatformAdmin).length;

  // Filtered users according to quick pills + role filter + search query
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // 1. Quick pill filter
      if (filterType === 'multi' && !u.isMultiCompany) return false;
      if (filterType === 'single' && u.organizationsCount !== 1) return false;
      if (filterType === 'admin' && !u.isPlatformAdmin) return false;

      // 2. Role filter dropdown
      if (roleFilter !== 'all') {
        if (roleFilter === 'platform_admin') {
          if (!u.isPlatformAdmin) return false;
        } else {
          const hasRole = u.organizations?.some((o) => o.role === roleFilter);
          if (!hasRole) return false;
        }
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        const matchOrgs = u.organizations?.some(
          (o) =>
            o.organizationName?.toLowerCase().includes(q) ||
            o.organizationSlug?.toLowerCase().includes(q)
        );
        if (!matchName && !matchEmail && !matchOrgs) return false;
      }
      return true;
    });
  }, [users, filterType, roleFilter, searchQuery]);

  // ─── Column Definitions for EnterpriseDataGrid ───
  const columns = useMemo<ColumnDef<PlatformUser>[]>(
    () => [
      {
        id: 'user',
        header: 'User Identity',
        sortable: true,
        accessorFn: (u) => u.name || u.email,
        exportValue: (u) => `${u.name} (${u.email})`,
        cell: ({ row }) => {
          const isBot = isSystemBot(row);
          return (
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setSelectedUser(row)}
            >
              <Avatar className="h-9 w-9 ring-1 ring-border group-hover:ring-purple-500 transition-all">
                <AvatarImage src={row.avatarUrl || ''} />
                <AvatarFallback
                  className={`text-xs font-bold ${
                    isBot ? 'bg-sky-500/10 text-sky-400' : 'bg-purple-500/10 text-purple-400'
                  }`}
                >
                  {isBot ? (
                    <Bot className="w-4 h-4" />
                  ) : row.name ? (
                    row.name.substring(0, 2).toUpperCase()
                  ) : (
                    'U'
                  )}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold text-xs text-white flex items-center gap-2 group-hover:text-purple-400 transition-colors">
                  <span>{row.name}</span>
                  {isBot && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                      <Bot className="w-2.5 h-2.5" />
                      <span>System Bot</span>
                    </span>
                  )}
                  {row.isPlatformAdmin && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                      Platform Admin
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">{row.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'companyReach',
        header: 'Company Reach',
        sortable: true,
        filterable: true,
        accessorFn: (u) =>
          u.isMultiCompany
            ? `Multi-Company (${u.organizationsCount} Companies)`
            : u.organizationsCount === 1
              ? 'Single Company (1)'
              : 'No Company',
        exportValue: (u) => `${u.organizationsCount} Companies`,
        cell: ({ row }) =>
          row.isMultiCompany ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>{row.organizationsCount} Companies</span>
            </span>
          ) : row.organizationsCount === 1 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
              <Building2 className="w-3 h-3" />
              <span>1 Company</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">No Company</span>
          ),
      },
      {
        id: 'associatedCompanies',
        header: 'Associated Companies & Roles',
        sortable: false,
        filterable: true,
        accessorFn: (u) =>
          u.organizations.length > 0
            ? u.organizations
                .map((o) => `${o.organizationName} (${o.role.replace('_', ' ')})`)
                .join(', ')
            : '(None)',
        exportValue: (u) =>
          u.organizations.map((o) => `${o.organizationName} [${o.role}]`).join('; '),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5 max-w-md">
            {row.organizations.map((org) => {
              const isOwnerOrAdmin = org.role === 'org_owner' || org.role === 'org_admin';
              const isDeactivated = org.status === 'deactivated';

              return (
                <span
                  key={org.organizationId}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                    isDeactivated
                      ? 'bg-destructive/10 text-destructive border-destructive/20 line-through opacity-70'
                      : isOwnerOrAdmin
                        ? 'bg-purple-500/10 text-purple-300 border-purple-500/25'
                        : 'bg-muted text-foreground border-border'
                  }`}
                >
                  <Building2 className="w-3 h-3 opacity-70" />
                  <span className="font-semibold">{org.organizationName}</span>
                  <span className="text-[10px] opacity-75 font-mono">
                    ({org.role.replace('_', ' ')})
                  </span>
                </span>
              );
            })}
            {row.organizations.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No memberships</span>
            )}
          </div>
        ),
      },
      {
        id: 'lastLoginAt',
        header: 'Last Platform Login',
        sortable: true,
        filterable: true,
        accessorFn: (u) => formatRelativeTime(u.lastLoginAt),
        exportValue: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : 'Never'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatRelativeTime(row.lastLoginAt)}</span>
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        align: 'right',
        sortable: false,
        filterable: false,
        cell: ({ row }) => {
          const isBot = isSystemBot(row);
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 cursor-pointer hover:border-purple-500 hover:text-purple-400"
                onClick={() => setSelectedUser(row)}
              >
                <Layers className="w-3 h-3" />
                <span>Inspect</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isBot}
                className={
                  isBot
                    ? 'h-7 text-xs text-muted-foreground/30 cursor-not-allowed opacity-30 hover:bg-transparent'
                    : 'h-7 text-xs text-destructive hover:bg-destructive/10 cursor-pointer'
                }
                title={
                  isBot
                    ? 'System automation account; has no active interactive sessions'
                    : 'Terminate all platform sessions'
                }
                onClick={() => !isBot && setUserToLogout(row)}
              >
                <LogOut className="w-3 h-3" />
              </Button>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Platform Users & Multi-Company Intelligence</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30">
              Cross-Org
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Inspect platform-wide user accounts, detect users working across multiple companies, and
            govern global access.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setFilterType('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            filterType === 'all'
              ? 'border-purple-500/50 bg-purple-950/20 ring-1 ring-purple-500/30 shadow-md'
              : 'border-border/80 bg-card/60 hover:bg-muted/30'
          } backdrop-blur-md flex items-center gap-3.5`}
        >
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{totalUsers}</div>
            <div className="text-xs text-muted-foreground">Total Platform Users</div>
          </div>
        </div>

        <div
          onClick={() => setFilterType('multi')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            filterType === 'multi'
              ? 'border-purple-500/60 bg-purple-950/30 ring-1 ring-purple-500/40 shadow-md'
              : 'border-purple-500/30 bg-purple-950/10 hover:bg-purple-950/20'
          } backdrop-blur-md flex items-center gap-3.5`}
        >
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{multiCompanyCount}</div>
            <div className="text-xs text-purple-300">Multi-Company Users</div>
          </div>
        </div>

        <div
          onClick={() => setFilterType('single')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            filterType === 'single'
              ? 'border-purple-500/50 bg-purple-950/20 ring-1 ring-purple-500/30 shadow-md'
              : 'border-border/80 bg-card/60 hover:bg-muted/30'
          } backdrop-blur-md flex items-center gap-3.5`}
        >
          <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{singleCompanyCount}</div>
            <div className="text-xs text-muted-foreground">Single-Company Users</div>
          </div>
        </div>

        <div
          onClick={() => setFilterType('admin')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            filterType === 'admin'
              ? 'border-purple-500/50 bg-purple-950/20 ring-1 ring-purple-500/30 shadow-md'
              : 'border-border/80 bg-card/60 hover:bg-muted/30'
          } backdrop-blur-md flex items-center gap-3.5`}
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{platformAdminCount}</div>
            <div className="text-xs text-muted-foreground">Platform Super Admins</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar with Quick Pills & Role Select */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/80 pb-3">
        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            All Users ({users.length})
          </button>
          <button
            onClick={() => setFilterType('multi')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterType === 'multi'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Multi-Company Only ({multiCompanyCount})</span>
          </button>
          <button
            onClick={() => setFilterType('single')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'single'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Single-Company ({singleCompanyCount})
          </button>
          <button
            onClick={() => setFilterType('admin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'admin'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Platform Admins ({platformAdminCount})
          </button>
        </div>

        {/* Secondary Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role Filter Dropdown */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-xs py-1.5 px-3 rounded-xl border border-border bg-card text-foreground focus:ring-1 focus:ring-purple-500 focus:outline-none cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="platform_admin">Platform Super Admin</option>
            <option value="org_owner">Org Owner</option>
            <option value="org_admin">Org Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by user or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-purple-500 focus:outline-none w-56 sm:w-64"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {(roleFilter !== 'all' || searchQuery || filterType !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterType('all');
                setRoleFilter('all');
                setSearchQuery('');
              }}
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Upgraded Enterprise Data Grid */}
      <EnterpriseDataGrid
        data={filteredUsers}
        columns={columns}
        isLoading={isLoading}
        searchable={false}
        enableExport={true}
        exportFileName="boardly_platform_users"
        defaultPageSize={15}
        emptyMessage="No platform users found matching your filters."
      />

      {/* Cross-Company Inspection Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-card border border-border/80 rounded-2xl shadow-2xl">
          {selectedUser && (
            <div>
              <DialogHeader className="p-5 border-b border-border bg-muted/20">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 ring-2 ring-purple-500/30">
                    <AvatarImage src={selectedUser.avatarUrl || ''} />
                    <AvatarFallback
                      className={`text-base font-bold ${
                        isSystemBot(selectedUser)
                          ? 'bg-sky-500/10 text-sky-400'
                          : 'bg-purple-500/10 text-purple-400'
                      }`}
                    >
                      {isSystemBot(selectedUser) ? (
                        <Bot className="w-6 h-6" />
                      ) : selectedUser.name ? (
                        selectedUser.name.substring(0, 2).toUpperCase()
                      ) : (
                        'U'
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-base font-bold text-white">
                        {selectedUser.name}
                      </DialogTitle>
                      {isSystemBot(selectedUser) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          <span>System Bot</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{selectedUser.email}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {isSystemBot(selectedUser) && (
                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-start gap-2.5 text-xs text-sky-200">
                    <Bot className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-sky-300">System Automation Account</div>
                      <div className="text-[11px] text-sky-300/80 mt-0.5 leading-relaxed">
                        This internal service account is used by automated platform integrations
                        (e.g. GitHub/Git sync) to author task comments and activity logs. It cannot
                        be deleted or forced out, and its records are preserved to protect database
                        referential integrity.
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border text-xs">
                  <div>
                    <span className="text-muted-foreground">Global Account Created:</span>
                    <span className="font-semibold text-white ml-1.5">
                      {formatRelativeTime(selectedUser.createdAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Login:</span>
                    <span className="font-semibold text-white ml-1.5">
                      {formatRelativeTime(selectedUser.lastLoginAt)}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Company Memberships & Roles ({selectedUser.organizations.length})</span>
                  </h4>

                  {selectedUser.organizations.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No active company associations.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedUser.organizations.map((org) => (
                        <div
                          key={org.organizationId}
                          className="p-3 rounded-xl border border-border bg-background/60 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{org.organizationName}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                /{org.organizationSlug}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Joined {formatRelativeTime(org.joinedAt)} • Last Active{' '}
                              {formatRelativeTime(org.lastActiveAt)}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20 capitalize">
                              {org.role.replace('_', ' ')}
                            </span>
                            {org.status === 'deactivated' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5" /> Deactivated
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-border bg-muted/20 flex justify-between items-center">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isSystemBot(selectedUser)}
                  className={`text-xs gap-1.5 ${
                    isSystemBot(selectedUser)
                      ? 'opacity-40 cursor-not-allowed hover:bg-destructive'
                      : 'cursor-pointer'
                  }`}
                  title={
                    isSystemBot(selectedUser)
                      ? 'System automation accounts have no interactive sessions to revoke'
                      : 'Terminate all platform sessions'
                  }
                  onClick={() => {
                    if (!isSystemBot(selectedUser)) {
                      const target = selectedUser;
                      setSelectedUser(null);
                      setUserToLogout(target);
                    }
                  }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Terminate All Sessions</span>
                </Button>

                <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Terminate Session Confirm Dialog */}
      <ConfirmDialog
        open={!!userToLogout}
        onOpenChange={(open) => !open && setUserToLogout(null)}
        variant="destructive"
        title="Terminate Platform Sessions"
        description={`Are you sure you want to immediately revoke all active authentication tokens and sessions across all organizations for ${userToLogout?.name}?`}
        confirmLabel="Terminate Sessions"
        isLoading={forceLogoutMutation.isPending}
        onConfirm={async () => {
          if (userToLogout) {
            await forceLogoutMutation.mutateAsync(userToLogout.id);
            setUserToLogout(null);
          }
        }}
      />
    </div>
  );
};
