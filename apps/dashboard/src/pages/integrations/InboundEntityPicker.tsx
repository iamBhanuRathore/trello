import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import type { ApiModuleId } from '@boardly/shared-types';
import { QueryError } from '../../components/common/QueryError';

interface TreeBoard {
  id: string;
  name: string;
  projectId: string;
}
interface TreeProject {
  id: string;
  name: string;
  workspaceId: string;
  boards: TreeBoard[];
}
interface TreeWorkspace {
  id: string;
  name: string;
  projects: TreeProject[];
}

interface Props {
  module: ApiModuleId;
  value: string | null;
  onChange: (value: string | null) => void;
}

/**
 * Contextual destination picker: workspace → project → board → list → card.
 * Only the level required by the target module is shown.
 */
export function InboundEntityPicker({ module, value, onChange }: Props) {
  const {
    data: tree = [],
    isError: treeError,
    refetch: refetchTree,
  } = useQuery<TreeWorkspace[]>({
    queryKey: ['workspace-tree'],
    queryFn: async () => (await api.get('/workspaces/tree')).data,
  });

  const [workspaceId, setWorkspaceId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [listId, setListId] = useState('');

  const projects = useMemo(
    () => tree.find((w) => w.id === workspaceId)?.projects ?? [],
    [tree, workspaceId]
  );
  const boards = useMemo(
    () => projects.find((p) => p.id === projectId)?.boards ?? [],
    [projects, projectId]
  );

  const {
    data: lists = [],
    isError: listsError,
    refetch: refetchLists,
  } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['lists', boardId],
    queryFn: async () => (await api.get('/lists', { params: { boardId } })).data,
    enabled: !!boardId,
  });

  const {
    data: cards = [],
    isError: cardsError,
    refetch: refetchCards,
  } = useQuery<Array<{ id: string; title: string; key?: string }>>({
    queryKey: ['cards', listId],
    queryFn: async () => (await api.get('/cards', { params: { listId } })).data,
    enabled: !!listId,
  });

  const selectWorkspace = (id: string) => {
    setWorkspaceId(id);
    setProjectId('');
    setBoardId('');
    setListId('');
    // Projects use the workspace itself as their default reference.
    onChange(module === 'projects' ? id : null);
  };
  const selectProject = (id: string) => {
    setProjectId(id);
    setBoardId('');
    setListId('');
    onChange(module === 'boards' ? id : null);
  };
  const selectBoard = (id: string) => {
    setBoardId(id);
    setListId('');
    onChange(null);
  };
  const selectList = (id: string) => {
    setListId(id);
    onChange(module === 'cards' ? id : null);
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">
        Default destination (optional — payload values win)
      </p>
      {treeError ? (
        <QueryError
          compact
          message="Couldn't load workspaces."
          onRetry={() => void refetchTree()}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={workspaceId} onValueChange={selectWorkspace}>
            <SelectTrigger className="h-9 text-xs" aria-label="Workspace">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {tree.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {module !== 'projects' && (
            <Select value={projectId} onValueChange={selectProject} disabled={!workspaceId}>
              <SelectTrigger className="h-9 text-xs" aria-label="Project">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(module === 'cards' || module === 'comments') && (
            <Select value={boardId} onValueChange={selectBoard} disabled={!projectId}>
              <SelectTrigger className="h-9 text-xs" aria-label="Board">
                <SelectValue placeholder="Select board" />
              </SelectTrigger>
              <SelectContent>
                {boards.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(module === 'cards' || module === 'comments') && (
            <Select value={listId} onValueChange={selectList} disabled={!boardId}>
              <SelectTrigger className="h-9 text-xs" aria-label="List">
                <SelectValue placeholder="Select list" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {module === 'comments' && (
            <Select
              value={value ?? ''}
              onValueChange={(v) => onChange(v || null)}
              disabled={!listId}
            >
              <SelectTrigger className="h-9 text-xs" aria-label="Card">
                <SelectValue placeholder="Select card" />
              </SelectTrigger>
              <SelectContent>
                {cards.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.key ? `${c.key} · ` : ''}
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {listsError && boardId && (
        <QueryError compact message="Couldn't load lists." onRetry={() => void refetchLists()} />
      )}
      {cardsError && listId && (
        <QueryError compact message="Couldn't load cards." onRetry={() => void refetchCards()} />
      )}
      {module === 'cards' && (
        <p className="text-[11px] text-muted-foreground">
          Selected list: <span className="font-mono">{value ?? 'none'}</span>
        </p>
      )}
      {module === 'boards' && (
        <p className="text-[11px] text-muted-foreground">
          Selected project: <span className="font-mono">{value ?? 'none'}</span>
        </p>
      )}
      {module === 'projects' && (
        <p className="text-[11px] text-muted-foreground">
          Selected workspace: <span className="font-mono">{value ?? 'none'}</span>
        </p>
      )}
    </div>
  );
}
