import { useState } from 'react';
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

  const { handleOpenChange, requestClose } = useDialogClose({
    isOpen: dialogOpen,
    onClose: () => {
      setName('');
      setDialogOpen(false);
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await api.post('/workspaces', { name: name.trim() });
      setName('');
      setDialogOpen(false);
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
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
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Workspace'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
