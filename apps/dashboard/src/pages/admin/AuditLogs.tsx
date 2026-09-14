import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLogs } from '../../lib/api';
import { FileText, Eye, ShieldCheck, Globe } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { EnterpriseDataGrid, type ColumnDef } from '../../components/common/EnterpriseDataGrid';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

export function AuditLogs() {
  const [dateRange, setDateRange] = useState<string>('30days');
  const [inspectMetadata, setInspectMetadata] = useState<any>(null);

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
    return {};
  };

  const dates = getDates();

  const {
    data: auditData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['auditLogs', dateRange],
    queryFn: () =>
      getAuditLogs({
        startDate: dates.startDate,
        endDate: dates.endDate,
        limit: 100,
      }),
  });

  const logs = auditData?.logs || [];

  // ─── Columns for EnterpriseDataGrid ───
  const columns: ColumnDef<any>[] = useMemo(
    () => [
      {
        id: 'timestamp',
        header: 'Timestamp',
        accessorKey: 'createdAt',
        sortable: true,
        width: '170px',
        cell: ({ value }) => (
          <span className="font-mono text-muted-foreground whitespace-nowrap">
            {new Date(value).toLocaleString()}
          </span>
        ),
      },
      {
        id: 'actor',
        header: 'Actor',
        accessorFn: (row) => row.actor?.name || 'System / Service',
        sortable: true,
        filterable: true,
        cell: ({ row, value }) => (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
              {row.actor?.name?.substring(0, 2).toUpperCase() || 'SYS'}
            </div>
            <div>
              <p className="font-medium text-foreground">{value}</p>
              {row.actor?.email && (
                <p className="text-[10px] text-muted-foreground">{row.actor.email}</p>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'action',
        header: 'Action',
        accessorKey: 'action',
        sortable: true,
        filterable: true,
        width: '140px',
        cell: ({ value }) => (
          <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono font-semibold text-foreground whitespace-nowrap">
            {value}
          </span>
        ),
      },
      {
        id: 'target',
        header: 'Target Resource',
        accessorKey: 'target',
        sortable: true,
        cell: ({ value }) => (
          <span className="max-w-xs truncate text-foreground font-medium block" title={value}>
            {value || <span className="text-muted-foreground italic">—</span>}
          </span>
        ),
      },
      {
        id: 'ipAddress',
        header: 'Network / IP',
        accessorFn: (row) => row.ipAddress || 'Internal',
        sortable: true,
        filterable: true,
        width: '190px',
        cell: ({ value }) => (
          <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
            <Globe className="w-3 h-3 text-muted-foreground" />
            <span>{value}</span>
          </div>
        ),
      },
      {
        id: 'metadata',
        header: 'Metadata',
        align: 'center',
        width: '100px',
        cell: ({ row }) =>
          row.metadata && Object.keys(row.metadata).length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] gap-1 hover:bg-primary/10 text-primary"
              onClick={(e) => {
                e.stopPropagation();
                setInspectMetadata(row);
              }}
            >
              <Eye className="w-3 h-3" /> View JSON
            </Button>
          ) : (
            <span className="text-muted-foreground text-[10px] italic">None</span>
          ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Audit Trail & Compliance Logs</h1>
              <p className="text-sm text-muted-foreground">
                Immutable record of administrative, security, and data modification events.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium hidden sm:inline-block">
            Time Range:
          </span>
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
              triggerClassName="h-9 text-xs bg-card"
            />
          </div>
        </div>
      </div>

      {/* ─── Upgraded Audit Log Grid with EnterpriseDataGrid ─── */}
      <EnterpriseDataGrid
        columns={columns}
        data={logs}
        isLoading={isLoading}
        isError={isError}
        errorMessage="Couldn't load audit events. Check your connection and try again."
        onRetry={() => refetch()}
        defaultPageSize={15}
        pageSizeOptions={[15, 30, 50, 100]}
        title="Compliance Event Stream"
        subtitle="Filter by event actor, action category, or IP address with full search and pagination."
        exportFileName="audit_compliance_logs"
        emptyMessage="No audit events recorded for this period."
        emptyIcon={<FileText className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />}
      />

      {/* JSON Metadata Inspector Dialog */}
      <Dialog open={!!inspectMetadata} onOpenChange={(open) => !open && setInspectMetadata(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
          {/* ─── Fixed Header ─── */}
          <DialogHeader className="p-5 sm:px-6 border-b border-border/80 bg-card/90 backdrop-blur-md shrink-0 space-y-1">
            <DialogTitle className="text-base font-bold pr-8">
              Event Metadata: {inspectMetadata?.action}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Recorded on {inspectMetadata && new Date(inspectMetadata.createdAt).toLocaleString()}{' '}
              by {inspectMetadata?.actor?.name || 'System'}.
            </DialogDescription>
          </DialogHeader>

          {/* ─── Scrollable Body ─── */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <pre className="p-4 rounded-xl bg-muted/60 border border-border text-xs font-mono overflow-x-auto text-foreground leading-relaxed">
              {inspectMetadata ? JSON.stringify(inspectMetadata.metadata, null, 2) : ''}
            </pre>
          </div>

          {/* ─── Fixed Bottom Footer ─── */}
          <div className="p-4 sm:px-6 border-t border-border/80 bg-card/90 backdrop-blur-md shrink-0 flex items-center justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInspectMetadata(null)}
              className="cursor-pointer text-xs px-5"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
