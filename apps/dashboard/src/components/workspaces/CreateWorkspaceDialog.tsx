import { useState } from 'react';
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

interface CreateWorkspaceDialogProps {
  onSuccess: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateWorkspaceDialog({
  onSuccess,
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;

  const setDialogOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { can, isLoading: permsLoading } = usePermissions();
  const canCreateWorkspace = permsLoading ? false : can('workspace.create');

  const { handleOpenChange, requestClose } = useDialogClose({
    isOpen: dialogOpen,
    onClose: () => {
      setName('');
      setDialogOpen(false);
    },
  });

  // Radix open events come only from the DialogTrigger — apply them directly.
  // Close gestures stay on the single close path (idempotent requestClose).
  // handleOpenChange alone swallows opens, which left this button dead.
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDialogOpen(true);
    else handleOpenChange(nextOpen);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await api.post('/workspaces', { name: name.trim() });
      setName('');
      setDialogOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create workspace. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hidden entirely when the user lacks workspace.create — a create button
  // that can't act must not appear (same as CreateProject/CreateBoard).
  if (!canCreateWorkspace) return null;

  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
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
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? 'Creating...' : 'Create Workspace'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
