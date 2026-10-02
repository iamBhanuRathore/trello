import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { Plus } from 'lucide-react';
import { api, getApiErrorMessage } from '../../lib/api';
import { useDialogClose } from '../../hooks/useDialogClose';
import { usePermissions } from '../../hooks/usePermissions';

interface CreateProjectDialogProps {
  workspaceId: string;
}

export function CreateProjectDialog({ workspaceId }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();
  const { can, isLoading: permsLoading } = usePermissions();
  const canCreateProject = permsLoading ? false : can('project.create');

  const { handleOpenChange, requestClose } = useDialogClose({
    isOpen: open,
    onClose: () => {
      setName('');
      setOpen(false);
    },
  });

  // Radix open events come only from the DialogTrigger — apply them directly.
  // Close gestures stay on the single close path (idempotent requestClose).
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setOpen(true);
    else handleOpenChange(nextOpen);
  };

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
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to create project. Please try again.'));
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  };

  // Hidden entirely when the create affordance itself isn't allowed.
  if (!canCreateProject) return null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
