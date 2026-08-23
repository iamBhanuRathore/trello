import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { orgService } from '../../lib/orgService';
import { Button } from '@boardly/ui/button';
import { CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';

export const Billing = () => {
  const { user } = useAuthStore();
  const orgId = user?.organizationId;

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => orgService.getOrg(orgId!),
    enabled: !!orgId,
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading billing information...</div>;
  }

  if (!org) {
    return <div className="p-8 text-center text-destructive">Failed to load organization data.</div>;
  }

  const plan = org.plan;
  const sub = org.subscription;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing & Plan</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription and usage limits.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Plan Card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-xs p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Current Plan</h3>
              <p className="text-sm text-muted-foreground">
                {sub?.status === 'active' ? 'Active Subscription' : 'Free Tier'}
              </p>
            </div>
          </div>
          
          <div className="mb-6">
            <span className="text-4xl font-bold tracking-tight">{plan?.name || 'Free'}</span>
          </div>

          <ul className="space-y-3 mb-6 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>Up to {plan?.maxSeats || 5} members</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{plan?.maxWorkspaces || 1} Workspaces</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{plan?.maxBoards === null ? 'Unlimited' : plan?.maxBoards || 3} Boards</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{plan?.maxStorageGb || 1} GB Storage</span>
            </li>
          </ul>

          <Button className="w-full">Upgrade Plan</Button>
        </div>

        {/* Usage Card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-xs p-6">
          <h3 className="font-semibold text-lg mb-4">Usage Overview</h3>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">Seats</span>
                <span className="text-muted-foreground">{sub?.seatCount || 1} / {plan?.maxSeats || 5}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, ((sub?.seatCount || 1) / (plan?.maxSeats || 5)) * 100)}%` }}
                />
              </div>
            </div>

            <div className="rounded-lg bg-amber-500/10 p-4 border border-amber-500/20">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-1">Upgrade for more features</p>
                  <p>Enterprise features like custom roles, SSO, and advanced reporting are available on higher tiers.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
