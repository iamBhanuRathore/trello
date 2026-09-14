import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { Keyboard, Search, Command, X } from 'lucide-react';
import { isMac } from '../lib/platform';

export interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  id: string;
  category: 'Navigation' | 'Chat & Teams' | 'Messaging' | 'Tasks & Boards';
  description: string;
  keys: string[];
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onOpenChange,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const mac = isMac();
  const modKey = mac ? '⌘' : 'Ctrl';
  const altKey = mac ? '⌥' : 'Alt';
  const shiftKey = mac ? '⇧' : 'Shift';

  const shortcuts: ShortcutItem[] = useMemo(
    () => [
      // Navigation
      {
        id: 'nav-quick-switcher',
        category: 'Navigation',
        description: 'Open Command Palette / Quick Switcher',
        keys: [modKey, 'K'],
      },
      {
        id: 'nav-shortcuts',
        category: 'Navigation',
        description: 'Open Keyboard Shortcuts cheatsheet',
        keys: ['?'],
      },
      {
        id: 'nav-shortcuts-cmd',
        category: 'Navigation',
        description: 'Toggle Keyboard Shortcuts cheatsheet',
        keys: [modKey, '/'],
      },
      {
        id: 'nav-esc',
        category: 'Navigation',
        description: 'Close active modal, drawer, or dialog',
        keys: ['Esc'],
      },
      {
        id: 'nav-sidebar',
        category: 'Navigation',
        description: 'Toggle navigation sidebar expand/collapse',
        keys: [modKey, 'B'],
      },
      {
        id: 'nav-chord-chat',
        category: 'Navigation',
        description: 'Go to Chat & Teams workspace',
        keys: ['G', 'C'],
      },
      {
        id: 'nav-chord-boards',
        category: 'Navigation',
        description: 'Go to Boards & Workspaces',
        keys: ['G', 'B'],
      },
      {
        id: 'nav-chord-tasks',
        category: 'Navigation',
        description: 'Go to My Tasks',
        keys: ['G', 'T'],
      },

      // Chat & Teams
      {
        id: 'chat-new-dm',
        category: 'Chat & Teams',
        description: 'Start a new Direct Message',
        keys: ['C'],
      },
      {
        id: 'chat-new-dm-mod',
        category: 'Chat & Teams',
        description: 'New Direct Message dialog',
        keys: [modKey, 'N'],
      },
      {
        id: 'chat-new-channel',
        category: 'Chat & Teams',
        description: 'Create a new public/private Channel',
        keys: [modKey, shiftKey, 'C'],
      },
      {
        id: 'chat-working-hours',
        category: 'Chat & Teams',
        description: 'Set Working Hours & Presence Status',
        keys: [modKey, shiftKey, 'H'],
      },
      {
        id: 'chat-next-channel',
        category: 'Chat & Teams',
        description: 'Switch to next channel / conversation',
        keys: [altKey, '↓'],
      },
      {
        id: 'chat-prev-channel',
        category: 'Chat & Teams',
        description: 'Switch to previous channel / conversation',
        keys: [altKey, '↑'],
      },
      {
        id: 'chat-toggle-details',
        category: 'Chat & Teams',
        description: 'Toggle channel details & members pane',
        keys: [modKey, 'I'],
      },
      {
        id: 'chat-toggle-thread',
        category: 'Chat & Teams',
        description: 'Toggle active discussion thread drawer',
        keys: [modKey, 'T'],
      },
      {
        id: 'chat-focus-composer',
        category: 'Chat & Teams',
        description: 'Focus message composer',
        keys: ['/'],
      },

      // Messaging & Composer
      {
        id: 'msg-send',
        category: 'Messaging',
        description: 'Send current message or reply',
        keys: ['Enter'],
      },
      {
        id: 'msg-send-cmd',
        category: 'Messaging',
        description: 'Force send message (in rich mode)',
        keys: [modKey, 'Enter'],
      },
      {
        id: 'msg-newline',
        category: 'Messaging',
        description: 'Insert a new line without sending',
        keys: [shiftKey, 'Enter'],
      },
      {
        id: 'msg-edit-last',
        category: 'Messaging',
        description: 'Edit your last sent message (when input empty)',
        keys: ['↑'],
      },
      {
        id: 'msg-cancel-edit',
        category: 'Messaging',
        description: 'Cancel message edit mode or blur composer',
        keys: ['Esc'],
      },
      {
        id: 'msg-mention',
        category: 'Messaging',
        description: 'Mention a teammate or trigger mention picker',
        keys: ['@'],
      },

      // Tasks & Boards
      {
        id: 'task-create',
        category: 'Tasks & Boards',
        description: 'Quick create task / ticket',
        keys: ['T'],
      },
      {
        id: 'task-close-modal',
        category: 'Tasks & Boards',
        description: 'Close task modal / card view',
        keys: ['Esc'],
      },
    ],
    [modKey, altKey, shiftKey]
  );

  const filteredShortcuts = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter(
      (s) =>
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.keys.some((k) => k.toLowerCase().includes(q))
    );
  }, [shortcuts, filterQuery]);

  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, ShortcutItem[]> = {};
    for (const item of filteredShortcuts) {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    }
    return groups;
  }, [filteredShortcuts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] h-[85vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-5 sm:px-6 border-b border-border/80 bg-card/90 backdrop-blur-md shrink-0 space-y-1">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Keyboard className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                  Keyboard Shortcuts
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Speed up your daily workflow with market-standard hotkeys and chords.
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Quick Filter Input */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search shortcuts (e.g. channel, message, navigation)..."
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-muted/40 border border-border/80 focus:bg-background focus:ring-2 focus:ring-primary/20 outline-none text-foreground placeholder:text-muted-foreground transition-all"
              autoFocus
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-y-auto p-5 sm:px-6 space-y-6">
          {Object.keys(groupedShortcuts).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              No shortcuts found matching &quot;{filterQuery}&quot;.
            </div>
          ) : (
            Object.entries(groupedShortcuts).map(([category, items]) => (
              <div key={category} className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
                  {category}
                </h3>
                <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-muted/10 overflow-hidden">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <span className="text-xs text-foreground/90 font-medium">
                        {item.description}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        {item.keys.map((k, idx) => (
                          <React.Fragment key={idx}>
                            <kbd className="min-w-[22px] h-6 px-1.5 inline-flex items-center justify-center rounded-md bg-muted border border-border text-[11px] font-mono font-semibold text-foreground shadow-2xs">
                              {k}
                            </kbd>
                            {idx < item.keys.length - 1 && item.keys.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 px-6 border-t border-border/80 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-1.5">
            <Command className="w-3.5 h-3.5 text-primary" />
            <span>
              Pro-tip: Press{' '}
              <kbd className="px-1 py-0.2 rounded bg-muted border border-border text-[10px] font-mono">
                ?
              </kbd>{' '}
              anywhere to open this cheatsheet
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1 rounded-lg bg-background hover:bg-muted border border-border text-xs font-semibold text-foreground transition-colors cursor-pointer"
          >
            Got it (Esc)
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
