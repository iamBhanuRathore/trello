import { useState, useRef } from 'react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Card } from '@boardly/ui/card';
import { Plus } from 'lucide-react';
import { useOptimisticMutation } from '../../../lib/useOptimisticMutation';
import { api } from '../../../lib/api';
import { usePermissions } from '../../../hooks/usePermissions';
import type { KanbanList } from './types';

interface AddListFormProps {
  boardId: string;
  onAdd: () => void;
  onAddList: (temp: KanbanList) => void;
  onReplaceList: (tempId: string, serverList: KanbanList) => void;
  onRemoveList: (tempId: string) => void;
}

export function AddListForm({
  boardId,
  onAdd,
  onAddList,
  onReplaceList,
  onRemoveList,
}: AddListFormProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const pendingTempId = useRef<string | null>(null);
  const { can, isLoading: permsLoading } = usePermissions();
  const canCreateList = permsLoading ? false : can('list.create');

  const addListMutation = useOptimisticMutation<any, { name: string }>(
    async (payload) => (await api.post('/lists', { boardId, name: payload.name })).data,
    {
      queryKeys: [['board', 'full', boardId]],
      applyOptimistic: (payload) => {
        pendingTempId.current = `temp-${Date.now()}`;
        onAddList({
          id: pendingTempId.current,
          name: payload.name,
          position: Number.MAX_SAFE_INTEGER,
          cards: [],
        });
      },
      onSuccessExtra: (serverList) => {
        if (pendingTempId.current)
          onReplaceList(pendingTempId.current, { ...serverList, cards: [] });
        pendingTempId.current = null;
        // Refresh after the temp row is swapped so a stale refetch can't wipe it.
        onAdd();
      },
      onErrorExtra: (payload) => {
        if (pendingTempId.current) onRemoveList(pendingTempId.current);
        pendingTempId.current = null;
        if (payload?.name) setName(payload.name);
      },
      errorMessage: 'Failed to create list. Please try again.',
    }
  );

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!canCreateList || !trimmed || addListMutation.isPending) return;
    addListMutation.mutate({ name: trimmed });
    setName('');
    setAdding(false);
  };

  // Hidden entirely — a disabled "add list" affordance serves no purpose.
  if (!canCreateList) return null;

  return (
    <div className="w-[85vw] max-w-72 sm:w-72 flex-shrink-0">
      {adding ? (
        <Card className="p-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name..."
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!name.trim() || addListMutation.isPending}
            >
              {addListMutation.isPending ? 'Adding…' : 'Add List'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          variant="outline"
          className="w-full justify-start bg-background/50 backdrop-blur cursor-pointer"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-2 w-4 h-4" /> Add another list
        </Button>
      )}
    </div>
  );
}
