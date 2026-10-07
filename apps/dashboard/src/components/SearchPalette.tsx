import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchService } from '../lib/searchService';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Dialog, DialogContent, DialogTrigger } from '@boardly/ui/dialog';
import { Kbd } from './ui/Kbd';
import { QueryError } from './common/QueryError';
import {
  Search,
  SearchIcon,
  X,
  Bookmark,
  Folder,
  LayoutDashboard,
  CreditCard,
  CheckSquare,
  Clock,
  Sparkles,
  Columns,
  BookOpen,
  Shield,
  CornerDownLeft,
  Plus,
  MessageSquare,
  Hash,
  User,
} from 'lucide-react';
import { chatService } from '../lib/chatService';
import { useDebouncedValue as useDebounceValue } from '../hooks/useDebouncedValue';
import { useDialogClose } from '../hooks/useDialogClose';

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  type: 'navigation' | 'board' | 'card' | 'project' | 'action';
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  onSelect: () => void;
}

// Stable empty results: the search query below is disabled until 2+ chars,
// so `data` is undefined and a `= []` default would mint a FRESH array every
// render — and the reset effect keyed on `serverResults` would snap
// selectedIndex back to 0 on every render, making arrow/hover selection
// permanently stuck on the first row. One shared frozen reference instead.
const EMPTY_RESULTS: never[] = [];

