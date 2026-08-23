import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getProjectSummaryReport,
  getProjectVelocity,
  getSprintBurndown,
  getProjectCFD,
  getProjectCycleTime,
} from '../lib/api';
import { sprintsService } from '../lib/sprintsService';
import {
  BarChart3,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowLeft,
  Flame,
  Target,
  Waves,
  Timer,
  Zap,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';

export function ProjectReports() {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<'burndown' | 'cfd' | 'cycleTime'>('burndown');
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [cfdDays, setCfdDays] = useState<number>(14);

  // 1. Project Summary Metrics
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['projectReportsSummary', projectId],
    queryFn: () => getProjectSummaryReport(projectId!),
    enabled: !!projectId,
  });

  // 2. Velocity Report
  const { data: velocityData } = useQuery({
    queryKey: ['projectVelocity', projectId],
    queryFn: () => getProjectVelocity(projectId!),
    enabled: !!projectId,
  });

  // 3. Project Sprints
  const { data: sprints } = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => sprintsService.getSprints(projectId!),
    enabled: !!projectId,
  });

  // Set default sprint if not selected
  const activeSprint = sprints?.find((s: any) => s.status === 'active') || sprints?.[0];
  const currentSprintId = selectedSprintId || activeSprint?.id;

  // 4. Sprint Burndown
  const { data: burndown } = useQuery({
    queryKey: ['sprintBurndown', currentSprintId],
    queryFn: () => getSprintBurndown(currentSprintId!),
    enabled: !!currentSprintId,
  });

  // 5. Cumulative Flow Diagram
  const { data: cfdData } = useQuery({
    queryKey: ['projectCFD', projectId, cfdDays],
    queryFn: () => getProjectCFD(projectId!, cfdDays),
    enabled: activeTab === 'cfd' && !!projectId,
  });

  // 6. Lead & Cycle Time
  const { data: cycleTimeData } = useQuery({
    queryKey: ['projectCycleTime', projectId],
    queryFn: () => getProjectCycleTime(projectId!),
    enabled: activeTab === 'cycleTime' && !!projectId,
  });

  if (isSummaryLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading project analytics...</p>
        </div>
      </div>
    );
  }

  const metrics = summary?.metrics || {
    totalCards: 0,
    completedCards: 0,
    overdueCards: 0,
    completionRate: 0,
    totalStoryPoints: 0,
    completedStoryPoints: 0,
    sprintsCount: 0,
    activeSprintsCount: 0,
  };

  const stageCategories = summary?.stageCategories || {
    not_started: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
  };

  const totalStageCards =
    stageCategories.not_started +
    stageCategories.in_progress +
    stageCategories.blocked +
    stageCategories.done;

  // Burndown chart coordinates
  const burndownPoints = burndown?.burndownData || [];
  const maxPoints = Math.max(1, burndown?.totalStoryPoints || 10);
  const chartHeight = 220;
  const chartWidth = 650;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // CFD calculations
  const cfdTimeline = cfdData?.timeline || [];
  const maxCfdCards = Math.max(1, ...cfdTimeline.map((t: any) => t.total || 0), 10);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to="/"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {summary?.project?.name || 'Project'} Analytics & Reports
              </h1>
              <p className="text-sm text-muted-foreground">
                Real-time visibility into sprint burndown, cumulative flow, and resolution velocity.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link to={`/projects/${projectId}/sprints`}>
            <Button variant="outline" size="sm" className="gap-2">
              <Target className="w-4 h-4 text-indigo-500" /> Sprint Planner
            </Button>
          </Link>
          <Link to={`/projects/${projectId}/docs`}>
            <Button variant="outline" size="sm" className="gap-2">
              <Layers className="w-4 h-4 text-teal-500" /> Docs & Specs
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Completion Rate */}
        <div className="p-5 rounded-xl border bg-card/60 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Completion Rate
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">{metrics.completionRate}%</span>
            <span className="text-xs text-muted-foreground">
              ({metrics.completedCards} / {metrics.totalCards} tasks)
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${metrics.completionRate}%` }}
            />
          </div>
        </div>

        {/* Story Points Burned */}
        <div className="p-5 rounded-xl border bg-card/60 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Story Points Burned
            </span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
              {metrics.completedStoryPoints}
            </span>
            <span className="text-xs text-muted-foreground">/ {metrics.totalStoryPoints} total pts</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${
                  metrics.totalStoryPoints > 0
                    ? Math.min(100, (metrics.completedStoryPoints / metrics.totalStoryPoints) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        {/* Overdue Tasks */}
        <div className="p-5 rounded-xl border bg-card/60 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Overdue Tasks
            </span>
            <div
              className={`p-2 rounded-lg ${
                metrics.overdueCards > 0
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-bold tracking-tight ${
                metrics.overdueCards > 0 ? 'text-rose-600 dark:text-rose-400' : ''
              }`}
            >
              {metrics.overdueCards}
            </span>
            <span className="text-xs text-muted-foreground">require immediate action</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            {metrics.overdueCards === 0 ? '✨ All deadlines on track' : '⚠️ Overdue items impacting sprint'}
          </p>
        </div>

        {/* Sprints Tracked */}
        <div className="p-5 rounded-xl border bg-card/60 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Sprints
            </span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-purple-600 dark:text-purple-400">
              {metrics.activeSprintsCount}
            </span>
            <span className="text-xs text-muted-foreground">
              ({metrics.sprintsCount} total planned)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            {summary?.activeSprint ? `Current: ${summary.activeSprint.name}` : 'No active sprint running'}
          </p>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-2 border-b pb-1">
        <button
          onClick={() => setActiveTab('burndown')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'burndown'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" /> Sprint Burndown &amp; Velocity
        </button>
        <button
          onClick={() => setActiveTab('cfd')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'cfd'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Waves className="w-3.5 h-3.5" /> Cumulative Flow (CFD)
        </button>
        <button
          onClick={() => setActiveTab('cycleTime')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'cycleTime'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Timer className="w-3.5 h-3.5" /> Lead &amp; Cycle Time
        </button>
      </div>

      {/* TAB 1: SPRINT BURNDOWN & VELOCITY */}
      {activeTab === 'burndown' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Burndown Chart Card (8 Cols) */}
          <div className="lg:col-span-8 p-6 rounded-2xl border bg-card/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-indigo-500" /> Sprint Burndown Chart
                </h3>
                <p className="text-xs text-muted-foreground">
                  Actual story points remaining vs. ideal linear progression trajectory.
                </p>
              </div>

              {/* Sprint Selector */}
              {sprints && sprints.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 rounded-lg border bg-background px-2.5 text-xs font-medium focus:ring-1 focus:ring-primary"
                    value={currentSprintId}
                    onChange={(e) => setSelectedSprintId(e.target.value)}
                  >
                    {sprints.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* SVG Burndown Rendering */}
            {burndownPoints.length > 0 ? (
              <div className="w-full overflow-x-auto pt-2">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto min-w-[500px]"
                >
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = padding.top + innerHeight * (1 - ratio);
                    const val = Math.round(maxPoints * ratio);
                    return (
                      <g key={ratio}>
                        <line
                          x1={padding.left}
                          y1={y}
                          x2={padding.left + innerWidth}
                          y2={y}
                          stroke="currentColor"
                          className="text-muted/30"
                          strokeDasharray="4 4"
                        />
                        <text
                          x={padding.left - 10}
                          y={y + 4}
                          textAnchor="end"
                          className="text-[10px] fill-muted-foreground font-mono"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Ideal Linear Line (Dashed) */}
                  <line
                    x1={padding.left}
                    y1={padding.top}
                    x2={padding.left + innerWidth}
                    y2={padding.top + innerHeight}
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeDasharray="6 6"
                  />

                  {/* Actual Burndown Polyline & Fill */}
                  {(() => {
                    const polyPoints = burndownPoints.map((pt: any, idx: number) => {
                      const x =
                        padding.left +
                        (idx / Math.max(1, burndownPoints.length - 1)) * innerWidth;
                      const y =
                        padding.top +
                        innerHeight * (1 - pt.actualRemaining / maxPoints);
                      return `${x},${y}`;
                    });

                    const areaPoints = [
                      `${padding.left},${padding.top + innerHeight}`,
                      ...polyPoints,
                      `${padding.left + innerWidth},${padding.top + innerHeight}`,
                    ].join(' ');

                    return (
                      <>
                        <polygon
                          points={areaPoints}
                          className="fill-indigo-500/10 dark:fill-indigo-500/20"
                        />
                        <polyline
                          points={polyPoints.join(' ')}
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {burndownPoints.map((pt: any, idx: number) => {
                          const x =
                            padding.left +
                            (idx / Math.max(1, burndownPoints.length - 1)) * innerWidth;
                          const y =
                            padding.top +
                            innerHeight * (1 - pt.actualRemaining / maxPoints);
                          return (
                            <circle
                              key={idx}
                              cx={x}
                              cy={y}
                              r="4"
                              className="fill-white dark:fill-slate-900 stroke-indigo-600 stroke-2 hover:r-6 transition-all"
                            />
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-t-2 border-dashed border-slate-400" />
                    <span>Ideal Burndown</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-indigo-500 rounded-full" />
                    <span className="font-semibold text-foreground">Actual Remaining Points</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground italic">
                No active sprint timeline found. Start a sprint to view real-time burndown.
              </div>
            )}
          </div>

          {/* Velocity History Card (4 Cols) */}
          <div className="lg:col-span-4 p-6 rounded-2xl border bg-card/80 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-500" /> Sprint Velocity
              </h3>
              <p className="text-xs text-muted-foreground">
                Story points planned vs. completed per sprint.
              </p>

              {/* Velocity Avg */}
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 mt-4">
                <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                  Average Velocity
                </div>
                <div className="text-2xl font-bold text-foreground mt-1">
                  {velocityData?.averageVelocity || 0}{' '}
                  <span className="text-xs font-normal text-muted-foreground">pts / sprint</span>
                </div>
              </div>

              {/* Sprints List */}
              <div className="space-y-3 mt-4">
                {velocityData?.sprints && velocityData.sprints.length > 0 ? (
                  velocityData.sprints.map((s: any) => (
                    <div key={s.sprintId} className="space-y-1 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="font-medium text-foreground">{s.name}</span>
                        <span className="font-mono font-semibold">
                          {s.completedPoints} / {s.plannedPoints} pts
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden flex">
                        <div
                          className="bg-purple-500 h-full rounded-full"
                          style={{
                            width: `${
                              s.plannedPoints > 0
                                ? Math.min(100, (s.completedPoints / s.plannedPoints) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic">No completed sprints recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CUMULATIVE FLOW DIAGRAM (CFD) */}
      {activeTab === 'cfd' && (
        <div className="p-6 rounded-2xl border bg-card/80 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Waves className="w-4 h-4 text-indigo-500" /> Cumulative Flow Diagram (CFD)
              </h3>
              <p className="text-xs text-muted-foreground">
                Work-in-progress (WIP) distribution over time. Widening bands indicate bottlenecks.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Window:</span>
              <select
                className="h-8 rounded-lg border bg-background px-2.5 text-xs font-medium focus:ring-1 focus:ring-primary"
                value={cfdDays}
                onChange={(e) => setCfdDays(Number(e.target.value))}
              >
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days</option>
              </select>
            </div>
          </div>

          {/* CFD Stacked Area Rendering */}
          {cfdTimeline.length > 0 ? (
            <div className="space-y-4 pt-2">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto min-w-[500px]">
                {/* Y Axis Grid */}
                {[0, 0.5, 1].map((ratio) => {
                  const y = padding.top + innerHeight * (1 - ratio);
                  return (
                    <g key={ratio}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={padding.left + innerWidth}
                        y2={y}
                        stroke="currentColor"
                        className="text-muted/30"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding.left - 10}
                        y={y + 4}
                        textAnchor="end"
                        className="text-[10px] fill-muted-foreground font-mono"
                      >
                        {Math.round(maxCfdCards * ratio)}
                      </text>
                    </g>
                  );
                })}

                {/* Stacked stage lines */}
                {(() => {
                  const donePoints = cfdTimeline.map((pt: any, i: number) => {
                    const x = padding.left + (i / Math.max(1, cfdTimeline.length - 1)) * innerWidth;
                    const y = padding.top + innerHeight * (1 - pt.done / maxCfdCards);
                    return `${x},${y}`;
                  });

                  return (
                    <>
                      <polygon
                        points={`${padding.left},${padding.top + innerHeight} ${donePoints.join(' ')} ${padding.left + innerWidth},${padding.top + innerHeight}`}
                        className="fill-emerald-500/30"
                      />
                      <polyline
                        points={donePoints.join(' ')}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                      />
                    </>
                  );
                })()}
              </svg>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                  <span>Done</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-blue-500" />
                  <span>In Progress</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-rose-500" />
                  <span>Blocked</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-400" />
                  <span>Not Started</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground italic">
              Insufficient timeline data for cumulative flow calculation.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LEAD & CYCLE TIME */}
      {activeTab === 'cycleTime' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Key Metrics */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-5 rounded-2xl border bg-card/80 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Timer className="w-4 h-4 text-blue-500" /> Average Lead Time
              </div>
              <div className="text-3xl font-bold text-foreground">
                {cycleTimeData?.metrics?.avgLeadTimeDays || 0}{' '}
                <span className="text-xs font-normal text-muted-foreground">days</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Time elapsed from task creation to final completion.
              </p>
            </div>

            <div className="p-5 rounded-2xl border bg-card/80 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Zap className="w-4 h-4 text-amber-500" /> Average Cycle Time
              </div>
              <div className="text-3xl font-bold text-foreground">
                {cycleTimeData?.metrics?.avgCycleTimeDays || 0}{' '}
                <span className="text-xs font-normal text-muted-foreground">days</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Active work duration from in-progress to done.
              </p>
            </div>

            <div className="p-5 rounded-2xl border bg-card/80 shadow-xs space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                85th Percentile SLA Benchmark
              </div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {cycleTimeData?.metrics?.p85LeadTimeDays || 0} days
              </div>
              <p className="text-[11px] text-muted-foreground">
                85% of tasks are completed within this timeframe.
              </p>
            </div>
          </div>

          {/* Recent Completed Tasks List */}
          <div className="lg:col-span-8 p-6 rounded-2xl border bg-card/80 shadow-xs space-y-4">
            <h3 className="font-semibold text-base">Completed Task Performance History</h3>
            {cycleTimeData?.dataPoints && cycleTimeData.dataPoints.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 border-b text-muted-foreground uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Completed Task</th>
                      <th className="py-2.5 px-3">Lead Time</th>
                      <th className="py-2.5 px-3">Cycle Time</th>
                      <th className="py-2.5 px-3">Completed Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cycleTimeData.dataPoints.map((item: any) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="py-2.5 px-3 font-medium text-foreground">{item.title}</td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground">{item.leadTimeDays}d</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-600 font-semibold">{item.cycleTimeDays}d</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{item.completedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                No completed cards available for cycle time analysis.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage Categories Distribution (Common across tabs) */}
      <div className="p-6 rounded-2xl border bg-card/80 shadow-xs space-y-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-500" /> Stage Category Breakdown
        </h3>

        {/* Stacked Bar */}
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-muted">
          {totalStageCards > 0 && (
            <>
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${(stageCategories.done / totalStageCards) * 100}%` }}
                title={`Done: ${stageCategories.done}`}
              />
              <div
                className="bg-blue-500 h-full"
                style={{ width: `${(stageCategories.in_progress / totalStageCards) * 100}%` }}
                title={`In Progress: ${stageCategories.in_progress}`}
              />
              <div
                className="bg-rose-500 h-full"
                style={{ width: `${(stageCategories.blocked / totalStageCards) * 100}%` }}
                title={`Blocked: ${stageCategories.blocked}`}
              />
              <div
                className="bg-slate-400 h-full"
                style={{ width: `${(stageCategories.not_started / totalStageCards) * 100}%` }}
                title={`Not Started: ${stageCategories.not_started}`}
              />
            </>
          )}
        </div>

        {/* Stage Stat Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold block">Done</span>
            <span className="text-lg font-bold text-foreground">{stageCategories.done}</span>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
            <span className="text-blue-600 dark:text-blue-400 font-semibold block">In Progress</span>
            <span className="text-lg font-bold text-foreground">{stageCategories.in_progress}</span>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs">
            <span className="text-rose-600 dark:text-rose-400 font-semibold block">Blocked</span>
            <span className="text-lg font-bold text-foreground">{stageCategories.blocked}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20 text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-semibold block">Not Started</span>
            <span className="text-lg font-bold text-foreground">{stageCategories.not_started}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
