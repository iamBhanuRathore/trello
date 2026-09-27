import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  Eye,
  MessageSquare,
  AlertTriangle,
  Folder,
  Search,
  X,
  LayoutGrid,
  List,
  RotateCw,
  Calendar,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { api } from '../lib/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { QueryError } from '../components/common/QueryError';
import { CardModal } from '../components/board/CardModal';
import { PriorityBadge } from '../components/board/PriorityBadge';
import { priorityService } from '../lib/priorityService';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { format } from 'date-fns';

type FilterTab = 'all' | 'assigned' | 'observing' | 'participating' | 'created';
type ViewMode = 'grid' | 'list';

const PAGE_SIZE = 24;

export function MyTasks() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Org-configured priorities (backend-driven colors; lazy-seeds defaults).
  const { data: priorities = [] } = useQuery({
    queryKey: ['priorities'],
    queryFn: () => priorityService.list(),
    staleTime: 5 * 60_000,
  });

  // Paginated tasks — each tab/filter combo caches independently so revisits
  // are instant, while tab switches show skeletons on first load.
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'my-tasks',
      activeTab,
      debouncedSearch,
      selectedWorkspace,
      selectedProject,
      selectedPriority,
    ],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.append('filter', activeTab);
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
      if (selectedWorkspace !== 'all') params.append('workspaceId', selectedWorkspace);
      if (selectedProject !== 'all') params.append('projectId', selectedProject);
      if (selectedPriority !== 'all') params.append('priority', selectedPriority);
      params.append('limit', String(PAGE_SIZE));
      params.append('offset', String(pageParam));

      const res = await api.get(`/cards/my-tasks?${params.toString()}`);
      return res.data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage?.hasMore ? lastPage.offset + (lastPage.tasks?.length ?? 0) : undefined,
    staleTime: 30_000,
  });

  const pages = data?.pages ?? [];
  const tasks: any[] = pages.flatMap((p) => p?.tasks ?? []);
  const total: number = pages[0]?.total ?? tasks.length;
  const summary = pages[0]?.summary || {
    totalAssigned: 0,
    totalObserving: 0,
    totalParticipating: 0,
    totalCreated: 0,
    overdueCount: 0,
    dueSoonCount: 0,
  };

  // Infinite scroll — prefetch next page before the user hits the bottom.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '600px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, tasks.length]);

  // Tab/filter switch or manual refresh in progress (not next-page fetch).
  const isSwitching = isFetching && !isLoading && !isFetchingNextPage;

  // Derive unique workspaces & projects for filter dropdowns
  const workspaces = Array.from(
    new Map(
      tasks.map((t) => [t.workspaceId, { id: t.workspaceId, name: t.workspaceName }])
    ).values()
  ).filter((w) => w.id && w.name);

  const projects = Array.from(
    new Map(tasks.map((t) => [t.projectId, { id: t.projectId, name: t.projectName }])).values()
  ).filter((p) => p.id && p.name);

  return (
    <div className="space-y-6 max-w-7xl lg:w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* ─── Header & Actions ─── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <CheckSquare className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                My Tasks &amp; Work Items
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Centralized workspace for all tasks assigned to you, observed tickets, and active
                collaborations.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-8 text-xs gap-1.5"
            title="Refresh tasks"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading || isSwitching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* ─── KPI Metrics Summary Banner ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Assigned */}
        <div
          onClick={() => setActiveTab('assigned')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'assigned'
              ? 'bg-primary/10 border-primary/50 ring-2 ring-primary/20 shadow-sm'
              : 'bg-card/60 hover:bg-card/90 border-border hover:border-primary/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Assigned to Me
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-foreground">
              {summary.totalAssigned}
            </span>
            <span className="text-[11px] text-muted-foreground">active tasks</span>
          </div>
        </div>

        {/* Card 2: Observing */}
        <div
          onClick={() => setActiveTab('observing')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'observing'
              ? 'bg-primary/10 border-primary/50 ring-2 ring-primary/20 shadow-sm'
              : 'bg-card/60 hover:bg-card/90 border-border hover:border-primary/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Observing
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-foreground">
              {summary.totalObserving}
            </span>
            <span className="text-[11px] text-muted-foreground">watched tickets</span>
          </div>
        </div>

        {/* Card 3: Participating & Created */}
        <div
          onClick={() => setActiveTab('participating')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'participating'
              ? 'bg-primary/10 border-primary/50 ring-2 ring-primary/20 shadow-sm'
              : 'bg-card/60 hover:bg-card/90 border-border hover:border-primary/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Participating
            </span>
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-foreground">
              {summary.totalParticipating}
            </span>
            <span className="text-[11px] text-muted-foreground">discussions &amp; logs</span>
          </div>
        </div>

        {/* Card 4: Overdue & Due Soon */}
        <div className="p-4 rounded-2xl border bg-card/60 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Due Status
            </span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <div>
              <span className="text-2xl font-black tracking-tight text-rose-500">
                {summary.overdueCount}
              </span>
              <span className="text-[11px] text-muted-foreground ml-1">overdue</span>
            </div>
            <div className="text-muted-foreground/40">•</div>
            <div>
              <span className="text-2xl font-black tracking-tight text-amber-500">
                {summary.dueSoonCount}
              </span>
              <span className="text-[11px] text-muted-foreground ml-1">this week</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Filter & Scope Toolbar ─── */}
      <div className="p-4 rounded-2xl border border-border/80 bg-card/50 backdrop-blur-sm space-y-3.5 shadow-xs">
        {/* Top Row: Tabs & View Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>All Tasks</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-bold min-w-[18px] text-center">
                {summary.totalAssigned +
                  summary.totalObserving +
                  summary.totalParticipating +
                  summary.totalCreated || tasks.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assigned')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'assigned'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckSquare className="w-3 h-3" />
              <span>Assigned to Me</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-bold min-w-[18px] text-center">
                {summary.totalAssigned}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('observing')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'observing'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Observing</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-bold min-w-[18px] text-center">
                {summary.totalObserving}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('participating')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'participating'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Participating</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-bold min-w-[18px] text-center">
                {summary.totalParticipating}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('created')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'created'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Created by Me</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-bold min-w-[18px] text-center">
                {summary.totalCreated}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-xl border border-border shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom Row: Search & Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, description..."
              className="h-8 text-xs pl-8 pr-7 bg-background/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Workspace Filter */}
          <SearchableSelect
            options={[
              { value: 'all', label: 'All Workspaces' },
              ...workspaces.map((w) => ({ value: w.id, label: w.name })),
            ]}
            value={selectedWorkspace}
            onChange={(val) => {
              setSelectedWorkspace(val);
              setSelectedProject('all');
            }}
            placeholder="Select Workspace"
            size="sm"
            triggerClassName="h-8 bg-background/60 text-xs"
          />

          {/* Project Filter */}
          <SearchableSelect
            options={[
              { value: 'all', label: 'All Projects' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={selectedProject}
            onChange={setSelectedProject}
            placeholder="Select Project"
            size="sm"
            triggerClassName="h-8 bg-background/60 text-xs"
          />

          {/* Priority Filter */}
          <SearchableSelect
            options={[
              { value: 'all', label: 'All Priorities' },
              ...priorities.map((p) => ({
                value: p.id,
                label: `${p.name}${p.isDefault ? ' (default)' : ''}`,
                badge: (
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: p.color }}
                  />
                ),
              })),
            ]}
            value={selectedPriority}
            onChange={setSelectedPriority}
            placeholder="Select Priority"
            size="sm"
            triggerClassName="h-8 bg-background/60 text-xs"
          />
        </div>
      </div>

      {/* ─── Task Grid / List ─── */}
      <div className="min-h-[420px] relative">
        {isSwitching && (
          <div className="absolute -top-1 right-0 z-10">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/30 shadow-xs">
              <RotateCw className="w-3 h-3 animate-spin" />
              {activeTab === 'all' ? 'Loading tasks...' : 'Switching tab...'}
            </span>
          </div>
        )}

        <div
          className={`transition-opacity duration-200 ${isSwitching ? 'opacity-60 saturate-50' : 'opacity-100'}`}
          aria-busy={isSwitching}
        >
          {isLoading && pages.length === 0 ? (
            viewMode === 'list' ? (
              <div
                className="rounded-2xl border border-border bg-card/40 overflow-hidden"
                aria-label="Loading tasks"
              >
                <div className="h-10 bg-muted/40 border-b border-border" />
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-12 border-b border-border/50 last:border-0 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                aria-label="Loading tasks"
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-48 rounded-2xl border border-border bg-card/40 animate-pulse p-4 space-y-3"
                  >
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-6 bg-muted rounded w-3/4" />
                    <div className="h-12 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded w-1/2 mt-auto" />
                  </div>
                ))}
              </div>
            )
          ) : isError && tasks.length === 0 ? (
            <QueryError
              message="Couldn't load your tasks. Check your connection and try again."
              onRetry={() => refetch()}
              className="py-20 border border-dashed border-border rounded-3xl bg-card/20 min-h-[360px] justify-center"
            />
          ) : tasks.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-border rounded-3xl bg-card/20 space-y-3 min-h-[360px] flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">No tasks found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchQuery
                  ? `No work items matching "${searchQuery}". Try clearing search or adjusting your filters.`
                  : 'You have no active tasks under this category right now.'}
              </p>
              {(searchQuery ||
                selectedWorkspace !== 'all' ||
                selectedProject !== 'all' ||
                selectedPriority !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedWorkspace('all');
                    setSelectedProject('all');
                    setSelectedPriority('all');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* ─── Grid View (Rich Cards) ─── */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((task) => {
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                const checklists = task.checklistsProgress || { total: 0, completed: 0 };

                return (
                  <div
                    key={task.id}
                    onClick={() => setActiveCardId(task.id)}
                    className="group relative p-4 rounded-2xl border border-border bg-card/70 hover:bg-card hover:border-primary/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3"
                  >
                    {/* Top Hierarchy & Badges */}
                    <div className="space-y-2">
                      {/* Project & Board Hierarchy & Key */}
                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                        {task.key && (
                          <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                            {task.key}
                          </span>
                        )}
                        <span className="font-semibold text-foreground/80 truncate max-w-[120px]">
                          {task.workspaceName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1 truncate max-w-[70%]">
                          <Folder className="w-3 h-3 text-primary shrink-0" />
                          <span className="truncate">{task.projectName}</span>
                        </div>

                        {/* Stage Pill */}
                        {task.stageName && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: task.stageColor
                                ? `${task.stageColor}20`
                                : 'rgba(var(--primary), 0.1)',
                              color: task.stageColor || 'inherit',
                              border: `1px solid ${task.stageColor ? `${task.stageColor}40` : 'transparent'}`,
                            }}
                          >
                            {task.stageName}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                        {task.title}
                      </h3>

                      {/* Relationship Badges (Assignee, Observer, etc.) */}
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {task.priority && <PriorityBadge priority={task.priority} />}
                        {task.isAssignee && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <CheckSquare className="w-2.5 h-2.5" /> Assigned
                          </span>
                        )}
                        {task.isObserver && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <Eye className="w-2.5 h-2.5" /> Watching
                          </span>
                        )}
                        {task.isParticipant && !task.isAssignee && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center gap-1">
                            <MessageSquare className="w-2.5 h-2.5" /> Participant
                          </span>
                        )}
                        {task.isCreator && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                            Author
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Checklist & Due Date */}
                    <div className="space-y-2 pt-2 border-t border-border/50 text-xs">
                      {/* Checklist Progress */}
                      {checklists.total > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <CheckSquare className="w-3 h-3 text-primary" /> Checklist
                            </span>
                            <span>
                              {checklists.completed}/{checklists.total}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{
                                width: `${Math.round((checklists.completed / checklists.total) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Due Date & Points */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                        {task.dueDate ? (
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                              isOverdue
                                ? 'bg-destructive/15 text-destructive font-semibold'
                                : 'bg-muted/60 text-muted-foreground'
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            <span>{format(new Date(task.dueDate), 'MMM d')}</span>
                            {isOverdue && (
                              <span className="text-[9px] uppercase font-bold">• Overdue</span>
                            )}
                          </div>
                        ) : (
                          <span />
                        )}

                        <div className="flex items-center gap-1.5">
                          {task.storyPoints != null && (
                            <span className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground font-mono text-[10px]">
                              {task.storyPoints} pts
                            </span>
                          )}
                          {task.estimateMinutes ? (
                            <span className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground font-mono text-[10px]">
                              {(task.estimateMinutes / 60).toFixed(1)}h
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Footer: Assignees & Watchers Stack */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      {/* Assignees */}
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {task.assignees?.map((a: any) => (
                          <div
                            key={a.id}
                            title={a.name || a.email}
                            className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-background flex items-center justify-center text-[9px] font-bold"
                          >
                            {a.avatarUrl ? (
                              <img
                                src={a.avatarUrl}
                                alt={a.name}
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              a.name?.substring(0, 2).toUpperCase() || 'U'
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                        {task.watchersCount > 0 && (
                          <span
                            className="flex items-center gap-1"
                            title={`${task.watchersCount} watching`}
                          >
                            <Eye className="w-3 h-3" /> {task.watchersCount}
                          </span>
                        )}
                        {task.commentsCount > 0 && (
                          <span
                            className="flex items-center gap-1"
                            title={`${task.commentsCount} comments`}
                          >
                            <MessageSquare className="w-3 h-3" /> {task.commentsCount}
                          </span>
                        )}
                        <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── List / Table View ─── */
            <div className="rounded-2xl border border-border bg-card/60 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th className="px-4 py-3">Task Title</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3 text-right">Assignees</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {tasks.map((task) => {
                      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                      return (
                        <tr
                          key={task.id}
                          onClick={() => setActiveCardId(task.id)}
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 font-semibold text-foreground max-w-xs truncate">
                            <div className="flex items-center gap-2">
                              {task.key && (
                                <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 shrink-0">
                                  {task.key}
                                </span>
                              )}
                              <span className="truncate">{task.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground max-w-[150px] truncate">
                            {task.projectName}
                          </td>
                          <td className="px-4 py-3">
                            {task.stageName && (
                              <span
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block"
                                style={{
                                  backgroundColor: task.stageColor
                                    ? `${task.stageColor}20`
                                    : 'rgba(var(--primary), 0.1)',
                                  color: task.stageColor || 'inherit',
                                }}
                              >
                                {task.stageName}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <PriorityBadge priority={task.priority} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {task.isAssignee && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold">
                                  Assigned
                                </span>
                              )}
                              {task.isObserver && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
                                  Watching
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {task.dueDate ? (
                              <span
                                className={
                                  isOverdue ? 'text-destructive font-bold' : 'text-muted-foreground'
                                }
                              >
                                {format(new Date(task.dueDate), 'MMM d, yyyy')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end -space-x-1">
                              {task.assignees?.map((a: any) => (
                                <div
                                  key={a.id}
                                  title={a.name}
                                  className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-background flex items-center justify-center text-[9px] font-bold"
                                >
                                  {a.name?.substring(0, 2).toUpperCase() || 'U'}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ─── Infinite scroll sentinel + pagination footer ─── */}
        {tasks.length > 0 && (
          <div className="pt-4 flex flex-col items-center gap-2.5">
            <p className="text-[11px] text-muted-foreground" aria-live="polite">
              Showing <span className="font-semibold text-foreground">{tasks.length}</span> of{' '}
              <span className="font-semibold text-foreground">{total}</span> tasks
            </p>
            <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />
            {isFetchingNextPage && (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <RotateCw className="w-3.5 h-3.5 animate-spin text-primary" /> Loading more tasks...
              </span>
            )}
            {!isFetchingNextPage && hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => fetchNextPage()}
              >
                Load more tasks
              </Button>
            )}
            {!hasNextPage && total > PAGE_SIZE && (
              <p className="text-[11px] text-muted-foreground/70">You&apos;re all caught up</p>
            )}
          </div>
        )}
      </div>

      {/* ─── Integrated Card Detail Modal ─── */}
      <CardModal
        cardId={activeCardId}
        open={!!activeCardId}
        onOpenChange={(open) => {
          if (!open) {
            setActiveCardId(null);
            queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
          }
        }}
        onSelectCard={(id) => setActiveCardId(id)}
      />
    </div>
  );
}
