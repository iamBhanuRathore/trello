import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trashService, type TrashedItem } from '../../lib/trashService';
import { Dialog, DialogContent, DialogTitle } from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { QueryError } from '../common/QueryError';
import { toast } from 'sonner';
import {
  Trash2,
  RotateCcw,
  Search,
  Building2,
  Folder,
  Layout,
  CheckSquare,
  Clock,
  Sparkles,
  Info,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDialogClose } from '../../hooks/useDialogClose';

interface TrashBinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TrashBinModal: React.FC<TrashBinModalProps> = ({ open, onOpenChange }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'workspace' | 'project' | 'board' | 'card'>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const [itemToDeleteForever, setItemToDeleteForever] = useState<TrashedItem | null>(null);
  const [itemToRestore, setItemToRestore] = useState<TrashedItem | null>(null);

  // Nested confirms, each on the same contract. The bin's own Escape handler
  // stands down while any of these is open (see handleEscape above).
  const { handleOpenChange: restoreConfirmClose } = useDialogClose({
    isOpen: itemToRestore !== null,
    onClose: () => setItemToRestore(null),
  });

  const { handleOpenChange: deleteForeverClose } = useDialogClose({
    isOpen: itemToDeleteForever !== null,
    onClose: () => setItemToDeleteForever(null),
  });

  const { handleOpenChange: emptyTrashClose } = useDialogClose({
    isOpen: confirmEmptyOpen,
    onClose: () => setConfirmEmptyOpen(false),
  });

  // Single close path (AGENTS.md §11): X, backdrop and Esc all funnel through
  // requestClose, which fires the caller's onOpenChange at most once per open
  // session instead of once per gesture.
  const { requestClose, handleOpenChange } = useDialogClose({
    isOpen: open,
    onClose: () => onOpenChange(false),
    // Nested confirm dialogs own the Escape key while they are open. Our Esc
    // listener is capture-phase, so without standing down a single Esc would
    // dismiss the confirm AND the bin behind it.
    handleEscape: !itemToRestore && !itemToDeleteForever && !confirmEmptyOpen,
  });

  // Queries
  const {
    data: trashedItems = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast.success(`Successfully restored "${item.name}"`);
      setItemToRestore(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to restore item');
    },
  });

  const deleteForeverMutation = useMutation({
    mutationFn: (item: TrashedItem) => trashService.deleteForever(item.itemType, item.id),
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success(`Permanently deleted "${item.name}"`);
      setItemToDeleteForever(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to permanently delete item');
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: trashService.emptyTrash,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Recycle bin emptied successfully');
      setConfirmEmptyOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to empty recycle bin');
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

  const getItemTypeName = (type: string) => {
    switch (type) {
      case 'workspace':
        return 'Workspace';
      case 'project':
        return 'Project';
      case 'board':
        return 'Board';
      case 'card':
        return 'Task Card';
      default:
        return 'Item';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-3xl w-[94vw] max-h-[85vh] p-0 overflow-hidden flex flex-col bg-card border border-border/80 rounded-2xl shadow-2xl"
        >
          {/* ─── Header ─── */}
          <div className="p-4 sm:p-5 border-b border-border/70 bg-muted/20 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>Trash &amp; Recycle Bin</span>
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    {trashedItems.length} {trashedItems.length === 1 ? 'item' : 'items'}
                  </span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Items in trash are automatically purged after 30 days.</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {trashedItems.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 gap-1.5 h-8 cursor-pointer"
                  onClick={() => setConfirmEmptyOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Empty Trash</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                onClick={requestClose}
                title="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* ─── Search & Segmented Filter Tabs ─── */}
          <div className="p-4 border-b border-border/70 space-y-3 bg-card shrink-0">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search deleted items..."
                  className="pl-9 h-8.5 text-xs bg-muted/30 border-border/80 focus-visible:ring-primary/20"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Segmented Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto p-1 bg-muted/40 rounded-xl border border-border/80 shrink-0">
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('all')}
                >
                  All ({trashedItems.length})
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    activeTab === 'workspace'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('workspace')}
                >
                  Workspaces ({workspaceCount})
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    activeTab === 'project'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('project')}
                >
                  Projects ({projectCount})
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    activeTab === 'board'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('board')}
                >
                  Boards ({boardCount})
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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

          {/* ─── List of Trashed Items ─── */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {isLoading ? (
              <div className="py-16 text-center text-xs text-muted-foreground">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
                Loading trash items...
              </div>
            ) : isError && trashedItems.length === 0 ? (
              <QueryError
                message="Couldn't load trash. Check your connection and try again."
                onRetry={() => refetch()}
              />
            ) : filteredItems.length === 0 ? (
              <div className="py-16 text-center space-y-2 px-4">
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
                          <span className="truncate max-w-[240px]">{item.locationInfo}</span>
                        )}
                        <span>•</span>
                        <span>
                          Deleted{' '}
                          {formatDistanceToNow(new Date(item.deletedAt), { addSuffix: true })}
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

                    {/* Restore Button (Opens Confirmation) */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all cursor-pointer font-medium"
                      disabled={restoreMutation.isPending}
                      onClick={() => setItemToRestore(item)}
                      title={`Restore ${item.name}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Restore</span>
                    </Button>

                    {/* Delete Forever Button (Opens Confirmation) */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                      onClick={() => setItemToDeleteForever(item)}
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ─── Footer ─── */}
          <div className="p-3 border-t border-border/70 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground px-5 shrink-0">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>
                Restoring an item immediately brings back its child cards, boards, and lists.
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs cursor-pointer"
              onClick={requestClose}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm Restore Dialog ─── */}
      {itemToRestore && (
        <ConfirmDialog
          open={!!itemToRestore}
          onOpenChange={restoreConfirmClose}
          title={`Restore ${getItemTypeName(itemToRestore.itemType)}?`}
          description={`Are you sure you want to restore "${itemToRestore.name}"? It will immediately be reactivated and returned to your workspace along with all associated child elements.`}
          confirmLabel="Restore Item"
          cancelLabel="Cancel"
          variant="success"
          isLoading={restoreMutation.isPending}
          onConfirm={() => restoreMutation.mutateAsync(itemToRestore)}
        />
      )}

      {/* ─── Confirm Delete Forever Dialog ─── */}
      {itemToDeleteForever && (
        <ConfirmDialog
          open={!!itemToDeleteForever}
          onOpenChange={deleteForeverClose}
          title="Permanently Delete Item?"
          description={`Are you sure you want to permanently purge "${itemToDeleteForever.name}"? This action cannot be undone and all associated child data will be permanently wiped.`}
          confirmLabel="Delete Forever"
          cancelLabel="Cancel"
          variant="destructive"
          isLoading={deleteForeverMutation.isPending}
          onConfirm={() => deleteForeverMutation.mutateAsync(itemToDeleteForever)}
        />
      )}

      {/* ─── Confirm Empty Trash Dialog ─── */}
      {confirmEmptyOpen && (
        <ConfirmDialog
          open={confirmEmptyOpen}
          onOpenChange={emptyTrashClose}
          title="Empty Entire Recycle Bin?"
          description={`Are you sure you want to permanently purge all ${trashedItems.length} items in the recycle bin? All deleted workspaces, projects, boards, and tasks will be completely unrecoverable.`}
          confirmLabel="Empty Trash"
          cancelLabel="Cancel"
          variant="destructive"
          isLoading={emptyTrashMutation.isPending}
          onConfirm={() => emptyTrashMutation.mutateAsync()}
        />
      )}
    </>
  );
};
