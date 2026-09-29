import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Card } from '@boardly/ui/card';
import { Button } from '@boardly/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@boardly/ui/dialog';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  Plus,
  BarChart3,
  UploadCloud,
  BookOpen,
  Briefcase,
  MoreHorizontal,
  Trash2,
  Edit2,
  AlertTriangle,
  Check,
  Kanban,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { Tooltip } from '@boardly/ui';
import { ImportModal } from '../components/board/ImportModal';
import { QueryError } from '../components/common/QueryError';

const BOARD_GRADIENTS = [
  { id: 'blue', name: 'Oceanic Blue', value: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' },
  {
    id: 'violet',
    name: 'Royal Purple',
    value: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
  },
  {
    id: 'emerald',
    name: 'Emerald Teal',
    value: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  },
  {
    id: 'sunset',
    name: 'Sunset Coral',
    value: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
  },
  { id: 'rose', name: 'Rose Berry', value: 'linear-gradient(135deg, #db2777 0%, #be185d 100%)' },
  { id: 'cyan', name: 'Cyan Sky', value: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' },
  { id: 'amber', name: 'Golden Amber', value: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' },
  { id: 'indigo', name: 'Deep Indigo', value: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' },
  { id: 'slate', name: 'Modern Slate', value: 'linear-gradient(135deg, #475569 0%, #334155 100%)' },
];

/**
 * Resolves board gradient, automatically upgrading legacy dark/pitch-black gradients
 * into rich, vibrant, modern palettes that look amazing in both light and dark themes.
 */
function resolveBoardGradient(bg?: string, index: number = 0): string {
  if (!bg) {
    return BOARD_GRADIENTS[index % BOARD_GRADIENTS.length].value;
  }
  // Backend allowlists this shape; double-guard legacy/dirty rows here so a
  // stored `url(...)`/`javascript:` value can never reach `style={background}`.
  if (/url\(|javascript:|expression|</i.test(bg)) {
    return BOARD_GRADIENTS[index % BOARD_GRADIENTS.length].value;
  }
  // Check if it's one of the legacy pitch-black gradients
  const isDarkLegacy =
    bg.includes('#0f172a') ||
    bg.includes('#1e1b4b') ||
    bg.includes('#0c2340') ||
    bg.includes('#064e3b') ||
    bg.includes('#2e1065') ||
    bg.includes('#18181b') ||
    bg.includes('#312e81') ||
    bg.includes('slate-900') ||
    bg.includes('indigo-950');

  if (isDarkLegacy) {
    return BOARD_GRADIENTS[index % BOARD_GRADIENTS.length].value;
  }
  return bg;
}

export function Workspaces() {
  const queryClient = useQueryClient();
  const [editingWs, setEditingWs] = useState<{ id: string; name: string } | null>(null);
  const [deletingWs, setDeletingWs] = useState<{ id: string; name: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Sidebar "+" deep-links here with ?createWorkspace=1 — consume on change
  // (no remount when already on this route, so watch searchParams).
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get('createWorkspace') === '1') {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('createWorkspace');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            {isTreeLoading ? (
              <div className="h-7 w-8 rounded bg-muted animate-pulse" aria-label="Loading count" />
            ) : (
              <div className="text-xl font-bold text-foreground">{workspaces?.length || 0}</div>
            )}
            <div className="text-xs text-muted-foreground">Workspaces</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            {isTreeLoading ? (
              <div className="h-7 w-8 rounded bg-muted animate-pulse" aria-label="Loading count" />
            ) : (
              <div className="text-xl font-bold text-foreground">{totalProjects}</div>
            )}
            <div className="text-xs text-muted-foreground">Active Projects</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            {isTreeLoading ? (
              <div className="h-7 w-8 rounded bg-muted animate-pulse" aria-label="Loading count" />
            ) : (
              <div className="text-xl font-bold text-foreground">{totalBoards}</div>
            )}
            <div className="text-xs text-muted-foreground">Kanban Boards</div>
          </div>
        </div>

        <Link
          to="/my-tasks"
          className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex items-center gap-3 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors group"
        >
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              My Tasks
            </div>
            <div className="text-[11px] text-muted-foreground truncate">View assigned work →</div>
          </div>
        </Link>
      </div>

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

                {/* Workspace Actions Dropdown */}
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
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-xs"
                      onClick={() => setEditingWs({ id: ws.id, name: ws.name })}
                    >
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename Workspace
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                      onClick={() => setDeletingWs({ id: ws.id, name: ws.name })}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Workspace
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <ProjectsList workspaceId={ws.id} initialProjects={ws.projects ?? []} />
          </div>
        ))
      )}

      {/* Edit Workspace Dialog */}
      {editingWs && (
        <Dialog open={!!editingWs} onOpenChange={(open) => !open && setEditingWs(null)}>
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
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingWs(null)}>
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
      {deletingWs && (
        <Dialog open={!!deletingWs} onOpenChange={(open) => !open && setDeletingWs(null)}>
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
                <Button type="button" variant="ghost" size="sm" onClick={() => setDeletingWs(null)}>
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

function ProjectsList({
  workspaceId,
  initialProjects,
}: {
  workspaceId: string;
  initialProjects?: any[];
}) {
  const queryClient = useQueryClient();
  const [importProjectId, setImportProjectId] = useState<string | null>(null);
  const [importProjectName, setImportProjectName] = useState<string>('');
  const [editingProj, setEditingProj] = useState<{ id: string; name: string } | null>(null);
  const [deletingProj, setDeletingProj] = useState<{ id: string; name: string } | null>(null);

  const { data: projects } = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: async () => {
      // Tree already includes projects — skip the fan-out request when present.
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
              <Link to={`/projects/${proj.id}/automation`}>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Automation
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  setImportProjectId(proj.id);
                  setImportProjectName(proj.name);
                }}
              >
                <UploadCloud className="w-3.5 h-3.5 text-indigo-500" /> Import
              </Button>

              {/* Project Actions Dropdown */}
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
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs"
                    onClick={() => setEditingProj({ id: proj.id, name: proj.name })}
                  >
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename Project
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={() => setDeletingProj({ id: proj.id, name: proj.name })}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <BoardsList projectId={proj.id} initialBoards={proj.boards ?? []} />
        </div>
      ))}

      {/* Edit Project Dialog */}
      {editingProj && (
        <Dialog open={!!editingProj} onOpenChange={(open) => !open && setEditingProj(null)}>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingProj(null)}
                >
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
      {deletingProj && (
        <Dialog open={!!deletingProj} onOpenChange={(open) => !open && setDeletingProj(null)}>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeletingProj(null)}
                >
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
          onOpenChange={(open) => !open && setImportProjectId(null)}
          projectId={importProjectId}
          projectName={importProjectName}
        />
      )}
    </div>
  );
}

function BoardsList({ projectId, initialBoards }: { projectId: string; initialBoards?: any[] }) {
  const queryClient = useQueryClient();
  const [editingBoard, setEditingBoard] = useState<{
    id: string;
    name: string;
    background?: string;
  } | null>(null);
  const [deletingBoard, setDeletingBoard] = useState<{ id: string; name: string } | null>(null);

  const { data: boards } = useQuery({
    queryKey: ['boards', projectId],
    queryFn: async () => {
      // Tree already includes boards — skip the fan-out request when present.
      if (initialBoards !== undefined) return initialBoards;
      const res = await api.get(`/boards?projectId=${projectId}`);
      return res.data;
    },
    initialData: initialBoards,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const deleteBoardMutation = useMutation({
    mutationFn: async (id: string) => await api.delete(`/boards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
      setDeletingBoard(null);
    },
  });

  const updateBoardMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      background,
    }: {
      id: string;
      name: string;
      background?: string;
    }) => await api.patch(`/boards/${id}`, { name, background }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
      setEditingBoard(null);
    },
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {boards?.map((board: any, idx: number) => {
        const bgGradient = resolveBoardGradient(board.background, idx);
        const isTailwindBg =
          bgGradient && (bgGradient.startsWith('from-') || bgGradient.startsWith('bg-'));
        return (
          <div key={board.id} className="relative group">
            <Link to={`/b/${board.id}`}>
              <Card className="h-32 hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer overflow-hidden relative border border-white/20 dark:border-white/10 rounded-2xl text-white shadow-sm flex flex-col justify-between p-4">
                <div
                  className={`absolute inset-0 ${
                    isTailwindBg
                      ? bgGradient.startsWith('from-')
                        ? `bg-gradient-to-br ${bgGradient}`
                        : bgGradient
                      : ''
                  } transition-transform duration-300 group-hover:scale-105`}
                  style={!isTailwindBg ? { background: bgGradient } : undefined}
                />
                {/* Subtle glassmorphic depth & lighting overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/10 pointer-events-none" />

                {/* Top header strip: Board Icon badge */}
                <div className="relative z-10 flex items-center justify-between">
                  <span className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-2xs">
                    <Kanban className="w-3.5 h-3.5" />
                  </span>
                </div>

                {/* Bottom title */}
                <div className="relative z-10">
                  <Tooltip content={board.name} side="bottom">
                    <h3 className="text-white text-base font-bold truncate pr-6 drop-shadow-xs group-hover:translate-x-0.5 transition-transform">
                      {board.name}
                    </h3>
                  </Tooltip>
                </div>
              </Card>
            </Link>

            {/* 3-Dots Action Menu on Board Tile */}
            <div className="absolute top-3.5 right-3.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="w-7 h-7 rounded-lg bg-black/35 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer shadow-xs"
                    title="Board options"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingBoard({
                        id: board.id,
                        name: board.name,
                        background: board.background,
                      });
                    }}
                  >
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename &amp; Theme
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeletingBoard({ id: board.id, name: board.name });
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Board
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}

      <CreateBoardDialog projectId={projectId} />

      {/* Edit Board Dialog */}
      {editingBoard && (
        <Dialog open={!!editingBoard} onOpenChange={(open) => !open && setEditingBoard(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Board</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingBoard.name.trim()) {
                  updateBoardMutation.mutate({
                    id: editingBoard.id,
                    name: editingBoard.name.trim(),
                    background: editingBoard.background,
                  });
                }
              }}
              className="space-y-4 py-2"
            >
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Board Name</Label>
                <Input
                  value={editingBoard.name}
                  onChange={(e) => setEditingBoard({ ...editingBoard, name: e.target.value })}
                  placeholder="e.g. Sprint 1 Board"
                  className="h-9 text-xs"
                  autoFocus
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Board Theme</Label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {BOARD_GRADIENTS.map((grad) => {
                    const isSelected = editingBoard.background === grad.value;
                    return (
                      <button
                        key={grad.id}
                        type="button"
                        onClick={() => setEditingBoard({ ...editingBoard, background: grad.value })}
                        className={`h-10 rounded-lg relative overflow-hidden transition-all cursor-pointer ring-offset-background ${
                          isSelected
                            ? 'ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-sm'
                            : 'hover:scale-[1.02] opacity-85 hover:opacity-100'
                        }`}
                        style={{ background: grad.value }}
                        title={grad.name}
                      >
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                            <Check className="w-4 h-4 text-white drop-shadow" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingBoard(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateBoardMutation.isPending}>
                  {updateBoardMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Board Dialog */}
      {deletingBoard && (
        <Dialog open={!!deletingBoard} onOpenChange={(open) => !open && setDeletingBoard(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" /> Delete Board
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>
                Are you sure you want to permanently delete{' '}
                <strong className="text-foreground">{deletingBoard.name}</strong>?
              </p>
              <p className="text-destructive text-xs">
                All lists, cards, checklist items, and discussions on this board will be removed.
              </p>
              <div className="flex justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeletingBoard(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteBoardMutation.isPending}
                  onClick={() => deleteBoardMutation.mutate(deletingBoard.id)}
                >
                  {deleteBoardMutation.isPending ? 'Deleting...' : 'Delete Board'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CreateWorkspaceDialog({
  onSuccess,
  open,
  onOpenChange,
}: {
  onSuccess: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;
  const setDialogOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [name, setName] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post('/workspaces', { name: name.trim() });
    setName('');
    setDialogOpen(false);
    onSuccess();
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 text-xs font-semibold gap-1.5 shadow-xs">
          <Plus className="h-4 w-4" /> Create Workspace
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Workspace Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering, Product, Design"
              className="h-9 text-xs"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Create Workspace
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateBoardDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(BOARD_GRADIENTS[0].value);
  const queryClient = useQueryClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post('/boards', {
      projectId,
      name: name.trim(),
      background: selectedGradient,
    });
    setName('');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['boards', projectId] });
    queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="h-32 flex items-center justify-center border-dashed border-2 hover:border-primary cursor-pointer hover:bg-muted/40 transition-all rounded-2xl group">
          <div className="flex flex-col items-center text-muted-foreground group-hover:text-primary transition-colors">
            <Plus className="h-5 w-5 mb-1" />
            <span className="text-xs font-semibold">Create Board</span>
          </div>
        </Card>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Board</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Board Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sprint 24, Roadmap, QA Kanban"
              className="h-9 text-xs"
              autoFocus
              required
            />
          </div>

          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Board Theme</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {BOARD_GRADIENTS.map((grad) => {
                const isSelected = selectedGradient === grad.value;
                return (
                  <button
                    key={grad.id}
                    type="button"
                    onClick={() => setSelectedGradient(grad.value)}
                    className={`h-10 rounded-lg relative overflow-hidden transition-all cursor-pointer ring-offset-background ${
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-sm'
                        : 'hover:scale-[1.02] opacity-85 hover:opacity-100'
                    }`}
                    style={{ background: grad.value }}
                    title={grad.name}
                  >
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <Check className="w-4 h-4 text-white drop-shadow" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Create Board
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateProjectDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/projects', { workspaceId, name: name.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
      setName('');
      setOpen(false);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs font-medium gap-1">
          <Plus className="h-3.5 w-3.5" /> Add Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Project Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q4 Enterprise Features"
              className="h-9 text-xs"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
