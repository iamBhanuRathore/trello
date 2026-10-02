import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { Plus, Workflow, FileText, Settings, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '../../../lib/api';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { usePermissions, permissionReason } from '../../../hooks/usePermissions';
import { PresenceAvatars, type PresenceUser } from '../PresenceAvatars';

interface BoardHeaderProps {
  board?: {
    id: string;
    name: string;
    projectId?: string;
  };
  boardId: string;
  presenceUsers: PresenceUser[];
  onCreateTask: () => void;
  onOpenForms: () => void;
  onOpenAutomations: () => void;
}

export function BoardHeader({
  board,
  boardId,
  presenceUsers,
  onCreateTask,
  onOpenForms,
  onOpenAutomations,
}: BoardHeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditingBoard, setIsEditingBoard] = useState(false);
  const [isDeletingBoard, setIsDeletingBoard] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');
  const { can, isLoading: permsLoading } = usePermissions();
  const canUpdateBoard = permsLoading ? false : can('board.update');
  const canDeleteBoard = permsLoading ? false : can('board.delete');
  const canCreateTask = permsLoading ? false : can('card.create');
  const canManageAutomations = permsLoading ? false : can('automation.manage');

  const editDialog = useDialogClose({
    isOpen: isEditingBoard,
    onClose: () => setIsEditingBoard(false),
  });

  const deleteDialog = useDialogClose({
    isOpen: isDeletingBoard,
    onClose: () => setIsDeletingBoard(false),
  });

  const deleteBoardMutation = useMutation({
    mutationFn: async () => await api.delete(`/boards/${boardId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate('/');
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to delete board. Please try again.'));
    },
  });

  const updateBoardMutation = useMutation({
    mutationFn: async (name: string) => await api.patch(`/boards/${boardId}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      setIsEditingBoard(false);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to rename board. Please try again.'));
    },
  });

  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">{board?.name || 'Loading...'}</h1>
        <PresenceAvatars users={presenceUsers} />
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex"
          title={canCreateTask ? undefined : permissionReason('card.create')}
        >
          <Button
            size="sm"
            className="h-8 text-xs font-semibold gap-1.5 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onCreateTask}
            disabled={!canCreateTask}
            aria-describedby={!canCreateTask ? 'create-task-perm' : undefined}
          >
            <Plus className="h-4 w-4" /> Create Task
          </Button>
        </span>
        <span id="create-task-perm" className="sr-only">
          {permissionReason('card.create')}
        </span>
        <span
          className="inline-flex"
          title={canUpdateBoard ? undefined : permissionReason('board.update')}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenForms}
            disabled={!canUpdateBoard}
            className="disabled:cursor-not-allowed"
            aria-describedby={!canUpdateBoard ? 'forms-perm' : undefined}
          >
            <FileText className="h-4 w-4 mr-1.5 text-primary" />
            Intake Forms
          </Button>
        </span>
        <span id="forms-perm" className="sr-only">
          {permissionReason('board.update')}
        </span>
        <span
          className="inline-flex"
          title={canManageAutomations ? undefined : permissionReason('automation.manage')}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAutomations}
            disabled={!canManageAutomations}
            className="disabled:cursor-not-allowed"
            aria-describedby={!canManageAutomations ? 'automations-perm' : undefined}
          >
            <Workflow className="h-4 w-4 mr-1.5" />
            Automations
          </Button>
        </span>
        <span id="automations-perm" className="sr-only">
          {permissionReason('automation.manage')}
        </span>

        {/* Board Settings Dropdown — hidden entirely when nothing inside is allowed */}
        {(canUpdateBoard || canDeleteBoard) && (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Board Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canUpdateBoard && (
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-xs"
                  onClick={() => {
                    setEditBoardName(board?.name || '');
                    setIsEditingBoard(true);
                  }}
                >
                  <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename Board
                </DropdownMenuItem>
              )}
              {canUpdateBoard && canDeleteBoard && <DropdownMenuSeparator />}
              {canDeleteBoard && (
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer gap-2 text-xs"
                  onClick={() => setIsDeletingBoard(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Board
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Edit Board Dialog */}
      {isEditingBoard && canUpdateBoard && (
        <Dialog open={isEditingBoard} onOpenChange={editDialog.handleOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename Board</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editBoardName.trim()) {
                  updateBoardMutation.mutate(editBoardName.trim());
                }
              }}
              className="space-y-4 py-2"
            >
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Board Name</Label>
                <Input
                  value={editBoardName}
                  onChange={(e) => setEditBoardName(e.target.value)}
                  placeholder="e.g. Core Web App Sprint"
                  className="h-9 text-xs"
                  autoFocus
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={editDialog.requestClose}>
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
      {isDeletingBoard && canDeleteBoard && (
        <Dialog open={isDeletingBoard} onOpenChange={deleteDialog.handleOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" /> Delete Board
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>
                Are you sure you want to delete board{' '}
                <strong className="text-foreground">{board?.name}</strong>?
              </p>
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
                <p className="font-semibold">This board will be moved to Trash.</p>
                <p>
                  All lists, cards, checklist items, and comments will be moved to the Recycle Bin
                  and automatically purged after 30 days. You can restore them from Trash before
                  then.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={deleteDialog.requestClose}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteBoardMutation.isPending}
                  onClick={() => deleteBoardMutation.mutate()}
                >
                  {deleteBoardMutation.isPending ? 'Deleting...' : 'Permanently Delete Board'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
