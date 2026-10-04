import { Link } from 'react-router-dom';
import { Briefcase, BookOpen, BarChart3, Plus } from 'lucide-react';

interface WorkspacesOverviewProps {
  workspacesCount: number;
  totalProjects: number;
  totalBoards: number;
  isLoading?: boolean;
}

export function WorkspacesOverview({
  workspacesCount,
  totalProjects,
  totalBoards,
  isLoading = false,
}: WorkspacesOverviewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Briefcase className="w-5 h-5" />
        </div>
        <div>
          {isLoading ? (
            <div
              className="h-7 w-8 rounded bg-muted animate-pulse"
              role="status"
              aria-label="Loading count"
            />
          ) : (
            <div className="text-xl font-bold text-foreground">{workspacesCount}</div>
          )}
          <div className="text-xs text-muted-foreground">Workspaces</div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          {isLoading ? (
            <div
              className="h-7 w-8 rounded bg-muted animate-pulse"
              role="status"
              aria-label="Loading count"
            />
          ) : (
            <div className="text-xl font-bold text-foreground">{totalProjects}</div>
          )}
          <div className="text-xs text-muted-foreground">Active Projects</div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          {isLoading ? (
            <div
              className="h-7 w-8 rounded bg-muted animate-pulse"
              role="status"
              aria-label="Loading count"
            />
          ) : (
            <div className="text-xl font-bold text-foreground">{totalBoards}</div>
          )}
          <div className="text-xs text-muted-foreground">Kanban Boards</div>
        </div>
      </div>

      <Link
        to="/my-tasks"
        className="p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex items-center gap-3 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors group"
      >
        <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
          <Plus className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            My Tasks
          </div>
          <div className="text-[11px] text-muted-foreground truncate">View assigned work →</div>
        </div>
      </Link>
    </div>
  );
}
