import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTimesheet, deleteTimeLog } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Clock, DollarSign, Users, Download, Layers, TrashIcon } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { EnterpriseDataGrid, type ColumnDef } from '../components/common/EnterpriseDataGrid';
import { SearchableSelect } from '../components/ui/SearchableSelect';

export function Timesheets() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [dateRange, setDateRange] = useState<string>('30days');

  // Compute date filter
  const getDates = () => {
    const now = new Date();
    if (dateRange === '7days') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      };
    }
    if (dateRange === '30days') {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      };
    }
    if (dateRange === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      };
    }
    return {};
  };

  const dates = getDates();

  const {
    data: timesheetData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['timesheets', selectedUserId, dateRange],
    queryFn: () =>
      getTimesheet({
        userId: selectedUserId || undefined,
        startDate: dates.startDate,
        endDate: dates.endDate,
      }),
  });

  // True while the first load is in flight (subsequent refetches keep old data).
  const isInitialLoading = isLoading && !timesheetData;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTimeLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });

  const entries = timesheetData?.entries || [];

  // Export CSV Handler
  const exportCSV = () => {
    if (entries.length === 0) return;

    const headers = [
      'Date',
      'User',
      'Task',
      'Project',
      'Description',
      'Duration (Hours)',
      'Billable',
    ];
    const rows = entries.map((e: any) => [
      `"${e.loggedDate}"`,
      `"${e.user?.name || 'Unknown'}"`,
      `"${e.card?.title || 'Untitled Task'}"`,
      `"${e.project?.name || 'Unknown'}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      (e.minutes / 60).toFixed(2),
      e.isBillable ? 'Yes' : 'No',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `timesheets_export_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Columns for EnterpriseDataGrid ───
  const columns: ColumnDef<any>[] = useMemo(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessorKey: 'loggedDate',
        sortable: true,
        filterable: true,
        width: '120px',
        cell: ({ value }) => (
          <span className="font-mono text-muted-foreground whitespace-nowrap">{value}</span>
        ),
      },
      {
        id: 'member',
        header: 'Member',
        accessorFn: (row) => row.user?.name || 'Unassigned',
        sortable: true,
        filterable: true,
        cell: ({ row, value }) => (
          <div className="flex items-center gap-2 whitespace-nowrap">
            {row.user?.avatarUrl ? (
              <img
                src={row.user.avatarUrl}
                alt={value}
                className="w-6 h-6 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
                {value?.substring(0, 2).toUpperCase() || 'U'}
              </div>
            )}
            <span className="font-medium text-foreground">{value}</span>
          </div>
        ),
      },
      {
        id: 'task',
        header: 'Task',
        accessorFn: (row) => row.card?.title || 'Untitled Card',
        sortable: true,
        filterable: true,
        cell: ({ value }) => (
          <span className="font-medium text-foreground max-w-xs truncate block" title={value}>
            {value}
          </span>
        ),
      },
      {
        id: 'project',
        header: 'Project',
        accessorFn: (row) => row.project?.name || '—',
        sortable: true,
        filterable: true,
        cell: ({ value }) => (
          <span className="text-muted-foreground whitespace-nowrap">{value}</span>
        ),
      },
      {
        id: 'description',
        header: 'Description',
        accessorKey: 'description',
        sortable: true,
        cell: ({ value }) => (
          <span className="text-muted-foreground max-w-sm truncate block" title={value}>
            {value || <span className="italic text-muted/60">—</span>}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        accessorFn: (row) => (row.isBillable ? 'Billable' : 'Non-billable'),
        sortable: true,
        filterable: true,
        width: '120px',
        cell: ({ value }) => (
          <span
            className={`px-2.5 py-0.5 rounded-full font-semibold text-[10px] whitespace-nowrap ${
              value === 'Billable'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                : 'bg-muted text-muted-foreground border border-border/60'
            }`}
          >
            {value}
          </span>
        ),
      },
      {
        id: 'duration',
        header: 'Duration',
        accessorFn: (row) => row.minutes / 60,
        sortable: true,
        align: 'right',
        width: '110px',
        cell: ({ value }) => (
          <span className="font-mono font-bold text-foreground">
            {Number(value).toFixed(1)} hrs
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Action',
        align: 'center',
        width: '80px',
        cell: ({ row }) =>
          row.user?.id === user?.id ? (
            <button
              className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate(row.id);
              }}
              title="Delete entry"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-muted-foreground/40 text-xs">—</span>
          ),
      },
    ],
    [user?.id, deleteMutation]
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Timesheets &amp; Hours
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track resource allocation, team timesheet entries, and billable work across all
            workspaces.
          </p>
        </div>

        {/* Global Range & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-36">
            <SearchableSelect
              options={[
                { value: '7days', label: 'Last 7 Days' },
                { value: '30days', label: 'Last 30 Days' },
                { value: 'all', label: 'All Time' },
              ]}
              value={dateRange}
              onChange={setDateRange}
              placeholder="Select Range"
              size="sm"
              triggerClassName="h-8 text-xs bg-muted/40"
            />
          </div>

          <div className="w-48 shrink-0">
            {timesheetData?.byUser && timesheetData.byUser.length > 0 ? (
              <SearchableSelect
                options={[
                  { value: '', label: 'All Team Members' },
                  ...timesheetData.byUser.map((u: any) => ({
                    value: u.userId,
                    label: u.user?.name || 'Member',
                    sublabel: u.user?.email,
                    avatarUrl: u.user?.avatarUrl,
                  })),
                ]}
                value={selectedUserId}
                onChange={setSelectedUserId}
                placeholder="All Members"
                size="sm"
                triggerClassName="h-8 text-xs bg-muted/40"
              />
            ) : (
              <div
                className="h-8 rounded-lg bg-muted/40 border border-transparent animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={entries.length === 0}
            title={
              entries.length === 0
                ? 'No timesheet entries match the current filters'
                : 'Export the entries currently listed as CSV'
            }
            className="gap-1.5 ml-auto"
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Logged Hours */}
        <div className="p-5 rounded-2xl border bg-card/60 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Total Logged
            </span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-foreground">
            {isInitialLoading ? (
              <span
                className="inline-block h-7 w-20 rounded bg-muted animate-pulse"
                aria-label="Loading"
              />
            ) : (
              `${(timesheetData?.totalMinutes ? timesheetData.totalMinutes / 60 : 0).toFixed(1)} hrs`
            )}
          </div>
          <p className="text-xs text-muted-foreground">Across selected period</p>
        </div>

        {/* Billable Hours */}
        <div className="p-5 rounded-2xl border bg-card/60 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Billable Hours
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {isInitialLoading ? (
              <span
                className="inline-block h-7 w-20 rounded bg-muted animate-pulse"
                aria-label="Loading"
              />
            ) : (
              `${(timesheetData?.billableMinutes ? timesheetData.billableMinutes / 60 : 0).toFixed(1)} hrs`
            )}
          </div>
          <p className="text-xs text-muted-foreground">Client billable work</p>
        </div>

        {/* Utilization / Billable % */}
        <div className="p-5 rounded-2xl border bg-card/60 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Billable Rate
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-foreground">
            {isInitialLoading ? (
              <span
                className="inline-block h-7 w-12 rounded bg-muted animate-pulse"
                aria-label="Loading"
              />
            ) : (
              `${
                timesheetData?.totalMinutes
                  ? Math.round((timesheetData.billableMinutes / timesheetData.totalMinutes) * 100)
                  : 0
              }%`
            )}
          </div>
          <p className="text-xs text-muted-foreground">Billable vs Non-billable</p>
        </div>

        {/* Active Members */}
        <div className="p-5 rounded-2xl border bg-card/60 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Contributors
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-foreground">
            {isInitialLoading ? (
              <span
                className="inline-block h-7 w-10 rounded bg-muted animate-pulse"
                aria-label="Loading"
              />
            ) : (
              timesheetData?.byUser?.length || 0
            )}
          </div>
          <p className="text-xs text-muted-foreground">Team members logged time</p>
        </div>
      </div>

      {/* Member Breakdown & Project Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Breakdown */}
        <div className="p-5 rounded-2xl border bg-card/60 backdrop-blur-sm space-y-4">
          <h3 className="font-bold text-sm text-foreground">Logged Hours by Team Member</h3>
          {isInitialLoading ? (
            <div className="space-y-3" aria-label="Loading breakdown">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded-lg bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : timesheetData?.byUser && timesheetData.byUser.length > 0 ? (
            <div className="space-y-3">
              {timesheetData.byUser.map((u: any) => {
                const totalHours = (timesheetData.totalMinutes || 1) / 60;
                const userHours = u.totalMinutes / 60;
                const pct = Math.round((userHours / totalHours) * 100);

                return (
                  <div key={u.userId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {u.user?.avatarUrl ? (
                          <img
                            src={u.user.avatarUrl}
                            alt={u.user.name}
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[9px]">
                            {u.user?.name ? u.user.name.substring(0, 1) : 'U'}
                          </div>
                        )}
                        <span className="font-medium text-foreground">{u.user?.name}</span>
                      </div>
                      <span className="font-mono text-muted-foreground font-semibold">
                        {userHours.toFixed(1)} hrs ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {isError
                ? 'Couldn’t load the breakdown. Try again.'
                : 'No member breakdown available.'}
            </p>
          )}
        </div>

        {/* Project Breakdown */}
        <div className="p-5 rounded-2xl border bg-card/60 backdrop-blur-sm space-y-4">
          <h3 className="font-bold text-sm text-foreground">Logged Hours by Project</h3>
          {isInitialLoading ? (
            <div className="space-y-3" aria-label="Loading breakdown">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded-lg bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : timesheetData?.byProject && timesheetData.byProject.length > 0 ? (
            <div className="space-y-3">
              {timesheetData.byProject.map((p: any) => {
                const totalHours = (timesheetData.totalMinutes || 1) / 60;
                const projHours = p.totalMinutes / 60;
                const pct = Math.round((projHours / totalHours) * 100);

                return (
                  <div key={p.projectId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground truncate max-w-xs">
                        {p.projectName}
                      </span>
                      <span className="font-mono text-muted-foreground font-semibold">
                        {projHours.toFixed(1)} hrs ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {isError ? 'Couldn’t load the breakdown. Try again.' : 'No project breakdown.'}
            </p>
          )}
        </div>
      </div>

      {/* ─── Upgraded Detailed Work Log Table with EnterpriseDataGrid ─── */}
      <EnterpriseDataGrid
        columns={columns}
        data={entries}
        isLoading={isLoading}
        isError={isError}
        errorMessage="Couldn't load time entries. Check your connection and try again."
        onRetry={() => refetch()}
        defaultPageSize={15}
        pageSizeOptions={[15, 30, 50, 100]}
        title="Detailed Log Entries"
        subtitle="Interactive Excel-like multi-select filters, column sorting, search, and pagination."
        exportFileName="timesheets_detailed_logs"
        emptyMessage="No time entries recorded for this filter."
        emptyIcon={<Clock className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />}
      />
    </div>
  );
}
