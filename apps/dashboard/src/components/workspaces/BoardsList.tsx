import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card } from '@boardly/ui/card';
import { Button } from '@boardly/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { MoreHorizontal, Trash2, Edit2, AlertTriangle, Check, Kanban } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { Tooltip } from '@boardly/ui';
import { api } from '../../lib/api';
import { useDialogClose } from '../../hooks/useDialogClose';
import { usePermissions } from '../../hooks/usePermissions';
import { BOARD_GRADIENTS, resolveBoardGradient } from './types';
import { CreateBoardDialog } from './CreateBoardDialog';

interface BoardsListProps {
  projectId: string;
  initialBoards?: any[];
}

export function BoardsList({ projectId, initialBoards }: BoardsListProps) {
  const queryClient = useQueryClient();
  const [editingBoard, setEditingBoard] = useState<{
    id: string;
    name: string;
    background?: string;
  } | null>(null);
  const [deletingBoard, setDeletingBoard] = useState<{ id: string; name: string } | null>(null);
  const { can, isLoading: permsLoading } = usePermissions();
  const canUpdateBoard = permsLoading ? false : can('board.update');
  const canDeleteBoard = permsLoading ? false : can('board.delete');

  const { data: boards } = useQuery({
    queryKey: ['boards', projectId],
    queryFn: async () => {
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

  const { handleOpenChange: handleEditOpenChange, requestClose: requestEditClose } = useDialogClose(
    {
      isOpen: !!editingBoard,
      onClose: () => setEditingBoard(null),
    }
  );

  const { handleOpenChange: handleDeleteOpenChange, requestClose: requestDeleteClose } =
    useDialogClose({
      isOpen: !!deletingBoard,
      onClose: () => setDeletingBoard(null),
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
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/10 pointer-events-none" />

                <div className="relative z-10 flex items-center justify-between">
                  <span className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-2xs">
                    <Kanban className="w-3.5 h-3.5" />
                  </span>
                </div>

                <div className="relative z-10">
                  <Tooltip content={board.name} side="bottom">
                    <h3 className="text-white text-base font-bold truncate pr-6 drop-shadow-xs group-hover:translate-x-0.5 transition-transform">
                      {board.name}
                    </h3>
                  </Tooltip>
                </div>
              </Card>
            </Link>

            {(canUpdateBoard || canDeleteBoard) && (
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
                    {canUpdateBoard && (
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
                    )}
                    {canUpdateBoard && canDeleteBoard && <DropdownMenuSeparator />}
                    {canDeleteBoard && (
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
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        );
      })}

      <CreateBoardDialog projectId={projectId} />

      {/* Edit Board Dialog */}
      {editingBoard && canUpdateBoard && (
        <Dialog open={!!editingBoard} onOpenChange={handleEditOpenChange}>
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
                <Button type="button" variant="ghost" size="sm" onClick={requestEditClose}>
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
        <Dialog open={!!deletingBoard} onOpenChange={handleDeleteOpenChange}>
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
                <Button type="button" variant="ghost" size="sm" onClick={requestDeleteClose}>
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
