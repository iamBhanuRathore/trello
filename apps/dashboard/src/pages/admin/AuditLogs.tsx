import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLogs } from '../../lib/api';
import {
  FileText,
  Download,
  Filter,
  Eye,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { EnterpriseDataGrid, type ColumnDef } from '../../components/common/EnterpriseDataGrid';

export function AuditLogs() {
  const [selectedAction, setSelectedAction] = useState<string>('');
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

  const { data: auditData, isLoading } = useQuery({
    queryKey: ['auditLogs', selectedAction, dateRange],
    queryFn: () =>
      getAuditLogs({
        action: selectedAction || undefined,
        startDate: dates.startDate,
        endDate: dates.endDate,
        limit: 100,
      }),
  });

  const logs = auditData?.logs || [];

  const exportCSV = () => {
    if (logs.length === 0) return;

    const headers = ['Timestamp', 'Actor', 'Action', 'Target', 'IP Address', 'User Agent'];
    const rows = logs.map((log: any) => [
      `"${new Date(log.createdAt).toISOString()}"`,
      `"${log.actor?.name || 'System / Service'}"`,
      `"${log.action}"`,
      `"${log.target || ''}"`,
      `"${log.ipAddress || ''}"`,
      `"${(log.userAgent || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `boardly_audit_trail_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
        width: '130px',
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border">
            <Filter className="w-3.5 h-3.5 ml-2 text-muted-foreground" />
            <select
              className="bg-transparent border-0 text-xs font-medium text-foreground py-1 pr-3 pl-1 outline-none"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>

            <select
              className="bg-transparent border-0 text-xs font-medium text-foreground py-1 pr-3 pl-1 outline-none border-l border-border ml-1"
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="board.deleted">Board Deleted</option>
              <option value="role.updated">Role Updated</option>
              <option value="user.invited">User Invited</option>
              <option value="settings.changed">Settings Changed</option>
            </select>
          </div>

          <Button
            onClick={exportCSV}
            disabled={logs.length === 0}
            variant="outline"
            size="sm"
            className="gap-2 bg-card hover:bg-muted"
          >
            <Download className="w-4 h-4 text-blue-600" /> Export CSV
          </Button>
        </div>
      </div>

      {/* ─── Upgraded Audit Log Grid with EnterpriseDataGrid ─── */}
      <EnterpriseDataGrid
        columns={columns}
        data={logs}
        isLoading={isLoading}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Event Metadata: {inspectMetadata?.action}
            </DialogTitle>
            <DialogDescription>
              Recorded on {inspectMetadata && new Date(inspectMetadata.createdAt).toLocaleString()} by{' '}
              {inspectMetadata?.actor?.name || 'System'}.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <pre className="p-3.5 rounded-xl bg-muted/60 border text-xs font-mono overflow-x-auto max-h-80 text-foreground">
              {inspectMetadata ? JSON.stringify(inspectMetadata.metadata, null, 2) : ''}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
