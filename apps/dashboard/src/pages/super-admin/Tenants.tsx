import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { superAdminService } from '../../lib/superAdminService';
import { format } from 'date-fns';
import { Database, Shield, Server, CheckCircle2 } from 'lucide-react';
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

export const Tenants = () => {
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [dedicatedUrl, setDedicatedUrl] = useState('');
  const [isDedicated, setIsDedicated] = useState(false);

  const { data: orgs, isLoading } = useQuery({
    queryKey: ['superAdminOrgs'],
    queryFn: superAdminService.getOrgs,
  });

  const openDedicatedModal = (org: any) => {
    setSelectedOrg(org);
    setIsDedicated(org.isDedicatedDb || false);
    setDedicatedUrl(org.dedicatedDbUrl || '');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Enterprise Tenants &amp; Databases</h1>
          <p className="text-muted-foreground mt-1">
            Manage organization instances, subscription seat limits, and isolated DB-per-tenant tier routing.
          </p>
        </div>
      </div>

      <div className="border rounded-2xl bg-card shadow-xs overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b">
            <tr>
              <th className="px-6 py-3.5 font-medium">Organization</th>
              <th className="px-6 py-3.5 font-medium">Plan</th>
              <th className="px-6 py-3.5 font-medium">Database Tier</th>
              <th className="px-6 py-3.5 font-medium">Seats</th>
              <th className="px-6 py-3.5 font-medium">Status</th>
              <th className="px-6 py-3.5 font-medium">Created At</th>
              <th className="px-6 py-3.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground text-xs">
                  Loading tenants...
                </td>
              </tr>
            ) : orgs?.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground text-xs">
                  No tenants registered.
                </td>
              </tr>
            ) : (
              orgs?.map((org: any) => (
                <tr key={org.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-foreground">{org.name}</div>
                    <div className="text-muted-foreground text-xs font-mono">{org.slug}</div>
                  </td>
                  <td className="px-6 py-4 capitalize font-medium">
                    {org.plan?.name || 'Standard'}
                  </td>
                  <td className="px-6 py-4">
                    {org.isDedicatedDb ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        <Server className="w-3 h-3" /> Dedicated DB
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                        <Database className="w-3 h-3" /> Shared Pool
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono font-medium">
                    {org.subscription?.seatCount || 0}
                  </td>
                  <td className="px-6 py-4 capitalize">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        org.subscription?.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {org.subscription?.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {org.createdAt ? format(new Date(org.createdAt), 'MMM d, yyyy') : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => openDedicatedModal(org)}
                    >
                      <Server className="w-3 h-3 text-purple-500" /> Instance Tier
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* DEDICATED INSTANCE MODAL */}
      <Dialog open={!!selectedOrg} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-purple-500" /> Dedicated Database Tier
            </DialogTitle>
            <DialogDescription>
              Configure isolated PostgreSQL instance routing for {selectedOrg?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-400 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> Enterprise Isolation Guarantee
              </div>
              <p className="text-[11px] opacity-90">
                Dedicated-instance tenants run migrations and queries against an independent database pool with isolated encryption keys.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Database Deployment Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsDedicated(false)}
                  className={`p-3 rounded-xl border text-xs text-left transition-colors ${
                    !isDedicated
                      ? 'border-primary bg-primary/5 font-semibold text-foreground'
                      : 'hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <div>Shared Pool</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Multi-tenant schema</div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDedicated(true)}
                  className={`p-3 rounded-xl border text-xs text-left transition-colors ${
                    isDedicated
                      ? 'border-purple-500 bg-purple-500/5 font-semibold text-foreground ring-1 ring-purple-500'
                      : 'hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <div>Dedicated DB</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Isolated instance</div>
                </button>
              </div>
            </div>

            {isDedicated && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Dedicated PostgreSQL Connection URI</Label>
                <Input
                  placeholder="postgresql://tenant_admin:pass@db.internal:5432/tenant_prod"
                  value={dedicatedUrl}
                  onChange={(e) => setDedicatedUrl(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button size="sm" variant="outline" onClick={() => setSelectedOrg(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => setSelectedOrg(null)}
                className="text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Save Instance Routing
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
