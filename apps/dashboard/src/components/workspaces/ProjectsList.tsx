import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@boardly/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  BookOpen,
  BarChart3,
  Zap,
  UploadCloud,
  MoreHorizontal,
  Edit2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { ImportModal } from '../board/ImportModal';
import { useDialogClose } from '../../hooks/useDialogClose';
import { usePermissions, permissionReason } from '../../hooks/usePermissions';
import { api } from '../../lib/api';
import { BoardsList } from './BoardsList';

interface ProjectsListProps {
  workspaceId: string;
  initialProjects?: any[];
}

export function ProjectsList({ workspaceId, initialProjects }: ProjectsListProps) {
  const queryClient = useQueryClient();
  const [importProjectId, setImportProjectId] = useState<string | null>(null);
  const [importProjectName, setImportProjectName] = useState<string>('');
  const [editingProj, setEditingProj] = useState<{ id: string; name: string } | null>(null);
  const [deletingProj, setDeletingProj] = useState<{ id: string; name: string } | null>(null);
  const { can, isLoading: permsLoading } = usePermissions();
  const canUpdateProject = permsLoading ? false : can('project.update');
  const canDeleteProject = permsLoading ? false : can('project.delete');
  const canImport = permsLoading ? false : can('board.create');
  const canAutomate = permsLoading ? false : can('automation.manage');

  const { data: projects } = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: async () => {
      if (initialProjects !== undefined) return initialProjects;
      const res = await api.get(`/projects?workspaceId=${workspaceId}`);
      return res.data;
    },
    initialData: initialProjects,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const deleteProjMutation = useMutation({
    mutationFn: async (id: string) => await api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
      setDeletingProj(null);
    },
  });

  const updateProjMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      await api.patch(`/projects/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
      setEditingProj(null);
    },
  });

  const { handleOpenChange: handleEditOpenChange, requestClose: requestEditClose } = useDialogClose(
    {
      isOpen: !!editingProj,
      onClose: () => setEditingProj(null),
    }
  );

  const { handleOpenChange: handleDeleteOpenChange, requestClose: requestDeleteClose } =
    useDialogClose({
      isOpen: !!deletingProj,
      onClose: () => setDeletingProj(null),
    });

  // Single close path (AGENTS.md §11) — requestClose is idempotent per
  // open session, so X / backdrop / Esc cannot double-close.
  //
  // MUST stay above the empty-projects guard: `projects` arrives async, so the
  // guard is true on the loading render and false once data lands. A hook below
  // it is skipped then run, and React throws "Rendered more hooks than during
  // the previous render".
  const { handleOpenChange } = useDialogClose({
    isOpen: !!importProjectId,
    onClose: () => setImportProjectId(null),
  });

  if (!projects || projects.length === 0) {
    return (
      <div className="text-muted-foreground text-xs italic py-4 px-2">
        No projects found in this workspace. Click &ldquo;+ Add Project&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="grid gap-6 pt-1">
      {projects.map((proj: any) => (
        <div
          key={proj.id}
          className="flex flex-col gap-3 p-4 rounded-xl bg-muted/25 border border-border/60"
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
              {proj.name}
            </h3>

            <div className="flex items-center gap-1.5">
              <Link to={`/projects/${proj.id}/docs`}>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-teal-500" /> Docs
                </Button>
              </Link>
              <Link to={`/projects/${proj.id}/reports`}>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-500" /> Reports
                </Button>
              </Link>
              <Link to={`/projects/${proj.id}/phases`}>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Phases
                </Button>
              </Link>
              <Link to={`/projects/${proj.id}/sprints`}>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Sprints
                </Button>
              </Link>
              {canAutomate && (
                <Link to={`/projects/${proj.id}/automation`}>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" /> Automation
                  </Button>
                </Link>
              )}
              <span
                className="inline-flex"
                title={canImport ? undefined : permissionReason('board.create')}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 disabled:cursor-not-allowed"
                  disabled={!canImport}
                  title={canImport ? undefined : permissionReason('board.create')}
                  onClick={() => {
                    setImportProjectId(proj.id);
                    setImportProjectName(proj.name);
                  }}
                >
                  <UploadCloud className="w-3.5 h-3.5 text-indigo-500" /> Import
                </Button>
              </span>

              {/* Project Actions Dropdown — hidden when nothing inside is allowed */}
              {(canUpdateProject || canDeleteProject) && (
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {canUpdateProject && (
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-xs"
                        onClick={() => setEditingProj({ id: proj.id, name: proj.name })}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename Project
                      </DropdownMenuItem>
                    )}
                    {canUpdateProject && canDeleteProject && <DropdownMenuSeparator />}
                    {canDeleteProject && (
                      <DropdownMenuItem
                        variant="destructive"
                        className="cursor-pointer gap-2 text-xs"
                        onClick={() => setDeletingProj({ id: proj.id, name: proj.name })}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete Project
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <BoardsList projectId={proj.id} initialBoards={proj.boards ?? []} />
        </div>
      ))}

      {/* Edit Project Dialog */}
      {editingProj && canUpdateProject && (
        <Dialog open={!!editingProj} onOpenChange={handleEditOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingProj.name.trim()) {
                  updateProjMutation.mutate({ id: editingProj.id, name: editingProj.name.trim() });
                }
              }}
              className="space-y-4 py-2"
            >
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Project Name</Label>
                <Input
                  value={editingProj.name}
                  onChange={(e) => setEditingProj({ ...editingProj, name: e.target.value })}
                  placeholder="e.g. Mobile App Development"
                  className="h-9 text-xs"
                  autoFocus
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={requestEditClose}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateProjMutation.isPending}>
                  {updateProjMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Project Dialog */}
      {deletingProj && canDeleteProject && (
        <Dialog open={!!deletingProj} onOpenChange={handleDeleteOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" /> Delete Project
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>
                Are you sure you want to delete project{' '}
                <strong className="text-foreground">{deletingProj.name}</strong>?
              </p>
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
                <p className="font-semibold">
                  Warning: This action will permanently remove all Kanban boards, tasks, sprints,
                  and documents in this project.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={requestDeleteClose}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteProjMutation.isPending}
                  onClick={() => deleteProjMutation.mutate(deletingProj.id)}
                >
                  {deleteProjMutation.isPending ? 'Deleting...' : 'Delete Project'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {importProjectId && (
        <ImportModal
          open={!!importProjectId}
          onOpenChange={handleOpenChange}
          projectId={importProjectId}
          projectName={importProjectName}
        />
      )}
    </div>
  );
}
