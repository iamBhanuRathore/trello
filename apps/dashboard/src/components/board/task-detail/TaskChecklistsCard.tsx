import React, { useState } from 'react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import {
  ListChecks,
  Plus,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  Edit3,
  Trash2,
} from 'lucide-react';

interface TaskChecklistsCardProps {
  checklists: any[];
  onToggleItem: (itemId: string, isDone: boolean) => void;
  onDeleteItem: (itemId: string) => void;
  onSaveItemOrBulk: (checklistId: string, lines: string[]) => void;
  onUpdateChecklistTitle: (checklistId: string, title: string) => void;
  onAddChecklist: (title: string) => void;
  onRequestDeleteChecklist: (checklist: { id: string; title: string; itemCount: number }) => void;
  isAddingChecklist?: boolean;
}

export const TaskChecklistsCard: React.FC<TaskChecklistsCardProps> = ({
  checklists,
  onToggleItem,
  onDeleteItem,
  onSaveItemOrBulk,
  onUpdateChecklistTitle,
  onAddChecklist,
  onRequestDeleteChecklist,
  isAddingChecklist,
}) => {
  const [collapsedChecklistIds, setCollapsedChecklistIds] = useState<Set<string>>(new Set());
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState<string>('');
  const [addingItemChecklistId, setAddingItemChecklistId] = useState<string | null>(null);
  const [addingItemText, setAddingItemText] = useState<string>('');
  const [showNewChecklist, setShowNewChecklist] = useState<boolean>(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState<string>('');

  const toggleChecklistCollapse = (id: string) => {
    setCollapsedChecklistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      id="section-checklists"
      className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-4"
    >
      {checklists && checklists.length > 0 ? (
        checklists.map((cl: any) => {
          const totalItems = cl.items?.length || 0;
          const doneItems = cl.items?.filter((i: any) => i.isDone).length || 0;
          const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
          const isCollapsed = collapsedChecklistIds.has(cl.id);
          const isEditingTitle = editingChecklistId === cl.id;
          const isAddingItem = addingItemChecklistId === cl.id;

          return (
            <div key={cl.id} className="space-y-2.5">
              {/* Header Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <ListChecks className="w-4 h-4 sm:w-5 sm:h-5 text-sky-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    {isEditingTitle ? (
                      <div className="flex items-center gap-2 max-w-sm">
                        <Input
                          value={editingChecklistTitle}
                          onChange={(e) => setEditingChecklistTitle(e.target.value)}
                          className="h-7 text-xs bg-background"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editingChecklistTitle.trim()) {
                              onUpdateChecklistTitle(cl.id, editingChecklistTitle.trim());
                              setEditingChecklistId(null);
                            } else if (e.key === 'Escape') {
                              setEditingChecklistId(null);
                            }
                          }}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs font-semibold cursor-pointer"
                          disabled={!editingChecklistTitle.trim()}
                          onClick={() => {
                            if (editingChecklistTitle.trim()) {
                              onUpdateChecklistTitle(cl.id, editingChecklistTitle.trim());
                              setEditingChecklistId(null);
                            }
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs cursor-pointer"
                          onClick={() => setEditingChecklistId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingChecklistId(cl.id);
                            setEditingChecklistTitle(cl.title || 'Checklist #1');
                          }}
                          title="Rename checklist"
                          className="block max-w-full text-left text-sm sm:text-base font-bold text-foreground hover:text-primary cursor-pointer truncate transition-colors"
                        >
                          {cl.title || 'Checklist #1'}
                        </button>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-normal">
                          <span>
                            Completed {doneItems} out of {totalItems}
                          </span>
                          <div className="w-20 sm:w-28 bg-muted/80 rounded-full h-1.5 overflow-hidden inline-flex align-middle">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                pct === 100 ? 'bg-emerald-500' : 'bg-sky-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                          title="Checklist options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent
                      align="end"
                      className="w-44 p-1 rounded-xl border border-border shadow-md bg-popover"
                    >
                      <DropdownMenuItem
                        className="text-xs gap-2 cursor-pointer font-medium"
                        onClick={() => {
                          setEditingChecklistId(cl.id);
                          setEditingChecklistTitle(cl.title || 'Checklist #1');
                        }}
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Rename checklist
                      </DropdownMenuItem>
                      {cl.id && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            className="text-xs gap-2 cursor-pointer font-medium"
                            onClick={() =>
                              onRequestDeleteChecklist({
                                id: cl.id,
                                title: cl.title || 'Checklist #1',
                                itemCount: cl.items?.length || 0,
                              })
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete checklist
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                    onClick={() => toggleChecklistCollapse(cl.id)}
                    title={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}
                  >
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronUp className="w-4 h-4" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer rounded-lg"
                    onClick={() => {
                      if (cl.id) {
                        onRequestDeleteChecklist({
                          id: cl.id,
                          title: cl.title || 'Checklist #1',
                          itemCount: cl.items?.length || 0,
                        });
                      }
                    }}
                    title="Delete checklist"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="border-t border-border/60 my-2" />

              {/* Items Body */}
              {!isCollapsed && (
                <div className="space-y-1.5 min-h-[36px]">
                  {isAddingItem ? (
                    <div className="py-1">
                      <div className="flex items-start gap-2">
                        <div className="relative flex-1">
                          <textarea
                            rows={1}
                            placeholder="Add checklist item…"
                            className="w-full min-h-8 max-h-40 overflow-y-auto resize-none rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={addingItemText}
                            onChange={(e) => setAddingItemText(e.target.value)}
                            onInput={(e) => {
                              const el = e.currentTarget;
                              el.style.height = 'auto';
                              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                            }}
                            onPaste={(e) => {
                              const pasted = e.clipboardData.getData('text');
                              if (pasted && pasted.includes('\n')) {
                                const lines = pasted
                                  .split('\n')
                                  .map((l) => l.trim())
                                  .filter(Boolean);
                                if (lines.length > 1) {
                                  e.preventDefault();
                                  onSaveItemOrBulk(cl.id, lines);
                                  setAddingItemText('');
                                  setAddingItemChecklistId(null);
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === 'Enter' && !e.shiftKey && addingItemText.trim()) {
                                e.preventDefault();
                                const val = addingItemText.trim();
                                if (val.includes('\n')) {
                                  const lines = val
                                    .split('\n')
                                    .map((l) => l.trim())
                                    .filter(Boolean);
                                  onSaveItemOrBulk(cl.id, lines);
                                } else {
                                  onSaveItemOrBulk(cl.id, [val]);
                                }
                                setAddingItemText('');
                              } else if (e.key === 'Escape') {
                                setAddingItemChecklistId(null);
                                setAddingItemText('');
                              }
                            }}
                            autoFocus
                          />
                        </div>
                        <Button
                          size="sm"
                          className="h-8 text-xs font-semibold cursor-pointer"
                          disabled={!addingItemText.trim()}
                          onClick={() => {
                            if (addingItemText.trim()) {
                              const val = addingItemText.trim();
                              if (val.includes('\n')) {
                                const lines = val
                                  .split('\n')
                                  .map((l) => l.trim())
                                  .filter(Boolean);
                                onSaveItemOrBulk(cl.id, lines);
                              } else {
                                onSaveItemOrBulk(cl.id, [val]);
                              }
                              setAddingItemText('');
                            }
                          }}
                        >
                          Add
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs cursor-pointer"
                          onClick={() => {
                            setAddingItemChecklistId(null);
                            setAddingItemText('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground font-normal py-1 px-1 rounded-md transition-colors cursor-pointer w-fit"
                      onClick={() => {
                        setAddingItemChecklistId(cl.id);
                        setAddingItemText('');
                      }}
                    >
                      <Plus className="w-4 h-4 text-muted-foreground" />
                      <span>Add item</span>
                    </button>
                  )}

                  {/* Items List */}
                  {cl.items?.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-muted/40 group/item transition-colors"
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-sm flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={item.isDone}
                          onChange={(e) => {
                            onToggleItem(item.id, e.target.checked);
                          }}
                          className="w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer shrink-0"
                        />
                        <span
                          className={`truncate ${
                            item.isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                          }`}
                        >
                          {item.text}
                        </span>
                      </label>
                      <button
                        type="button"
                        className="opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-opacity p-0.5 cursor-pointer text-muted-foreground"
                        onClick={() => onDeleteItem(item.id)}
                        title="Delete item"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <p className="text-xs text-muted-foreground py-1">
          No checklists yet. Use “New checklist” below to create one.
        </p>
      )}

      {/* Bottom Actions Bar */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/60 mt-4">
        {showNewChecklist ? (
          <>
            <Input
              placeholder="Checklist title (e.g. Acceptance Criteria, Verification Steps)..."
              className="h-8 text-xs bg-background flex-1"
              value={newChecklistTitle}
              onChange={(e) => setNewChecklistTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newChecklistTitle.trim()) {
                  onAddChecklist(newChecklistTitle.trim());
                  setNewChecklistTitle('');
                  setShowNewChecklist(false);
                } else if (e.key === 'Escape') {
                  setShowNewChecklist(false);
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              className="h-8 text-xs font-semibold shrink-0 cursor-pointer"
              disabled={!newChecklistTitle.trim() || isAddingChecklist}
              onClick={() => {
                if (newChecklistTitle.trim()) {
                  onAddChecklist(newChecklistTitle.trim());
                  setNewChecklistTitle('');
                  setShowNewChecklist(false);
                }
              }}
            >
              Create
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs shrink-0 cursor-pointer"
              onClick={() => {
                setShowNewChecklist(false);
                setNewChecklistTitle('');
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground font-normal py-1.5 px-1 rounded-md transition-colors cursor-pointer"
            onClick={() => {
              setNewChecklistTitle('');
              setShowNewChecklist(true);
            }}
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
            <span>New checklist</span>
          </button>
        )}
      </div>
    </div>
  );
};
