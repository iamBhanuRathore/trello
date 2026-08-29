import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Palette,
  Search,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';

const PRESET_COLORS = [
  { color: '#ef4444', name: 'Red' },
  { color: '#f97316', name: 'Orange' },
  { color: '#f59e0b', name: 'Amber' },
  { color: '#84cc16', name: 'Lime' },
  { color: '#10b981', name: 'Emerald' },
  { color: '#06b6d4', name: 'Cyan' },
  { color: '#3b82f6', name: 'Blue' },
  { color: '#6366f1', name: 'Indigo' },
  { color: '#8b5cf6', name: 'Violet' },
  { color: '#ec4899', name: 'Pink' },
  { color: '#14b8a6', name: 'Teal' },
  { color: '#64748b', name: 'Slate' },
];

interface BoardLabel { id: string; boardId: string; name: string; color: string; }
interface Board { id: string; name: string; }

function LabelPill({ label }: { label: BoardLabel }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
      style={{ backgroundColor: label.color + '18', color: label.color, borderColor: label.color + '35' }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
      {label.name}
    </span>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {PRESET_COLORS.map(({ color, name }) => (
        <button key={color} type="button" title={name} onClick={() => onChange(color)}
          className={'w-7 h-7 rounded-lg transition-all flex items-center justify-center cursor-pointer ' + (value === color ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110 shadow-md' : 'hover:scale-110 opacity-80 hover:opacity-100')}
          style={{ backgroundColor: color }}
        >
          {value === color && <Check className="w-3.5 h-3.5 text-white stroke-[3] drop-shadow" />}
        </button>
      ))}
    </div>
  );
}

export function LabelsAdmin() {
  const queryClient = useQueryClient();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [boardSearch, setBoardSearch] = useState('');
  const [labelSearch, setLabelSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[4].color);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: boardsRaw = [] } = useQuery<Board[]>({
    queryKey: ['admin-boards-all'],
    queryFn: async () => {
      const ws = await api.get('/workspaces');
      const workspaces: any[] = ws.data || [];
      const allBoards: Board[] = [];
      await Promise.allSettled(
        workspaces.map(async (w: any) => {
          const projs = await api.get('/projects?workspaceId=' + w.id);
          const projects: any[] = projs.data || [];
          await Promise.allSettled(
            projects.map(async (p: any) => {
              const bds = await api.get('/boards?projectId=' + p.id);
              const bArr: any[] = bds.data || [];
              bArr.forEach((b) => allBoards.push({ id: b.id, name: b.name }));
            })
          );
        })
      );
      return allBoards;
    },
  });

  const filteredBoards = useMemo(() => {
    const q = boardSearch.toLowerCase().trim();
    return q ? boardsRaw.filter((b) => b.name.toLowerCase().includes(q)) : boardsRaw;
  }, [boardsRaw, boardSearch]);

  const { data: boardLabels = [], isLoading: labelsLoading } = useQuery<BoardLabel[]>({
    queryKey: ['boardLabels', selectedBoardId],
    queryFn: async () => (await api.get('/boards/' + selectedBoardId + '/labels')).data,
    enabled: !!selectedBoardId,
  });

  const filteredLabels = useMemo(() => {
    const q = labelSearch.toLowerCase().trim();
    return q ? boardLabels.filter((l) => l.name.toLowerCase().includes(q)) : boardLabels;
  }, [boardLabels, labelSearch]);

  const createMutation = useMutation({
    mutationFn: () => api.post('/boards/' + selectedBoardId + '/labels', { name: newName.trim(), color: newColor }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boardLabels', selectedBoardId] });
      setNewName(''); setNewColor(PRESET_COLORS[4].color); setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color: string }) =>
      api.patch('/boards/' + selectedBoardId + '/labels/' + id, { name, color }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['boardLabels', selectedBoardId] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete('/boards/' + selectedBoardId + '/labels/' + id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['boardLabels', selectedBoardId] }); setDeletingId(null); },
  });

  const selectedBoard = boardsRaw.find((b) => b.id === selectedBoardId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-primary/10 text-primary"><Tag className="h-5 w-5" /></div>
            <h1 className="text-2xl font-bold tracking-tight">Labels &amp; Tags</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Manage labels and tags across all your boards from one central place. Labels help categorise tasks and are shown on cards.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/60 bg-muted/30">
              <h2 className="text-sm font-semibold text-foreground mb-3">Select a Board</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input placeholder="Search boards..." className="pl-8 h-8 text-xs bg-background" value={boardSearch} onChange={(e) => setBoardSearch(e.target.value)} />
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-border/40">
              {filteredBoards.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">No boards found</p>
              ) : filteredBoards.map((board) => (
                <button key={board.id} type="button" onClick={() => { setSelectedBoardId(board.id); setShowCreate(false); setEditingId(null); }}
                  className={'w-full flex items-center justify-between px-4 py-3 text-left transition-all cursor-pointer group ' + (selectedBoardId === board.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground')}
                >
                  <span className="text-sm font-medium truncate">{board.name}</span>
                  <ChevronRight className={'w-4 h-4 shrink-0 transition-colors ' + (selectedBoardId === board.id ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground')} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {!selectedBoardId ? (
            <div className="h-full min-h-[360px] flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20">
              <div className="text-center p-8 space-y-2">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3"><Tag className="w-6 h-6 text-primary" /></div>
                <p className="text-sm font-medium text-foreground">Select a board</p>
                <p className="text-xs text-muted-foreground">Choose a board from the left panel to manage its labels</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border/60 bg-muted/30 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{selectedBoard?.name} — Labels</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{boardLabels.length} label{boardLabels.length !== 1 ? 's' : ''} defined</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input placeholder="Search labels..." className="pl-8 h-8 text-xs w-44 bg-background" value={labelSearch} onChange={(e) => setLabelSearch(e.target.value)} />
                  </div>
                  <Button size="sm" className="gap-1.5 h-8 text-xs cursor-pointer" onClick={() => { setShowCreate(true); setEditingId(null); }}>
                    <Plus className="w-3.5 h-3.5" /> New Label
                  </Button>
                </div>
              </div>

              {showCreate && (
                <div className="p-4 border-b border-border/60 bg-primary/5 space-y-3 animate-in fade-in-50 duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Palette className="w-4 h-4 text-primary" />Create New Label</div>
                    <button type="button" onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border/60">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase">Preview:</span>
                    <LabelPill label={{ id: 'p', boardId: '', name: newName.trim() || 'Label Name', color: newColor }} />
                  </div>
                  <Input placeholder="Label name (e.g. Frontend, High Priority)..." className="h-9 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) createMutation.mutate(); }} autoFocus />
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Color</span>
                    <ColorPicker value={newColor} onChange={setNewColor} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="flex-1 text-xs cursor-pointer" onClick={() => setShowCreate(false)}>Cancel</Button>
                    <Button size="sm" className="flex-1 text-xs cursor-pointer" disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
                      {createMutation.isPending ? 'Creating...' : 'Create Label'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/40">
                {labelsLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading labels...</div>
                ) : filteredLabels.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <Tag className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                    <p className="text-sm text-muted-foreground">No labels yet</p>
                    <p className="text-xs text-muted-foreground/70">Click "New Label" above to create the first label for this board.</p>
                  </div>
                ) : filteredLabels.map((label) => (
                  <div key={label.id} className="px-4 py-3">
                    {editingId === label.id ? (
                      <div className="space-y-3 animate-in fade-in-50 duration-150">
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/60">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase">Preview:</span>
                          <LabelPill label={{ ...label, name: editName || label.name, color: editColor }} />
                        </div>
                        <Input className="h-8 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                        <ColorPicker value={editColor} onChange={setEditColor} />
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs cursor-pointer" onClick={() => setEditingId(null)}>Cancel</Button>
                          <Button size="sm" className="flex-1 h-7 text-xs cursor-pointer" disabled={!editName.trim() || updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: label.id, name: editName.trim(), color: editColor })}>
                            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </div>
                      </div>
                    ) : deletingId === label.id ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/25 animate-in fade-in-50 duration-150">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-destructive">Delete "{label.name}"?</p>
                          <p className="text-[11px] text-muted-foreground">This removes it from all cards it is attached to.</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs cursor-pointer" onClick={() => setDeletingId(null)}>Cancel</Button>
                          <Button variant="destructive" size="sm" className="h-7 px-2 text-xs cursor-pointer" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(label.id)}>
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 group">
                        <LabelPill label={label} />
                        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer" title="Edit label"
                            onClick={() => { setEditingId(label.id); setEditName(label.name); setEditColor(label.color); setDeletingId(null); setShowCreate(false); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer" title="Delete label"
                            onClick={() => { setDeletingId(label.id); setEditingId(null); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