export function SearchPalette({ triggerContext }: { triggerContext?: 'navbar' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debouncedQuery = useDebounceValue(query, 250);

  // Fetch chat channels for quick switcher search
  const { data: channels = [] } = useQuery({
    queryKey: ['chat', 'channels'],
    queryFn: () => chatService.listChannels(),
    enabled: open,
    staleTime: 30000,
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.isPlatformAdmin || user?.role === 'org_owner' || user?.role === 'org_admin';

  // 1. Fetch remote search results for cards/boards/projects
  const {
    data: serverResults,
    isLoading,
    isError: isSearchError,
    refetch: refetchSearch,
  } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchService.search(debouncedQuery),
    enabled: debouncedQuery.trim().length > 1,
  });

  // See EMPTY_RESULTS: must be reference-stable so the selection reset below
  // only fires when results actually change, not on every render.
  const stableServerResults = serverResults ?? EMPTY_RESULTS;

  // 2. Fetch saved searches
  //
  // Both of these used to be unguarded, so every authenticated app boot paid two
  // requests for a dialog that renders nothing until Cmd+K — and `['workspaces']`
  // is invalidated by every workspace mutation, so those refetches cascaded
  // through this always-mounted component. Gate them on `open` like the channels
  // query above.
  const { data: savedSearches = [] } = useQuery({
    queryKey: ['savedSearches'],
    queryFn: () => searchService.getSavedSearches(),
    enabled: open,
    staleTime: 60000,
  });

  // 3. Fetch workspaces to build instant board & project suggestions
  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const res = await api.get('/workspaces');
      return res.data;
    },
    enabled: open,
    staleTime: 60000,
  });

  const saveSearchMutation = useMutation({
    mutationFn: (name: string) => searchService.createSavedSearch({ name, query }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedSearches'] }),
  });

  const deleteSavedSearchMutation = useMutation({
    mutationFn: (id: string) => searchService.deleteSavedSearch(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedSearches'] }),
  });

  // Global hotkey Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset selected index when query or results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, stableServerResults]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Static Quick Navigation Items
  const quickNavItems: SearchItem[] = useMemo(() => {
    const items: SearchItem[] = [
      {
        id: 'nav-workspaces',
        title: 'Workspaces & Overview',
        subtitle: 'Main dashboard & teams',
        type: 'navigation',
        icon: LayoutDashboard,
        iconColor: 'text-sky-500',
        onSelect: () => navigate('/'),
      },
      {
        id: 'nav-chat',
        title: 'Chat & Teams',
        subtitle: 'Direct messages, channels, and team collaboration',
        type: 'navigation',
        icon: MessageSquare,
        iconColor: 'text-indigo-500',
        onSelect: () => navigate('/chat'),
      },
      {
        id: 'nav-mytasks',
        title: 'My Tasks',
        subtitle: 'Assigned tickets and action items',
        type: 'navigation',
        icon: CheckSquare,
        iconColor: 'text-emerald-500',
        onSelect: () => navigate('/my-tasks'),
      },
      {
        id: 'nav-timesheets',
        title: 'Timesheets & Work Logs',
        subtitle: 'Log and track billable hours',
        type: 'navigation',
        icon: Clock,
        iconColor: 'text-amber-500',
        onSelect: () => navigate('/timesheets'),
      },
      {
        id: 'nav-marketplace',
        title: 'Power-Ups & App Marketplace',
        subtitle: 'Integrations, add-ons, and bots',
        type: 'navigation',
        icon: Sparkles,
        iconColor: 'text-purple-500',
        onSelect: () => navigate('/marketplace'),
      },
    ];

    if (isAdmin) {
      items.push({
        id: 'nav-admin',
        title: 'Admin Panel',
        subtitle: 'Users, roles, SSO, and billing',
        type: 'navigation',
        icon: Shield,
        iconColor: 'text-rose-500',
        onSelect: () => navigate('/admin/users'),
      });
    }

    return items;
  }, [isAdmin, navigate]);

  // Dynamic Workspace Boards Items
  const boardItems: SearchItem[] = useMemo(() => {
    const items: SearchItem[] = [];
    workspaces.forEach((ws: any) => {
      ws.projects?.forEach((proj: any) => {
        proj.boards?.forEach((b: any) => {
          items.push({
            id: `board-${b.id}`,
            title: b.name || b.title || 'Untitled Board',
            subtitle: `${ws.name} > ${proj.name}`,
            type: 'board',
            icon: Columns,
            iconColor: 'text-teal-500',
            onSelect: () => navigate(`/b/${b.id}`),
          });
        });
      });
    });
    return items;
  }, [workspaces, navigate]);

  // Quick Action Items
  const quickActions: SearchItem[] = useMemo(
    () => [
      {
        id: 'action-create-ws',
        title: 'Create New Workspace',
        subtitle: 'Set up a new team environment',
        type: 'action',
        icon: Plus,
        iconColor: 'text-primary',
        onSelect: () => navigate('/'),
      },
      {
        id: 'action-docs',
        title: 'Docs & Knowledge Base',
        subtitle: 'Browse specifications and wikis',
        type: 'action',
        icon: BookOpen,
        iconColor: 'text-teal-500',
        onSelect: () => {
          const firstProj = workspaces[0]?.projects?.[0];
          if (firstProj) navigate(`/projects/${firstProj.id}/docs`);
          else navigate('/');
        },
      },
    ],
    [workspaces, navigate]
  );

  // Format remote search results into SearchItems
  const formattedServerResults: SearchItem[] = useMemo(() => {
    return stableServerResults.map((r: any) => {
      if (r.type === 'card') {
        const ticketKey = r.key || (r.taskNumber ? `#${r.taskNumber}` : 'Task');
        return {
          id: `card-${r.id}`,
          title: r.title,
          subtitle: `${ticketKey} · ${r.boardName || 'Kanban Board'}`,
          type: 'card',
          icon: CreditCard,
          iconColor: 'text-emerald-500',
          onSelect: () => navigate(`/b/${r.boardId}?card=${r.id}`),
        };
      }
      if (r.type === 'board') {
        return {
          id: `board-${r.id}`,
          title: r.title,
          subtitle: 'Kanban Board',
          type: 'board',
          icon: Columns,
          iconColor: 'text-teal-500',
          onSelect: () => navigate(`/b/${r.id}`),
        };
      }
      return {
        id: `project-${r.id}`,
        title: r.title,
        subtitle: 'Project Folder',
        type: 'project',
        icon: Folder,
        iconColor: 'text-amber-500',
        onSelect: () => navigate('/'),
      };
    });
  }, [stableServerResults, navigate]);

  // All active items to display
  const activeItems: SearchItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Empty query default suggestions
      return [...quickNavItems, ...boardItems.slice(0, 4), ...quickActions];
    }

    // Filter local navigation items by query
    const matchedNav = quickNavItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q)
    );

    const matchedBoards = boardItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q)
    );

    // Format chat channels matches
    const matchedChat: SearchItem[] = channels
      .filter((c) => {
        const name = c.type === 'direct' ? c.otherUser?.name || '' : c.name;
        const sub = c.type === 'direct' ? c.otherUser?.email || '' : c.topic || '';
        return name.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
      })
      .map((c) => ({
        id: `chat-${c.id}`,
        title: c.type === 'direct' ? c.otherUser?.name || 'Direct Message' : `# ${c.name}`,
        subtitle:
          c.type === 'direct' ? c.otherUser?.email || 'Direct conversation' : c.topic || 'Channel',
        type: 'card' as const,
        icon: c.type === 'direct' ? User : Hash,
        iconColor: c.type === 'direct' ? 'text-indigo-400' : 'text-sky-400',
        onSelect: () => navigate(`/chat/${c.id}`),
      }));

    // Combine local matches + server results
    const combined = [...matchedChat, ...formattedServerResults, ...matchedNav, ...matchedBoards];

    // Deduplicate by ID
    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [query, quickNavItems, boardItems, quickActions, formattedServerResults, channels, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < activeItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : activeItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedItem = activeItems[selectedIndex];
      if (selectedItem) {
        selectedItem.onSelect();
        setOpen(false);
      }
    }
  };

  const handleItemClick = (item: SearchItem) => {
    item.onSelect();
    setOpen(false);
  };

  // Single close path (AGENTS.md §11) — requestClose is idempotent per
  // open session, so X / backdrop / Esc cannot double-close.
  const { handleOpenChange } = useDialogClose({
    isOpen: open,
    onClose: () => setOpen(false),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {triggerContext === 'navbar' ? (
        <DialogTrigger
          render={
            <button
              type="button"
              aria-label="Search boards, cards and commands"
              // Explicit opener: handleOpenChange is the close path by contract
              // (it swallows open requests), so the trigger cannot rely on it.
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-border/80 bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground shadow-2xs h-8 w-8 justify-center px-0 sm:w-[220px] sm:justify-between sm:px-3 lg:w-[280px] text-xs font-medium transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 truncate">
                <SearchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="hidden sm:inline-flex truncate">Search boards, cards...</span>
              </div>
              <Kbd
                shortcut="mod+k"
                className="pointer-events-none hidden sm:inline-flex h-4.5 px-1.5 font-semibold"
              />
            </button>
          }
        />
      ) : (
        <DialogTrigger
          render={
            <button
              type="button"
              aria-label="Open command palette"
              // Explicit opener: see the navbar trigger above.
              onClick={() => setOpen(true)}
              className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors hover:bg-muted text-muted-foreground hover:text-foreground h-8 w-8 cursor-pointer"
            >
              <SearchIcon className="h-4 w-4" />
            </button>
          }
        />
      )}

      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl p-0 overflow-hidden bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl"
      >
        {/* ─── Search Input Header ─── */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border/70 bg-card shrink-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 border border-primary/20">
            <Search className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/70 outline-none h-full"
            placeholder="Type a command or search boards, tasks, projects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono font-semibold text-muted-foreground border border-border">
            ESC
          </kbd>
        </div>

        {/* ─── Results & Quick Commands Body ─── */}
        <div className="max-h-[360px] overflow-y-auto p-2 space-y-1">
          {isLoading && query.length > 1 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
              Searching workspace...
            </div>
          )}

          {/* Render Active Items */}
          {activeItems.length > 0 ? (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {query.trim() ? 'Matching Results' : 'Suggestions & Quick Jump'}
              </div>

              <div className="space-y-0.5 mt-1">
                {activeItems.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-semibold shadow-2xs'
                          : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded-lg shrink-0 ${
                            isSelected
                              ? 'bg-primary/20 text-primary'
                              : item.iconColor
                                ? `${item.iconColor} bg-muted/60`
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="truncate leading-tight font-medium text-foreground">
                            {item.title}
                          </p>
                          {item.subtitle && (
                            <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-semibold">
                          {item.type}
                        </span>
                        {isSelected && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-primary opacity-80" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            !isLoading &&
            query.length > 0 &&
            (isSearchError && stableServerResults.length === 0 ? (
              <QueryError
                compact
                message="Search failed."
                onRetry={() => refetchSearch()}
                className="py-10 justify-center"
              />
            ) : (
              <div className="py-10 text-center text-xs text-muted-foreground space-y-1">
                <SearchIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="font-semibold text-foreground">
                  No matches found for &quot;{query}&quot;
                </p>
                <p className="text-[11px]">
                  Try searching for task titles, board names, or projects.
                </p>
              </div>
            ))
          )}

          {/* Saved Searches Section */}
          {!query.trim() && savedSearches?.length > 0 && (
            <div className="pt-2 border-t border-border/50 mt-2">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center justify-between">
                <span>Saved Searches</span>
                <span className="text-[9px] font-normal text-muted-foreground">Click to run</span>
              </div>
              <div className="space-y-0.5 mt-1">
                {savedSearches.map((ss: any) => (
                  <div
                    key={ss.id}
                    className="group flex items-center justify-between rounded-xl text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => setQuery(ss.query)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2 text-left rounded-xl hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate font-medium">{ss.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        ({ss.query})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedSearchMutation.mutate(ss.id)}
                      // Always visible on coarse pointers: `opacity-0` until hover
                      // left the delete action unreachable on touch (AGENTS.md §9).
                      className="p-1 mr-3 text-muted-foreground hover:text-rose-500 rounded-md transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Delete saved search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer: Keyboard Shortcuts & Save ─── */}
        <div className="p-3 px-4 bg-muted/30 border-t border-border/70 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                ↓
              </kbd>
              <span className="text-[10px] ml-0.5">navigate</span>
            </span>

            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                ↵
              </kbd>
              <span className="text-[10px] ml-0.5">select</span>
            </span>

            <span className="flex items-center gap-1 hidden sm:inline-flex">
              <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                esc
              </kbd>
              <span className="text-[10px] ml-0.5">close</span>
            </span>
          </div>

          {query.trim().length > 1 && (
            <button
              type="button"
              onClick={() => saveSearchMutation.mutate(`Search: ${query}`)}
              disabled={saveSearchMutation.isPending}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium cursor-pointer"
            >
              <Bookmark className="w-3 h-3" />
              <span>{saveSearchMutation.isPending ? 'Saving...' : 'Save search'}</span>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
