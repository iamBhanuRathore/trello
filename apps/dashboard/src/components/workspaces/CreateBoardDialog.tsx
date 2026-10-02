import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { Plus, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { useDialogClose } from '../../hooks/useDialogClose';
import { usePermissions } from '../../hooks/usePermissions';
import { BOARD_GRADIENTS } from './types';

interface CreateBoardDialogProps {
  projectId: string;
}

export function CreateBoardDialog({ projectId }: CreateBoardDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(BOARD_GRADIENTS[0].value);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { can, isLoading: permsLoading } = usePermissions();
  const canCreateBoard = permsLoading ? false : can('board.create');

  const { handleOpenChange, requestClose } = useDialogClose({
    isOpen: open,
    onClose: () => {
      setName('');
      setOpen(false);
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await api.post('/boards', {
        projectId,
        name: name.trim(),
        background: selectedGradient,
      });
      setName('');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['boards', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hidden entirely — a disabled "create" tile serves no purpose.
  if (!canCreateBoard) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <Button type="button" variant="ghost" size="sm" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Board'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
