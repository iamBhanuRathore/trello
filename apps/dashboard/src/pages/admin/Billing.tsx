import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { orgService } from '../../lib/orgService';
import { Button } from '@boardly/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boardly/ui/dialog';
import { CreditCard, CheckCircle2, AlertCircle, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { toast } from 'sonner';

export const Billing = () => {
  const { user } = useAuthStore();
  const orgId = user?.organizationId;
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'enterprise'>('pro');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => orgService.getOrg(orgId!),
    enabled: !!orgId,
  });

  const handleUpgradeSubmit = async () => {
    setIsSubmitting(true);
    // Simulate processing upgrade request
    await new Promise((resolve) => setTimeout(resolve, 600));
    setIsSubmitting(false);
    setIsUpgradeOpen(false);
    toast.success(
      `Upgrade request submitted for ${selectedPlan === 'pro' ? 'Pro' : 'Enterprise'} plan! Our team will contact you shortly.`
    );
  };

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

          <Button className="w-full cursor-pointer" onClick={() => setIsUpgradeOpen(true)}>
            Upgrade Plan
          </Button>
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

      {/* Upgrade Plan Dialog Modal */}
      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <DialogTitle>Upgrade Your Workspace</DialogTitle>
            </div>
            <DialogDescription>
              Scale your team with more seats, unlimited workspaces, custom workflows, and enterprise compliance.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3 sm:grid-cols-2">
            {/* Pro Tier Option */}
            <div
              onClick={() => setSelectedPlan('pro')}
              className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                selectedPlan === 'pro'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-border/80 bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span>Pro</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  Popular
                </span>
              </div>
              <div className="text-2xl font-extrabold tracking-tight mb-1">
                $12 <span className="text-xs font-normal text-muted-foreground">/ user / mo</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">For fast-moving teams needing agility and unlimited boards.</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>Unlimited boards & lists</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>Up to 25 team members</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>50 GB Cloud Storage</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>Automations & Webhooks</span>
                </li>
              </ul>
            </div>

            {/* Enterprise Tier Option */}
            <div
              onClick={() => setSelectedPlan('enterprise')}
              className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                selectedPlan === 'enterprise'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-border/80 bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>Enterprise</span>
                </div>
              </div>
              <div className="text-2xl font-extrabold tracking-tight mb-1">
                $29 <span className="text-xs font-normal text-muted-foreground">/ user / mo</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">For organizations requiring advanced governance, SSO, and audit.</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>Unlimited members & storage</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>SAML SSO & SCIM Provisioning</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>Custom RBAC & Audit Logs</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span>24/7 Priority Support & SLA</span>
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsUpgradeOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpgradeSubmit}
              disabled={isSubmitting}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {isSubmitting ? 'Submitting...' : `Upgrade to ${selectedPlan === 'pro' ? 'Pro' : 'Enterprise'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

