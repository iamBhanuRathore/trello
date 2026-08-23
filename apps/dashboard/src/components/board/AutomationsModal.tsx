import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { Plus, Trash, Zap } from 'lucide-react';
import { Button } from '@boardly/ui/button';

interface AutomationsModalProps {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
  lists: any[];
}

export function AutomationsModal({ boardId, isOpen, onClose, lists }: AutomationsModalProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);

  // Rule builder state
  const [triggerListId, setTriggerListId] = useState('');
  const [actionType, setActionType] = useState('add_label');
  const [actionValue, setActionValue] = useState('');

  const { data: automations = [] } = useQuery({
    queryKey: ['automations', boardId],
    queryFn: async () => (await api.get(`/boards/${boardId}/automations`)).data,
    enabled: isOpen,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['org-users'],
    queryFn: async () => (await api.get(`/users`)).data, // Simple fetch all users for MVP
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.post(`/boards/${boardId}/automations`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', boardId] });
      setIsAdding(false);
      setTriggerListId('');
      setActionValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/boards/${boardId}/automations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', boardId] });
    },
  });

  const handleCreate = () => {
    if (!triggerListId || !actionValue) return;

    const listName = lists.find((l) => l.id === triggerListId)?.name || 'Unknown List';

    createMutation.mutate({
      name: `When card moved to ${listName}, then ${actionType.replace('_', ' ')}`,
      triggerJson: {
        type: 'card_moved',
        listId: triggerListId,
      },
      actionJson: {
        type: actionType,
        [actionType === 'add_label' ? 'labelId' : 'userId']: actionValue,
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Board Automations
          </DialogTitle>
          <DialogDescription>
            Create rules to automate actions when cards are moved on this board.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Active Rules</h3>
            <Button size="sm" onClick={() => setIsAdding(!isAdding)}>
              {isAdding ? (
                'Cancel'
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" /> New Rule
                </>
              )}
            </Button>
          </div>

          {isAdding && (
            <div className="bg-muted/30 p-4 rounded-md border space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">WHEN</span>
                <span>a card is moved to</span>
                <select
                  className="h-8 rounded border px-2 bg-background"
                  value={triggerListId}
                  onChange={(e) => setTriggerListId(e.target.value)}
                >
                  <option value="">Select List...</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">THEN</span>
                <select
                  className="h-8 rounded border px-2 bg-background"
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                >
                  <option value="add_label">Add Label</option>
                  <option value="assign_user">Assign User</option>
                </select>

                {actionType === 'add_label' ? (
                  <input
                    type="text"
                    placeholder="Enter Label ID (UUID)"
                    className="h-8 rounded border px-2 bg-background flex-1"
                    value={actionValue}
                    onChange={(e) => setActionValue(e.target.value)}
                  />
                ) : (
                  <select
                    className="h-8 rounded border px-2 bg-background flex-1"
                    value={actionValue}
                    onChange={(e) => setActionValue(e.target.value)}
                  >
                    <option value="">Select User...</option>
                    {users.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!triggerListId || !actionValue || createMutation.isPending}
                >
                  Save Rule
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {automations.length === 0 && !isAdding && (
              <div className="text-center py-8 text-muted-foreground border rounded-md border-dashed">
                No automations configured yet.
              </div>
            )}

            {automations.map((auto: any) => (
              <div
                key={auto.id}
                className="flex justify-between items-center p-3 border rounded-md bg-card shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{auto.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive h-8 w-8 hover:bg-destructive/10"
                  onClick={() => deleteMutation.mutate(auto.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
