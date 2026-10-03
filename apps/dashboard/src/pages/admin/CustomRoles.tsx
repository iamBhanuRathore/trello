import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRoles,
  getPermissions,
  createRole,
  updateRole,
  deleteRole,
  getApiErrorMessage,
} from '../../lib/api';
import { Shield, Plus, Trash2, Edit2, Check, Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { QueryError } from '../../components/common/QueryError';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useDialogClose } from '../../hooks/useDialogClose';

const CATEGORY_NAMES: Record<string, string> = {
  org: 'Organization & Members',
  workspace: 'Workspaces',
  project: 'Projects & Planning',
  board: 'Kanban Boards',
  card: 'Cards & Time Tracking',
  reports: 'Reports & Analytics',
  audit: 'Audit & Compliance',
  webhook: 'Webhooks & Automation',
  automation: 'Automations',
  docs: 'Docs & Wiki',
};

export function CustomRoles() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [roleName, setRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [roleToDelete, setRoleToDelete] = useState<any>(null);

  const { handleOpenChange: handleDeleteDialogOpenChange } = useDialogClose({
    isOpen: roleToDelete !== null,
    onClose: () => setRoleToDelete(null),
  });

  const {
    data: roles = [],
    isLoading: isRolesLoading,
    isError: isRolesError,
    refetch: refetchRoles,
  } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });

  const {
    data: allPermissions = [],
    isLoading: isPermissionsLoading,
    isError: isPermissionsError,
    refetch: refetchPermissions,
  } = useQuery({
    queryKey: ['permissions'],
    queryFn: getPermissions,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; permissionIds: string[] }) => createRole(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => updateRole(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['teamRoles'] });
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, 'Failed to delete role'));
    },
  });

  const openCreateModal = () => {
    setEditingRole(null);
    setRoleName('');
    setSelectedPermissions([]);
    setIsModalOpen(true);
  };

  const openEditModal = (role: any) => {
    setEditingRole(role);
    setRoleName(role.name);
    setSelectedPermissions(role.permissions?.map((p: any) => p.id) || []);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRole(null);
    setRoleName('');
    setSelectedPermissions([]);
  };

  const togglePermission = (id: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    if (!roleName.trim()) return;
    if (editingRole) {
      updateMutation.mutate({
        id: editingRole.id,
        payload: { name: roleName, permissionIds: selectedPermissions },
      });
    } else {
      createMutation.mutate({
        name: roleName,
        permissionIds: selectedPermissions,
      });
    }
  };

  // Group permissions by prefix
  const groupedPermissions = allPermissions.reduce((acc: Record<string, any[]>, perm: any) => {
    const prefix = perm.key.split('.')[0];
    if (!acc[prefix]) acc[prefix] = [];
    acc[prefix].push(perm);
    return acc;
  }, {});

  if (isRolesLoading) {
    return (
      <div className="space-y-6" aria-label="Loading roles">
        {/* Header mirror */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-muted animate-pulse shrink-0" />
            <div className="space-y-2">
              <div className="h-7 w-72 max-w-full rounded-lg bg-muted animate-pulse" />
              <div className="h-4 w-96 max-w-full rounded bg-muted/60 animate-pulse" />
            </div>
          </div>
          <div className="h-9 w-44 rounded-lg bg-muted/70 animate-pulse" />
        </div>
        {/* Role cards mirror */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-2xl border bg-card/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-5 w-40 rounded-lg bg-muted animate-pulse" />
                <div className="h-6 w-16 rounded-full bg-muted/70 animate-pulse" />
              </div>
              <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
              <div className="flex gap-2">
                <div className="h-7 w-20 rounded-lg bg-muted/60 animate-pulse" />
                <div className="h-7 w-20 rounded-lg bg-muted/60 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isRolesError && roles.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Custom Roles & Permissions</h1>
                <p className="text-sm text-muted-foreground">
                  Define granular RBAC roles and permission overrides for your organization.
                </p>
              </div>
            </div>
          </div>
        </div>
        <QueryError
          message="Couldn't load roles. Check your connection and try again."
          onRetry={() => refetchRoles()}
          className="min-h-[40vh]"
        />
      </div>
    );
  }

  // Single close path (AGENTS.md §11) — requestClose is idempotent per
  // open session, so X / backdrop / Esc cannot double-close.
  const { handleOpenChange } = useDialogClose({
    isOpen: isModalOpen,
    onClose: () => setIsModalOpen(false),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Custom Roles & Permissions</h1>
              <p className="text-sm text-muted-foreground">
                Define granular RBAC roles and permission overrides for your organization.
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={openCreateModal}
          className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Plus className="w-4 h-4" /> Create Custom Role
        </Button>
      </div>

      {/* Role Cards Grid */}
      {roles.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-dashed border-border bg-card/40 space-y-2">
          <p className="text-sm font-semibold text-foreground">No custom roles yet</p>
          <p className="text-xs text-muted-foreground">
            Create a custom role to grant a tailored set of permissions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {roles.map((role: any) => (
            <div
              key={role.id}
              className="p-5 rounded-2xl border bg-card/80 shadow-xs flex flex-col justify-between hover:border-purple-500/30 transition-all group"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-2 rounded-lg ${
                        role.isSystemRole
                          ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                      }`}
                    >
                      {role.isSystemRole ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Shield className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{role.name}</h3>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        {role.isSystemRole ? 'System Built-In' : 'Custom Organization Role'}
                      </span>
                    </div>
                  </div>

                  {!role.isSystemRole && (
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditModal(role)}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-rose-500"
                        onClick={() => setRoleToDelete(role)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Permissions Preview */}
                <div className="space-y-2 pt-2 border-t mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Granted Permissions</span>
                    <span className="font-mono font-bold text-foreground">
                      {role.permissions?.length || (role.isSystemRole ? 'All' : 0)} active
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-28 overflow-y-auto">
                    {role.permissions && role.permissions.length > 0 ? (
                      role.permissions.map((p: any) => (
                        <span
                          key={p.id}
                          className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-muted text-muted-foreground"
                        >
                          {p.key}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        {role.isSystemRole
                          ? 'Full Administrative Access'
                          : 'No explicit permissions assigned'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Assignable to organization members
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation — destructive, irreversible, never one click */}
      <ConfirmDialog
        open={roleToDelete !== null}
        onOpenChange={handleDeleteDialogOpenChange}
        title={`Delete role “${roleToDelete?.name ?? ''}”?`}
        description={`Members assigned this role immediately lose its ${roleToDelete?.permissions?.length ?? 0} granted permission${(roleToDelete?.permissions?.length ?? 0) === 1 ? '' : 's'} and fall back to their base organization role. This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete Role'}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={async () => {
          if (roleToDelete) await deleteMutation.mutateAsync(roleToDelete.id);
        }}
      />

      {/* Role Editor Modal */}
      <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] h-[85vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
          {/* ─── Fixed Header ─── */}
          <DialogHeader className="p-5 sm:px-6 border-b border-border/80 bg-card/90 backdrop-blur-md shrink-0 space-y-1">
            <div className="flex items-center gap-2.5 pr-8">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  {editingRole ? 'Edit Custom Role' : 'Create Custom Role'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Specify a title and configure the permission matrix for this role.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* ─── Scrollable Body ─── */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {/* Role Name */}
            <div>
              <Label className="text-xs font-semibold mb-1 block">Role Name</Label>
              <Input
                placeholder="e.g. QA Specialist, External Reviewer, Product Lead"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Permission Matrix */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Permission Matrix ({selectedPermissions.length} selected)
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[11px] text-purple-600 hover:underline"
                    onClick={() => setSelectedPermissions(allPermissions.map((p: any) => p.id))}
                  >
                    Select All
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:underline"
                    onClick={() => setSelectedPermissions([])}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {isPermissionsLoading && allPermissions.length === 0 ? (
                  <div className="space-y-2.5" aria-label="Loading permissions">
                    {[0, 1].map((i) => (
                      <div key={i} className="h-20 rounded-xl border bg-muted/20 animate-pulse" />
                    ))}
                  </div>
                ) : isPermissionsError && allPermissions.length === 0 ? (
                  <QueryError
                    compact
                    message="Couldn't load permissions."
                    onRetry={() => refetchPermissions()}
                  />
                ) : (
                  (Object.entries(groupedPermissions) as [string, any[]][]).map(
                    ([category, perms]) => (
                      <div
                        key={category}
                        className="p-3.5 rounded-xl border bg-muted/20 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">
                            {CATEGORY_NAMES[category] || category.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {perms.filter((p: any) => selectedPermissions.includes(p.id)).length} of{' '}
                            {perms.length}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {perms.map((perm: any) => {
                            const isChecked = selectedPermissions.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-950 dark:text-purple-200'
                                    : 'bg-background hover:bg-muted/50 border-border text-foreground'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.id)}
                                  className="mt-0.5 rounded border-muted cursor-pointer"
                                />
                                <div>
                                  <p className="font-mono font-medium text-[11px]">{perm.key}</p>
                                  {perm.description && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {perm.description}
                                    </p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          </div>

          {/* ─── Fixed Bottom Footer ─── */}
          <div className="p-4 sm:px-6 border-t border-border/80 bg-card/90 backdrop-blur-md shrink-0 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={closeModal}
              className="cursor-pointer text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white cursor-pointer text-xs px-5"
              onClick={handleSave}
              disabled={!roleName.trim() || createMutation.isPending || updateMutation.isPending}
            >
              <Check className="w-4 h-4" /> Save Role
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
