import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getWorkspacePortfolio } from '../lib/api';
import {
  Briefcase,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  BarChart3,
  BookOpen,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';

export function PortfolioDashboard() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ['workspacePortfolio', workspaceId],
    queryFn: () => getWorkspacePortfolio(workspaceId!),
    enabled: !!workspaceId,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 pb-16" aria-label="Loading portfolio">
        {/* Header mirror */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
          <div>
            <div className="h-3 w-32 rounded bg-muted/60 animate-pulse mb-2" />
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-muted animate-pulse shrink-0" />
              <div className="space-y-2">
                <div className="h-7 w-80 max-w-full rounded-lg bg-muted animate-pulse" />
                <div className="h-4 w-96 max-w-full rounded bg-muted/60 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
        {/* KPI mirror */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-2xl border bg-card/40 space-y-2">
              <div className="h-3 w-24 rounded bg-muted/70 animate-pulse" />
              <div className="h-8 w-16 rounded-lg bg-muted animate-pulse" />
            </div>
          ))}
        </div>
        {/* Projects grid mirror */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-2xl border bg-card/40 space-y-3">
              <div className="h-5 w-1/2 rounded-lg bg-muted animate-pulse" />
              <div className="h-2 rounded-full bg-muted/60 animate-pulse" />
              <div className="flex gap-4">
                <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
                <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const summary = portfolio?.summary || {
    totalProjects: 0,
    totalCards: 0,
    totalCompletedCards: 0,
    overallCompletionRate: 0,
    totalStoryPoints: 0,
  };

  const projects = portfolio?.projects || [];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to="/"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Workspaces
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {portfolio?.workspace?.name || 'Workspace'} Portfolio Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Executive multi-project health overview, milestone tracking, and cross-team
                delivery.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Projects */}
        <div className="p-5 rounded-2xl border bg-card/70 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
            <span>Tracked Projects</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold">{summary.totalProjects}</div>
          <p className="text-[11px] text-muted-foreground">Active in this workspace</p>
        </div>

        {/* Global Completion */}
        <div className="p-5 rounded-2xl border bg-card/70 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
            <span>Overall Completion</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold">{summary.overallCompletionRate}%</div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full"
              style={{ width: `${summary.overallCompletionRate}%` }}
            />
          </div>
        </div>

        {/* Total Work Items */}
        <div className="p-5 rounded-2xl border bg-card/70 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
            <span>Total Tasks</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-3xl font-bold">{summary.totalCards}</div>
          <p className="text-[11px] text-muted-foreground">
            {summary.totalCompletedCards} completed across all boards
          </p>
        </div>

        {/* Total Story Points */}
        <div className="p-5 rounded-2xl border bg-card/70 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
            <span>Total Story Points</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-3xl font-bold">{summary.totalStoryPoints} pts</div>
          <p className="text-[11px] text-muted-foreground">Total estimation volume</p>
        </div>
      </div>

      {/* Projects Health Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Project Health &amp; Progress</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {projects.map((proj: any) => {
            const healthColor =
              proj.health === 'critical'
                ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                : proj.health === 'at_risk'
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';

            const healthLabel =
              proj.health === 'critical'
                ? 'Critical Attention'
                : proj.health === 'at_risk'
                  ? 'At Risk'
                  : 'On Track';

            return (
              <div
                key={proj.id}
                className="p-5 rounded-2xl border bg-card/80 shadow-xs space-y-4 hover:border-primary/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="font-bold text-base text-foreground">{proj.name}</h3>
                      <span className="text-xs text-muted-foreground capitalize font-medium">
                        Status: {proj.status}
                      </span>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${healthColor}`}
                    >
                      {healthLabel}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5 mt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-semibold font-mono">
                        {proj.metrics.completionRate}% ({proj.metrics.completedCards}/
                        {proj.metrics.totalCards} tasks)
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{ width: `${proj.metrics.completionRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats Badges */}
                  <div className="grid grid-cols-3 gap-2 pt-4 text-center">
                    <div className="p-2 rounded-xl bg-muted/40 text-xs">
                      <span className="text-muted-foreground block text-[10px]">Points</span>
                      <span className="font-bold text-foreground">
                        {proj.metrics.totalStoryPoints}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-muted/40 text-xs">
                      <span className="text-muted-foreground block text-[10px]">Overdue</span>
                      <span
                        className={`font-bold ${
                          proj.metrics.overdueCards > 0 ? 'text-rose-500' : 'text-foreground'
                        }`}
                      >
                        {proj.metrics.overdueCards}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-muted/40 text-xs">
                      <span className="text-muted-foreground block text-[10px]">Sprint</span>
                      <span className="font-bold text-foreground truncate block">
                        {proj.activeSprint ? proj.activeSprint.name : 'None'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Direct Action Links */}
                <div className="flex items-center justify-between pt-3 border-t text-xs">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/projects/${proj.id}/reports`}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-indigo-500" /> Reports
                    </Link>
                    <span className="text-muted-foreground">•</span>
                    <Link
                      to={`/projects/${proj.id}/docs`}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-teal-500" /> Docs
                    </Link>
                  </div>

                  <Link to={`/projects/${proj.id}/sprints`}>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                      View Sprints <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
