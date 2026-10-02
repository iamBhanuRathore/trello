import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { api } from '../../lib/api';
import { useDialogClose } from '../../hooks/useDialogClose';

interface CreateProjectDialogProps {
  workspaceId: string;
}

export function CreateProjectDialog({ workspaceId }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();

  const { handleOpenChange, requestClose } = useDialogClose({
    isOpen: open,
    onClose: () => {
      setName('');
      setOpen(false);
    },
  });

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
