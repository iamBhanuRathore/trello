import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '@boardly/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Briefcase, MoreHorizontal, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { QueryError } from '../components/common/QueryError';
import { useDialogClose } from '../hooks/useDialogClose';
import { usePermissions } from '../hooks/usePermissions';
import {
  WorkspacesOverview,
  CreateWorkspaceDialog,
  CreateProjectDialog,
  ProjectsList,
} from '../components/workspaces';

export function Workspaces() {
  const queryClient = useQueryClient();
  const [editingWs, setEditingWs] = useState<{ id: string; name: string } | null>(null);
  const [deletingWs, setDeletingWs] = useState<{ id: string; name: string } | null>(null);
  // Sidebar "+" / header Create menu open the shell-level GlobalCreateWorkspaceDialog
  // (DashboardLayout) via ?createWorkspace=1 — no page-local param handling here.
  const [createOpen, setCreateOpen] = useState(false);
  const { can, isLoading: permsLoading } = usePermissions();
  const canUpdateWs = permsLoading ? false : can('workspace.update');
  const canDeleteWs = permsLoading ? false : can('workspace.delete');

  const {
    data: workspaces,
    isLoading: isTreeLoading,
    isError: isTreeError,
    refetch: refetchTree,
  } = useQuery({
    queryKey: ['workspaces', 'tree'],
    queryFn: async () => {
      const res = await api.get('/workspaces/tree');
      return res.data;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const deleteWsMutation = useMutation({
    mutationFn: async (id: string) => await api.delete(`/workspaces/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
      setDeletingWs(null);
    },
  });

  const updateWsMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      await api.patch(`/workspaces/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
      setEditingWs(null);
    },
  });

  const { handleOpenChange: handleEditOpenChange, requestClose: requestEditClose } = useDialogClose(
    {
      isOpen: !!editingWs,
      onClose: () => setEditingWs(null),
    }
  );

  const { handleOpenChange: handleDeleteOpenChange, requestClose: requestDeleteClose } =
    useDialogClose({
      isOpen: !!deletingWs,
      onClose: () => setDeletingWs(null),
    });

  const totalProjects =
    workspaces?.reduce((acc: number, ws: any) => acc + (ws.projects?.length || 0), 0) || 0;
  const totalBoards =
    workspaces?.reduce(
      (acc: number, ws: any) =>
        acc +
        (ws.projects?.reduce((pAcc: number, p: any) => pAcc + (p.boards?.length || 0), 0) || 0),
      0
    ) || 0;

  return (
    <div className="w-full mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Your Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize teams, projects, and Kanban boards across your organization.
          </p>
        </div>
        <CreateWorkspaceDialog
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['workspaces'] })}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      </div>

      {/* Quick KPI Overview Bar */}
      <WorkspacesOverview
        workspacesCount={workspaces?.length || 0}
        totalProjects={totalProjects}
        totalBoards={totalBoards}
        isLoading={isTreeLoading}
      />

      {isTreeLoading && !workspaces ? (
        <div className="flex flex-col gap-6" aria-label="Loading workspaces">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-4 p-5 rounded-2xl border border-border/80 bg-card/40 shadow-xs"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-border/60">
                <div className="w-9 h-9 rounded-xl bg-muted animate-pulse" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-48 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-32 rounded bg-muted/70 animate-pulse" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="h-24 rounded-xl bg-muted/60 animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : isTreeError && !workspaces ? (
        <QueryError
          message="Couldn't load workspaces. Check your connection and try again."
          onRetry={() => refetchTree()}
          className="min-h-[50vh]"
        />
      ) : (
        workspaces?.map((ws: any) => (
          <div
            key={ws.id}
            className="flex flex-col gap-4 p-5 rounded-2xl border border-border/80 bg-card/40 backdrop-blur-sm shadow-xs"
          >
            {/* Workspace Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/60">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shadow-2xs shrink-0">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2 truncate">
                    {ws.name}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link to={`/workspaces/${ws.id}/portfolio`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-medium">
                    <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                    <span className="hidden sm:inline">Portfolio Health</span>
                    <span className="sm:hidden">Health</span>
                  </Button>
                </Link>
                <CreateProjectDialog workspaceId={ws.id} />

                {/* Workspace Actions Dropdown — hidden when nothing inside is allowed */}
                {(canUpdateWs || canDeleteWs) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {canUpdateWs && (
                        <DropdownMenuItem
                          className="cursor-pointer gap-2 text-xs"
                          onClick={() => setEditingWs({ id: ws.id, name: ws.name })}
                        >
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename Workspace
                        </DropdownMenuItem>
                      )}
                      {canUpdateWs && canDeleteWs && <DropdownMenuSeparator />}
                      {canDeleteWs && (
                        <DropdownMenuItem
                          className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                          onClick={() => setDeletingWs({ id: ws.id, name: ws.name })}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete Workspace
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <ProjectsList workspaceId={ws.id} initialProjects={ws.projects ?? []} />
          </div>
        ))
      )}

      {/* Edit Workspace Dialog */}
      {editingWs && canUpdateWs && (
        <Dialog open={!!editingWs} onOpenChange={handleEditOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename Workspace</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingWs.name.trim()) {
                  updateWsMutation.mutate({ id: editingWs.id, name: editingWs.name.trim() });
                }
              }}
              className="space-y-4 py-2"
            >
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Workspace Name</Label>
                <Input
                  value={editingWs.name}
                  onChange={(e) => setEditingWs({ ...editingWs, name: e.target.value })}
                  placeholder="e.g. Marketing & Growth"
                  className="h-9 text-xs"
                  autoFocus
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={requestEditClose}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateWsMutation.isPending}>
                  {updateWsMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Workspace Dialog */}
      {deletingWs && canDeleteWs && (
        <Dialog open={!!deletingWs} onOpenChange={handleDeleteOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" /> Delete Workspace
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>
                Are you sure you want to delete{' '}
                <strong className="text-foreground">{deletingWs.name}</strong>?
              </p>
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
                <p className="font-semibold">Warning: This action cannot be undone.</p>
                <p>
                  All projects, boards, lists, and tasks in this workspace will be permanently
                  deleted.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={requestDeleteClose}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteWsMutation.isPending}
                  onClick={() => deleteWsMutation.mutate(deletingWs.id)}
                >
                  {deleteWsMutation.isPending ? 'Deleting...' : 'Permanently Delete Workspace'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
