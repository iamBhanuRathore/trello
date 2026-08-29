import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { superAdminService, type TenantOrg } from '../lib/superAdminService';
import { format } from 'date-fns';
import {
  Database,
  Server,
  Building2,
  Users,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { EnterpriseDataGrid, type ColumnDef } from '@boardly/ui/enterprise-data-grid';
import { toast } from 'sonner';

export const Tenants: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedOrg, setSelectedOrg] = useState<TenantOrg | null>(null);
  const [dedicatedUrl, setDedicatedUrl] = useState('');
  const [isDedicated, setIsDedicated] = useState(false);
  const [planFilter, setPlanFilter] = useState('all');
  const [dbFilter, setDbFilter] = useState<'all' | 'dedicated' | 'shared'>('all');

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['superAdminOrgs'],
    queryFn: superAdminService.getOrgs,
  });

  const openDedicatedModal = (org: TenantOrg) => {
    setSelectedOrg(org);
    setIsDedicated(org.isDedicatedDb || false);
    setDedicatedUrl(org.dedicatedDbUrl || '');
  };

  const updateDbMutation = useMutation({
    mutationFn: ({
      orgId,
      data,
    }: {
      orgId: string;
      data: { isDedicatedDb: boolean; dedicatedDbUrl?: string | null };
    }) => superAdminService.updateTenantDatabase(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdminOrgs'] });
      toast.success(`Dedicated database settings updated for ${selectedOrg?.name}`);
      setSelectedOrg(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update database routing');
    },
  });

  const handleSaveDedicated = () => {
    if (!selectedOrg) return;
    updateDbMutation.mutate({
      orgId: selectedOrg.id,
      data: {
        isDedicatedDb: isDedicated,
        dedicatedDbUrl: isDedicated ? dedicatedUrl.trim() || null : null,
      },
    });
  };

  // Filtered orgs by dropdowns
  const filteredOrgs = useMemo(() => {
    return orgs.filter((o) => {
      if (planFilter !== 'all') {
        const planName = o.plan?.name || 'Enterprise';
        if (planName.toLowerCase() !== planFilter.toLowerCase()) return false;
      }
      if (dbFilter === 'dedicated' && !o.isDedicatedDb) return false;
      if (dbFilter === 'shared' && o.isDedicatedDb) return false;
      return true;
    });
  }, [orgs, planFilter, dbFilter]);

  // Metric counts
  const totalOrgs = orgs.length;
  const dedicatedCount = orgs.filter((o) => o.isDedicatedDb).length;
  const sharedCount = totalOrgs - dedicatedCount;

  // ─── Columns for EnterpriseDataGrid ───
  const columns = useMemo<ColumnDef<TenantOrg>[]>(
    () => [
      {
        id: 'organization',
        header: 'Organization',
        sortable: true,
        accessorFn: (o) => o.name,
        exportValue: (o) => `${o.name} (/${o.slug})`,
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-white text-xs">{row.name}</div>
            <div className="text-muted-foreground text-[10px] font-mono">/{row.slug}</div>
          </div>
        ),
      },
      {
        id: 'plan',
        header: 'Plan Tier',
        sortable: true,
        filterable: true,
        accessorFn: (o) => o.plan?.name || 'Enterprise',
        exportValue: (o) => o.plan?.name || 'Enterprise',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/25 capitalize">
            {row.plan?.name || 'Enterprise'}
          </span>
        ),
      },
      {
        id: 'teamMembers',
        header: 'Team Members',
        sortable: true,
        accessorFn: (o) => o.memberCounts?.total || 1,
        exportValue: (o) => `${o.memberCounts?.total || 1} Total (${o.memberCounts?.active || 1} Active)`,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">
              {row.memberCounts?.total || 1} Total
            </span>
            <span className="text-[10px] text-emerald-400">
              ({row.memberCounts?.active || 1} Active)
            </span>
          </div>
        ),
      },
      {
        id: 'databaseRouting',
        header: 'Database Routing',
        sortable: true,
        filterable: true,
        accessorFn: (o) => (o.isDedicatedDb ? 'Dedicated Database' : 'Shared Cluster'),
        exportValue: (o) => (o.isDedicatedDb ? `Dedicated DB (${o.dedicatedDbUrl || 'Active'})` : 'Shared Cluster'),
        cell: ({ row }) =>
          row.isDedicatedDb ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Database className="w-3 h-3" />
              <span>Dedicated Database</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
              <Server className="w-3 h-3" />
              <span>Shared Cluster</span>
            </span>
          ),
      },
      {
        id: 'createdAt',
        header: 'Created Date',
        sortable: true,
        accessorFn: (o) => (o.createdAt ? format(new Date(o.createdAt), 'MMM dd, yyyy') : 'N/A'),
        exportValue: (o) => (o.createdAt ? new Date(o.createdAt).toISOString() : ''),
        cell: ({ row }) => (
          <span className="text-[11px] text-muted-foreground">
            {row.createdAt ? format(new Date(row.createdAt), 'MMM dd, yyyy') : 'N/A'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        align: 'right',
        sortable: false,
        filterable: false,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 cursor-pointer hover:border-purple-500 hover:text-purple-400"
            onClick={() => openDedicatedModal(row)}
          >
            <Server className="w-3 h-3" />
            <span>DB Routing</span>
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Multi-Tenant Organizations</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30">
              Clusters
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Manage multi-tenant isolation, enterprise dedicated PostgreSQL databases, and subscription tiers.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => {
            setDbFilter('all');
            setPlanFilter('all');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            dbFilter === 'all' && planFilter === 'all'
              ? 'border-purple-500/50 bg-purple-950/20 ring-1 ring-purple-500/30 shadow-md'
              : 'border-border/80 bg-card/60 hover:bg-muted/30'
          } backdrop-blur-md flex items-center gap-3.5`}
        >
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{totalOrgs}</div>
            <div className="text-xs text-muted-foreground">Total Tenant Organizations</div>
          </div>
        </div>

        <div
          onClick={() => setDbFilter('dedicated')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            dbFilter === 'dedicated'
              ? 'border-emerald-500/50 bg-emerald-950/20 ring-1 ring-emerald-500/30 shadow-md'
              : 'border-border/80 bg-card/60 hover:bg-muted/30'
          } backdrop-blur-md flex items-center gap-3.5`}
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{dedicatedCount}</div>
            <div className="text-xs text-emerald-400 font-semibold">Dedicated Databases</div>
          </div>
        </div>

        <div
          onClick={() => setDbFilter('shared')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            dbFilter === 'shared'
              ? 'border-purple-500/50 bg-purple-950/20 ring-1 ring-purple-500/30 shadow-md'
              : 'border-border/80 bg-card/60 hover:bg-muted/30'
          } backdrop-blur-md flex items-center gap-3.5`}
        >
          <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{sharedCount}</div>
            <div className="text-xs text-muted-foreground">Shared Cluster Tenants</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDbFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              dbFilter === 'all'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            All Clusters ({orgs.length})
          </button>
          <button
            onClick={() => setDbFilter('dedicated')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              dbFilter === 'dedicated'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Database className="w-3 h-3" />
            <span>Dedicated DB Only ({dedicatedCount})</span>
          </button>
          <button
            onClick={() => setDbFilter('shared')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              dbFilter === 'shared'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Shared Cluster ({sharedCount})
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="text-xs py-1.5 px-3 rounded-xl border border-border bg-card text-foreground focus:ring-1 focus:ring-purple-500 focus:outline-none cursor-pointer"
          >
            <option value="all">All Plans</option>
            <option value="enterprise">Enterprise</option>
            <option value="business">Business</option>
            <option value="pro">Pro</option>
            <option value="free">Free</option>
          </select>

          {(planFilter !== 'all' || dbFilter !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPlanFilter('all');
                setDbFilter('all');
              }}
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
              title="Reset filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Upgraded Enterprise Data Grid */}
      <EnterpriseDataGrid
        data={filteredOrgs}
        columns={columns}
        isLoading={isLoading}
        searchable={true}
        globalSearchPlaceholder="Search organizations or slugs..."
        enableExport={true}
        exportFileName="boardly_tenants_catalog"
        defaultPageSize={15}
        emptyMessage="No tenant organizations match your filters."
      />

      {/* Dedicated DB Routing Modal */}
      <Dialog open={!!selectedOrg} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="sm:max-w-md p-5 bg-card border border-border/80 rounded-2xl shadow-2xl">
          {selectedOrg && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-2 text-purple-400">
                  <Database className="w-5 h-5" />
                  <DialogTitle className="text-base font-bold text-white">
                    Database Isolation Routing
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Configure isolated PostgreSQL credentials for{' '}
                  <span className="font-semibold text-white">{selectedOrg.name}</span>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                  <div>
                    <div className="text-xs font-semibold text-white">Dedicated Database Mode</div>
                    <div className="text-[10px] text-muted-foreground">Route all tenant queries to custom DB</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isDedicated}
                    onChange={(e) => setIsDedicated(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </div>

                {isDedicated && (
                  <div className="space-y-1.5 animate-in fade-in">
                    <Label className="text-xs font-semibold text-foreground">
                      PostgreSQL Connection URL
                    </Label>
                    <Input
                      placeholder="postgresql://user:pass@db.customer.com:5432/boardly_dedicated"
                      value={dedicatedUrl}
                      onChange={(e) => setDedicatedUrl(e.target.value)}
                      className="text-xs font-mono bg-background text-white border-border focus:border-purple-500"
                    />
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-purple-400" />
                      <span>Tenant data migrations will execute automatically on save.</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setSelectedOrg(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateDbMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-500 text-white cursor-pointer"
                  onClick={handleSaveDedicated}
                >
                  {updateDbMutation.isPending ? 'Saving...' : 'Save DB Configuration'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
