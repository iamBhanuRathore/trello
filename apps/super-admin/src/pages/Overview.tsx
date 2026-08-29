import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { superAdminService } from '../lib/superAdminService';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  Package,
  Sparkles,
  ArrowRight,
  Database,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';

export const Overview: React.FC = () => {
  const { data: orgs = [], isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['superAdminOrgs'],
    queryFn: superAdminService.getOrgs,
  });

  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['superAdminUsers'],
    queryFn: superAdminService.getUsers,
  });

  const { data: plans = [], isLoading: isLoadingPlans } = useQuery({
    queryKey: ['superAdminPlans'],
    queryFn: superAdminService.getPlans,
  });

  const totalTenants = orgs.length;
  const dedicatedDbCount = orgs.filter((o) => o.isDedicatedDb).length;
  const totalUsers = users.length;
  const multiCompanyCount = users.filter((u) => u.isMultiCompany).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ─── Hero Banner ─── */}
      <div className="p-6 sm:p-8 rounded-3xl border border-purple-500/20 bg-gradient-to-r from-purple-950/40 via-card to-background relative overflow-hidden shadow-2xl">
        <div className="absolute right-[-5%] top-[-20%] w-[350px] h-[350px] bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Platform Infrastructure & Tenant Intelligence</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Cluster Governance & Multi-Tenant Operations
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Monitor tenant health, manage isolated PostgreSQL databases, inspect cross-company employee reach, and configure enterprise plan limits.
          </p>
        </div>
      </div>

      {/* ─── Main KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Total Tenants</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{isLoadingOrgs ? '...' : totalTenants}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="text-emerald-400 font-semibold">{dedicatedDbCount} Isolated DBs</span>
            <span>• Active Organizations</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Global Platform Users</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{isLoadingUsers ? '...' : totalUsers}</div>
          <div className="text-[11px] text-muted-foreground">
            Across all tenant workspaces
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-purple-500/30 bg-purple-950/10 backdrop-blur-md shadow-xs space-y-2">
          <div className="flex items-center justify-between text-purple-300">
            <span className="text-xs font-semibold">Multi-Company Users</span>
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{isLoadingUsers ? '...' : multiCompanyCount}</div>
          <div className="text-[11px] text-purple-300/80">
            Users working in &gt;1 company
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Platform Plans</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{isLoadingPlans ? '...' : plans.length}</div>
          <div className="text-[11px] text-muted-foreground">
            Tier policies active
          </div>
        </div>
      </div>

      {/* ─── Fast Action & Overview Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tenants */}
        <div className="p-6 rounded-2xl border border-border/80 bg-card/50 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              <span>Tenant Organizations</span>
            </h3>
            <Link to="/tenants">
              <Button variant="ghost" size="sm" className="text-xs text-purple-400 hover:text-purple-300 gap-1">
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>

          <div className="space-y-2">
            {orgs.slice(0, 5).map((org) => (
              <div
                key={org.id}
                className="p-3 rounded-xl border border-border/60 bg-background/60 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>{org.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">/{org.slug}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Plan: <span className="text-purple-400 font-semibold">{org.plan?.name || 'Enterprise Tier'}</span> •{' '}
                    <span>{org.memberCounts?.total || 1} Members</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {org.isDedicatedDb ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Database className="w-2.5 h-2.5" /> Dedicated DB
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                      Shared Pool
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Multi-Company Intelligence Preview */}
        <div className="p-6 rounded-2xl border border-border/80 bg-card/50 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Multi-Company User Intelligence</span>
            </h3>
            <Link to="/users">
              <Button variant="ghost" size="sm" className="text-xs text-purple-400 hover:text-purple-300 gap-1">
                <span>Inspect Users</span>
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>

          <div className="space-y-2">
            {users
              .filter((u) => u.isMultiCompany)
              .slice(0, 5)
              .map((user) => (
                <div
                  key={user.id}
                  className="p-3 rounded-xl border border-border/60 bg-background/60 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-white">{user.name}</div>
                    <div className="text-[11px] text-muted-foreground">{user.email}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                      {user.organizationsCount} Companies
                    </span>
                  </div>
                </div>
              ))}

            {users.filter((u) => u.isMultiCompany).length === 0 && (
              <p className="text-xs text-muted-foreground p-4 text-center italic">
                All platform users currently belong to a single organization.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
