import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trashService, type TrashedItem } from '../../lib/trashService';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import {
  Trash2,
  RotateCcw,
  Search,
  Building2,
  Folder,
  Layout,
  CheckSquare,
  Clock,
  AlertTriangle,
  Sparkles,
  Check,
  Info,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TrashBinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TrashBinModal: React.FC<TrashBinModalProps> = ({ open, onOpenChange }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'workspace' | 'project' | 'board' | 'card'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const [itemToDeleteForever, setItemToDeleteForever] = useState<TrashedItem | null>(null);
  const [restoredToast, setRestoredToast] = useState<string | null>(null);

  // Queries
  const { data: trashedItems = [], isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: trashService.getTrash,
    enabled: open,
  });

  // Mutations
  const restoreMutation = useMutation({
    mutationFn: (item: TrashedItem) => trashService.restoreItem(item.itemType, item.id),
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      setRestoredToast(`Restored "${item.name}"`);
      setTimeout(() => setRestoredToast(null), 3000);
    },
  });

  const deleteForeverMutation = useMutation({
    mutationFn: (item: TrashedItem) => trashService.deleteForever(item.itemType, item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      setItemToDeleteForever(null);
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: trashService.emptyTrash,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      setConfirmEmptyOpen(false);
    },
  });

  // Filtered items
  const filteredItems = useMemo(() => {
    return trashedItems.filter((item) => {
      const matchesTab = activeTab === 'all' || item.itemType === activeTab;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.locationInfo && item.locationInfo.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesTab && matchesSearch;
    });
  }, [trashedItems, activeTab, searchQuery]);

  // Counts
  const workspaceCount = trashedItems.filter((i) => i.itemType === 'workspace').length;
  const projectCount = trashedItems.filter((i) => i.itemType === 'project').length;
  const boardCount = trashedItems.filter((i) => i.itemType === 'board').length;
  const cardCount = trashedItems.filter((i) => i.itemType === 'card').length;

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'workspace':
        return <Building2 className="w-4 h-4 text-indigo-500" />;
      case 'project':
        return <Folder className="w-4 h-4 text-amber-500" />;
      case 'board':
        return <Layout className="w-4 h-4 text-sky-500" />;
      case 'card':
        return <CheckSquare className="w-4 h-4 text-emerald-500" />;
      default:
        return <Trash2 className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl w-[92vw] max-h-[85vh] p-0 overflow-hidden flex flex-col bg-card border border-border rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>Trash & Recycle Bin</span>
                  <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    {trashedItems.length} {trashedItems.length === 1 ? 'item' : 'items'}
                  </span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Items in trash are automatically purged after 30 days.
                </p>
              </div>
            </div>

            {trashedItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 gap-1.5 self-start sm:self-auto"
                onClick={() => setConfirmEmptyOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Empty Trash
              </Button>
            )}
          </div>

          {/* Info Banner & Search/Filter Controls */}
          <div className="p-4 border-b border-border space-y-3 bg-card">
            {restoredToast && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <Check className="w-4 h-4 shrink-0" />
                <span className="font-medium">{restoredToast}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search deleted items..."
                  className="pl-9 h-9 text-xs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto p-1 bg-muted/40 rounded-xl border border-border">
                <button
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'all'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('all')}
                >
                  All ({trashedItems.length})
                </button>
                <button
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'workspace'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('workspace')}
                >
                  Workspaces ({workspaceCount})
                </button>
                <button
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'project'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('project')}
                >
                  Projects ({projectCount})
                </button>
                <button
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'board'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('board')}
                >
                  Boards ({boardCount})
                </button>
                <button
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'card'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('card')}
                >
                  Tasks ({cardCount})
                </button>
              </div>
            </div>
          </div>

          {/* List of Trashed Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {isLoading ? (
              <div className="p-12 text-center text-xs text-muted-foreground">
                Loading trash items...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">Trash is empty</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {searchQuery
                    ? 'No deleted items match your search query.'
                    : 'No deleted items currently in the recycle bin.'}
                </p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={`${item.itemType}-${item.id}`}
                  className="p-3.5 sm:px-5 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-muted/50 border border-border/80 shrink-0">
                      {getItemIcon(item.itemType)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-2 truncate">
                        <span className="truncate">{item.name}</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/60 shrink-0">
                          {item.itemType}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        {item.locationInfo && (
                          <span className="truncate max-w-[200px]">{item.locationInfo}</span>
                        )}
                        <span>•</span>
                        <span>
                          Deleted {formatDistanceToNow(new Date(item.deletedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Days remaining */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Days Left Badge */}
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border hidden sm:inline-flex items-center gap-1 ${
                        item.daysRemaining <= 5
                          ? 'bg-destructive/10 text-destructive border-destructive/25'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {item.daysRemaining} {item.daysRemaining === 1 ? 'day' : 'days'} left
                    </span>

                    {/* Restore Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 hover:bg-primary hover:text-primary-foreground transition-all"
                      disabled={restoreMutation.isPending}
                      onClick={() => restoreMutation.mutate(item)}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden xs:inline">Restore</span>
                    </Button>

                    {/* Delete Forever Button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setItemToDeleteForever(item)}
                      title="Delete forever"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground px-5">
            <span className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> Restoring an item immediately brings back its child cards and lists.
            </span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm Delete Forever Dialog ─── */}
      {itemToDeleteForever && (
        <Dialog open={!!itemToDeleteForever} onOpenChange={() => setItemToDeleteForever(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Permanently Delete Item
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>
                Are you sure you want to permanently purge{' '}
                <strong className="text-foreground">{itemToDeleteForever.name}</strong>?
              </p>
              <p className="text-destructive font-medium">
                This action is irreversible and cannot be undone. All child data will be permanently wiped.
              </p>
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setItemToDeleteForever(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteForeverMutation.isPending}
                  onClick={() => deleteForeverMutation.mutate(itemToDeleteForever)}
                >
                  {deleteForeverMutation.isPending ? 'Purging...' : 'Delete Forever'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Confirm Empty Trash Dialog ─── */}
      {confirmEmptyOpen && (
        <Dialog open={confirmEmptyOpen} onOpenChange={setConfirmEmptyOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Empty Entire Trash
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>
                Are you sure you want to permanently purge all <strong className="text-foreground">{trashedItems.length} items</strong> in the recycle bin?
              </p>
              <p className="text-destructive font-medium">
                This cannot be undone. All deleted workspaces, projects, boards, and tasks will be permanently removed.
              </p>
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setConfirmEmptyOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={emptyTrashMutation.isPending}
                  onClick={() => emptyTrashMutation.mutate()}
                >
                  {emptyTrashMutation.isPending ? 'Emptying...' : 'Empty Trash'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
