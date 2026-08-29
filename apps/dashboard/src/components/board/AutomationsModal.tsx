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
      <DialogContent className="sm:max-w-2xl max-h-[85vh] h-[85vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        {/* ─── Fixed Header ─── */}
        <DialogHeader className="p-5 sm:px-6 border-b border-border/80 bg-card/90 backdrop-blur-md shrink-0 space-y-1">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Zap className="h-5 w-5 text-amber-500" />
              Board Automations &amp; Rules
            </DialogTitle>
            <Button
              size="sm"
              variant={isAdding ? 'outline' : 'default'}
              onClick={() => setIsAdding(!isAdding)}
              className="text-xs gap-1.5 cursor-pointer"
            >
              {isAdding ? (
                'Cancel'
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> New Rule
                </>
              )}
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Create automated rules and trigger actions when cards move between lists.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Scrollable Body ─── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {isAdding && (
            <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-primary">WHEN</span>
                <span className="text-muted-foreground">a card is moved to</span>
                <select
                  className="h-8 rounded-lg border border-input px-2.5 bg-background text-xs text-foreground font-medium outline-none focus:ring-1 focus:ring-primary flex-1"
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

              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-primary">THEN</span>
                <select
                  className="h-8 rounded-lg border border-input px-2.5 bg-background text-xs text-foreground font-medium outline-none focus:ring-1 focus:ring-primary"
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                >
                  <option value="add_label">Add Label</option>
                  <option value="assign_user">Assign User</option>
                </select>

                {actionType === 'add_label' ? (
                  <input
                    type="text"
                    placeholder="Enter Label name / ID..."
                    className="h-8 rounded-lg border border-input px-2.5 bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary flex-1"
                    value={actionValue}
                    onChange={(e) => setActionValue(e.target.value)}
                  />
                ) : (
                  <select
                    className="h-8 rounded-lg border border-input px-2.5 bg-background text-xs text-foreground font-medium outline-none focus:ring-1 focus:ring-primary flex-1"
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

              <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsAdding(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!triggerListId || !actionValue || createMutation.isPending}
                  className="text-xs px-4"
                >
                  Save Rule
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Configured Rules</h3>
              <span className="text-[11px] text-muted-foreground">{automations.length} active</span>
            </div>

            {automations.length === 0 && !isAdding && (
              <div className="text-center py-12 text-muted-foreground border rounded-2xl border-dashed bg-card/20 space-y-2">
                <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <p className="text-xs font-medium">No automations configured yet.</p>
                <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                  Automations trigger actions like auto-assigning team members or adding labels when cards change lists.
                </p>
              </div>
            )}

            {automations.map((auto: any) => (
              <div
                key={auto.id}
                className="flex justify-between items-center p-3.5 border border-border rounded-xl bg-card hover:bg-muted/20 shadow-xs transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-foreground block">{auto.name}</span>
                    <span className="text-[10px] text-muted-foreground">Auto-triggered on card move</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive h-8 w-8 rounded-lg"
                  onClick={() => deleteMutation.mutate(auto.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Fixed Bottom Footer ─── */}
        <div className="p-4 sm:px-6 border-t border-border/80 bg-card/90 backdrop-blur-md shrink-0 flex items-center justify-end">
          <Button onClick={onClose} size="sm" className="px-6 cursor-pointer">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
