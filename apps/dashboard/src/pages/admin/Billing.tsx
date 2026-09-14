import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  billingService,
  type BillingOverviewData,
  type ProrationPreviewData,
} from '../../lib/billingService';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boardly/ui/dialog';
import {
  AlertCircle,
  Sparkles,
  Zap,
  Building2,
  ExternalLink,
  Plus,
  Minus,
  Calendar,
  Loader2,
  ShieldAlert,
  ArrowUpRight,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';

export const Billing: React.FC = () => {
  const queryClient = useQueryClient();

  // Queries
  const {
    data: billing,
    isLoading,
    error,
  } = useQuery<BillingOverviewData>({
    queryKey: ['billingOverview'],
    queryFn: billingService.getOverview,
  });

  // Modal States
  const [isAddSeatsOpen, setIsAddSeatsOpen] = useState(false);
  const [addSeatsCount, setAddSeatsCount] = useState<number>(1);
  const [isDownsizeOpen, setIsDownsizeOpen] = useState(false);
  const [downsizeSeatsCount, setDownsizeSeatsCount] = useState<number>(1);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [upgradeTier, setUpgradeTier] = useState<'pro' | 'business'>('pro');
  const [upgradeInterval, setUpgradeInterval] = useState<'monthly' | 'annual'>('monthly');
  const [upgradeSeats, setUpgradeSeats] = useState<number>(5);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isEnterpriseModalOpen, setIsEnterpriseModalOpen] = useState(false);
  const [enterpriseCompany, setEnterpriseCompany] = useState('');
  const [enterpriseTeamSize, setEnterpriseTeamSize] = useState('50');
  const [enterpriseRequirements, setEnterpriseRequirements] = useState('');

  // Proration Preview Query
  const targetNewSeats = (billing?.subscription.seatCount ?? 5) + addSeatsCount;
  const { data: prorationPreview, isLoading: isPreviewLoading } = useQuery<ProrationPreviewData>({
    queryKey: ['seatPreview', targetNewSeats],
    queryFn: () => billingService.previewSeatChange(targetNewSeats),
    enabled: isAddSeatsOpen && !!billing?.subscription.stripeSubscriptionId && addSeatsCount > 0,
  });

  // Mutations
  const increaseSeatsMutation = useMutation({
    mutationFn: (newSeatTotal: number) => billingService.increaseSeats(newSeatTotal),
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Seats increased successfully!');
      setIsAddSeatsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['billingOverview'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to increase seats');
    },
  });

  const downsizeSeatsMutation = useMutation({
    mutationFn: (newSeatTotal: number) => billingService.scheduleSeatDecrease(newSeatTotal),
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Seat decrease scheduled for next billing period');
      setIsDownsizeOpen(false);
      queryClient.invalidateQueries({ queryKey: ['billingOverview'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to schedule seat decrease');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: billingService.requestCancellation,
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Subscription cancellation scheduled at period end');
      setIsCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ['billingOverview'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to cancel subscription');
    },
  });

  const portalMutation = useMutation({
    mutationFn: () => billingService.createPortal(),
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to open customer portal');
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: (payload: {
      planTier: 'pro' | 'business';
      interval: 'monthly' | 'annual';
      seatCount: number;
    }) => billingService.createCheckout(payload),
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to launch checkout');
    },
  });

  const enterpriseQuoteMutation = useMutation({
    mutationFn: (payload: { companyName: string; teamSize: number; requirements?: string }) =>
      billingService.requestEnterpriseQuote(payload),
    onSuccess: () => {
      toast.success(
        'Your quote request has been sent! Our enterprise team will contact you shortly.'
      );
      setIsEnterpriseModalOpen(false);
      setEnterpriseCompany('');
      setEnterpriseRequirements('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to submit quote request');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-6xl" aria-label="Loading billing">
        {/* Header mirror */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-56 rounded-lg bg-muted animate-pulse" />
              <div className="h-5 w-16 rounded-full bg-muted/70 animate-pulse" />
            </div>
            <div className="h-4 w-80 max-w-full rounded bg-muted/60 animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-32 rounded-lg bg-muted/70 animate-pulse" />
          </div>
        </div>
        {/* Metrics mirror */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-2xl border bg-card/40 animate-pulse" />
          ))}
        </div>
        {/* Invoices table mirror */}
        <div className="rounded-2xl border bg-card/40 overflow-hidden">
          <div className="h-11 border-b border-border/60 bg-muted/30" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 border-b border-border/40 last:border-0" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !billing) {
    return (
      <div className="space-y-8 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Billing & Seats Hub
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your per-head seat quota, guest permissions, and invoices.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-3" />
          <h3 className="text-lg font-semibold text-destructive">
            Failed to Load Billing Information
          </h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            There was an error communicating with the billing service.
          </p>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['billingOverview'] })}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const plan = billing?.plan || { name: 'Free Plan', tier: 'free' as const };
  const subscription = billing?.subscription || {
    status: 'active' as const,
    seatCount: 5,
    billingInterval: 'monthly' as const,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    stripeCustomerId: null,
  };
  const seats = billing?.seats || {
    totalPaid: 5,
    activeBillable: 1,
    pendingBillable: 0,
    usedBillable: 1,
    vacant: 4,
  };
  const guests = billing?.guests || {
    activeGuests: 0,
    pendingGuests: 0,
    usedGuests: 0,
    guestCap: 3,
    isOverLimit: false,
  };
  const pricing = billing?.pricing || {
    monthlyRatePerSeat: 0,
    annualRatePerSeat: 0,
    estimatedMonthlyTotal: 0,
  };
  const invoices = billing?.invoices || [];

  const isPaidPlan = plan.tier === 'pro' || plan.tier === 'business' || plan.tier === 'enterprise';
  const isCanceledAtPeriodEnd = subscription.cancelAtPeriodEnd;
  const isPastDueDowngradePending = subscription.status === 'past_due_downgrade_pending';

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Billing & Seats Hub
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                subscription.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : subscription.status === 'past_due' || isPastDueDowngradePending
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {subscription.status ? subscription.status.replace(/_/g, ' ') : 'Active'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your per-head seat quota, guest permissions, and invoices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {subscription.stripeCustomerId && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={portalMutation.isPending}
              onClick={() => portalMutation.mutate()}
            >
              {portalMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Stripe Customer Portal
            </Button>
          )}

          {!isPaidPlan ? (
            <Button
              size="sm"
              className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-xs"
              onClick={() => setIsUpgradeOpen(true)}
            >
              <Zap className="h-4 w-4" />
              Upgrade Plan
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => setIsAddSeatsOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Seats
            </Button>
          )}
        </div>
      </div>

      {/* Warning Banner: Past Due Downgrade Pending */}
      {isPastDueDowngradePending && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Action Required: Free Plan Member Limit Exceeded</p>
              <p className="text-xs opacity-90">
                Your subscription was scheduled for downgrade to Free, but your organization
                currently has <strong>{seats.activeBillable} active billable members</strong> (Free
                tier allows max 5). Please deactivate or remove excess members in the Users panel,
                or reactivate your subscription.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Notice Banner */}
      {isCanceledAtPeriodEnd && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-blue-900 dark:text-blue-200">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="text-sm">
              Your subscription is scheduled to cancel at the end of the current period on{' '}
              <strong>
                {subscription.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : 'period end'}
              </strong>
              . You will retain all paid features until that date.
            </div>
          </div>
        </div>
      )}

      {/* Primary Metrics Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Card 1: Plan & Pricing */}
        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Tier
              </span>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                {plan.name}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-foreground">
                ${pricing?.estimatedMonthlyTotal ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">/ month est.</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isPaidPlan
                ? `$${subscription.billingInterval === 'annual' ? (pricing?.annualRatePerSeat ?? 8) : (pricing?.monthlyRatePerSeat ?? 10)} per seat / mo · ${subscription.billingInterval} billing`
                : 'Free tier ($0/month up to 5 seats)'}
            </p>
          </div>

          <div className="pt-4 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Period End:</span>
            <span className="font-semibold text-foreground">
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : 'N/A'}
            </span>
          </div>
        </div>

        {/* Card 2: Seat Capacity & Fair Billing */}
        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Seat Utilization
              </span>
              {seats.vacant > 0 ? (
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {seats.vacant} Vacant {seats.vacant === 1 ? 'Seat' : 'Seats'}
                </span>
              ) : (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                  100% Utilized
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-foreground">
                {seats.usedBillable} / {seats.totalPaid}
              </span>
              <span className="text-xs text-muted-foreground">Seats Assigned</span>
            </div>

            {/* Progress Bar */}
            <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all"
                style={{
                  width: `${Math.min(100, (seats.usedBillable / Math.max(1, seats.totalPaid)) * 100)}%`,
                }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {seats.activeBillable} active · {seats.pendingBillable} pending
              </span>
              <span>{seats.vacant} vacant</span>
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 mt-3 flex items-center justify-between">
            {isPaidPlan && (
              <div className="flex items-center gap-2 w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-1/2 text-xs h-8"
                  onClick={() => setIsDownsizeOpen(true)}
                  disabled={seats.totalPaid <= 1}
                >
                  <Minus className="h-3 w-3 mr-1" /> Downsize
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-1/2 text-xs h-8"
                  onClick={() => setIsAddSeatsOpen(true)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Seats
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Guest Allowance Quota */}
        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Viewer Guests
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                Cap: {guests.guestCap}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-foreground">
                {guests.usedGuests} / {guests.guestCap}
              </span>
              <span className="text-xs text-muted-foreground">Guests Active</span>
            </div>

            {/* Progress Bar */}
            <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${
                  guests.isOverLimit ? 'bg-destructive' : 'bg-emerald-500'
                }`}
                style={{
                  width: `${Math.min(100, (guests.usedGuests / Math.max(1, guests.guestCap)) * 100)}%`,
                }}
              />
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {plan.tier === 'enterprise'
                ? 'Unlimited free viewer guests on Enterprise'
                : `Unbilled viewer seats (${plan.tier === 'business' ? 25 : 10} per paid seat)`}
            </p>
          </div>

          <div className="pt-4 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Additional Guest Overage:</span>
            <span className="font-semibold text-foreground">$3/guest/mo</span>
          </div>
        </div>
      </div>

      {/* Fair Billing Explainer Box */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-6 flex flex-col sm:flex-row items-start gap-4">
        <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h4 className="font-semibold text-sm text-foreground">Slack-Style Fair Billing Policy</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            When team members leave or are deactivated, your paid seat remains in your organization
            as a <strong>Vacant Seat</strong>. You can invite replacement colleagues at any time for{' '}
            <strong>$0 proration</strong>. If you do not intend to replace them, you can downsize
            your seat count before the end of the billing period.
          </p>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="p-6 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold text-base">Billing History & Invoices</h3>
          </div>
          <span className="text-xs text-muted-foreground">Invoices generated via Stripe</span>
        </div>

        {invoices && invoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/60 bg-muted/40 text-xs uppercase text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3.5 px-6">Invoice Number</th>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Amount</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Receipt / PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-xs">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3.5 px-6 font-medium text-foreground">
                      {inv.number || inv.id.slice(0, 16)}
                    </td>
                    <td className="py-3.5 px-6 text-muted-foreground">
                      {new Date(inv.created * 1000).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-6 font-semibold text-foreground">
                      ${(inv.amountPaid / 100).toFixed(2)} {inv.currency.toUpperCase()}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {inv.hostedInvoiceUrl ? (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                        >
                          View Receipt <ArrowUpRight className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No past invoices on record yet. Paid charges and receipts will appear here
            automatically.
          </div>
        )}
      </div>

      {/* Subscription Management Actions Footer */}
      {isPaidPlan && (
        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <div className="text-xs text-muted-foreground">
            Need custom contractual terms, SSO, or PO invoicing?
            <button
              onClick={() => setIsEnterpriseModalOpen(true)}
              className="ml-1 text-primary hover:underline font-semibold"
            >
              Contact Enterprise Sales
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setIsCancelOpen(true)}
          >
            Cancel Subscription
          </Button>
        </div>
      )}

      {/* ─── ADD SEATS MODAL (With Live Proration Preview) ─── */}
      <Dialog open={isAddSeatsOpen} onOpenChange={setIsAddSeatsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-600" />
              Add Seats (Instant Proration)
            </DialogTitle>
            <DialogDescription>
              Increase your paid seat quota. Newly added seats are available immediately with
              prorated charges.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between rounded-xl bg-muted/60 p-4 border border-border/60">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Current Seats</p>
                <p className="text-lg font-bold text-foreground">{subscription.seatCount} Seats</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-muted-foreground">New Total</p>
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                  {targetNewSeats} Seats
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Seats to Add</label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setAddSeatsCount(Math.max(1, addSeatsCount - 1))}
                  disabled={addSeatsCount <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={addSeatsCount}
                  onChange={(e) => setAddSeatsCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="text-center font-bold"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setAddSeatsCount(addSeatsCount + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Live Proration Breakdown */}
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted-foreground font-medium">
                <span>Prorated Charge Today:</span>
                <span className="text-foreground font-bold">
                  {isPreviewLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : prorationPreview ? (
                    `$${prorationPreview.upcomingInvoice.prorationAmount.toFixed(2)}`
                  ) : (
                    'Calculated at checkout'
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>New Monthly Total:</span>
                <span className="font-semibold text-foreground">
                  $
                  {(
                    targetNewSeats *
                    (subscription.billingInterval === 'annual'
                      ? (pricing?.annualRatePerSeat ?? 8)
                      : (pricing?.monthlyRatePerSeat ?? 10))
                  ).toFixed(2)}
                  /mo
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button variant="ghost" onClick={() => setIsAddSeatsOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={increaseSeatsMutation.isPending}
              onClick={() => increaseSeatsMutation.mutate(targetNewSeats)}
            >
              {increaseSeatsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Confirm & Expand to {targetNewSeats} Seats
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DOWNSIZE SEATS MODAL (Scheduled Decrease) ─── */}
      <Dialog open={isDownsizeOpen} onOpenChange={setIsDownsizeOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Minus className="h-5 w-5 text-amber-600" />
              Schedule Seat Decrease
            </DialogTitle>
            <DialogDescription>
              Downsize your seat count at the end of the current billing cycle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">Period-Boundary Downsizing Policy</p>
              <p className="opacity-90 leading-relaxed">
                Per industry SaaS standards, seat decreases take effect at your next renewal date (
                {subscription.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : 'period end'}
                ) with <strong>no premature credits removed</strong>. You cannot reduce below your
                currently assigned active members ({seats.usedBillable}).
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">
                Desired New Seat Count
              </label>
              <Input
                type="number"
                min={seats.usedBillable}
                max={subscription.seatCount - 1}
                value={downsizeSeatsCount}
                onChange={(e) =>
                  setDownsizeSeatsCount(parseInt(e.target.value, 10) || seats.usedBillable)
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Minimum allowed: {seats.usedBillable} seats (to protect active team members).
              </p>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button variant="ghost" onClick={() => setIsDownsizeOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={
                downsizeSeatsMutation.isPending || downsizeSeatsCount >= subscription.seatCount
              }
              onClick={() => downsizeSeatsMutation.mutate(downsizeSeatsCount)}
            >
              {downsizeSeatsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Schedule Decrease to {downsizeSeatsCount} Seats
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── UPGRADE PLAN MODAL ─── */}
      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-600" />
              Upgrade Your Organization Plan
            </DialogTitle>
            <DialogDescription>
              Select your tier, billing interval, and seat count for instant activation via Stripe
              Checkout.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Interval switch */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-lg bg-muted p-1 border border-border/60 text-xs">
                <button
                  type="button"
                  onClick={() => setUpgradeInterval('monthly')}
                  className={`rounded-md px-4 py-1.5 font-medium transition-all ${
                    upgradeInterval === 'monthly'
                      ? 'bg-background shadow-xs font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setUpgradeInterval('annual')}
                  className={`rounded-md px-4 py-1.5 font-medium transition-all ${
                    upgradeInterval === 'annual'
                      ? 'bg-background shadow-xs font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  Annual (20% Off)
                </button>
              </div>
            </div>

            {/* Tier selection cards */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setUpgradeTier('pro')}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  upgradeTier === 'pro'
                    ? 'border-indigo-600 bg-indigo-500/5 shadow-xs'
                    : 'border-border/80 hover:border-border'
                }`}
              >
                <div className="font-bold text-sm text-foreground">Pro Plan</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ${upgradeInterval === 'annual' ? 8 : 10} / seat / mo
                </div>
                <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  <li>✓ Unlimited boards</li>
                  <li>✓ 10 guests / seat</li>
                  <li>✓ 50 GB storage</li>
                </ul>
              </div>

              <div
                onClick={() => setUpgradeTier('business')}
                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                  upgradeTier === 'business'
                    ? 'border-purple-600 bg-purple-500/5 shadow-xs'
                    : 'border-border/80 hover:border-border'
                }`}
              >
                <div className="font-bold text-sm text-foreground">Business Plan</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ${upgradeInterval === 'annual' ? 16 : 20} / seat / mo
                </div>
                <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  <li>✓ Portfolio analytics</li>
                  <li>✓ 25 guests / seat</li>
                  <li>✓ 250 GB storage</li>
                </ul>
              </div>
            </div>

            {/* Seat selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Initial Seats</span>
                <span className="font-bold text-primary">
                  Total: $
                  {(upgradeInterval === 'annual'
                    ? upgradeTier === 'business'
                      ? 16
                      : 8
                    : upgradeTier === 'business'
                      ? 20
                      : 10) * upgradeSeats}
                  /mo
                </span>
              </div>
              <Input
                type="number"
                min={5}
                max={200}
                value={upgradeSeats}
                onChange={(e) => setUpgradeSeats(Math.max(5, parseInt(e.target.value, 10) || 5))}
              />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button variant="ghost" onClick={() => setIsUpgradeOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
              disabled={checkoutMutation.isPending}
              onClick={() =>
                checkoutMutation.mutate({
                  planTier: upgradeTier,
                  interval: upgradeInterval,
                  seatCount: upgradeSeats,
                })
              }
            >
              {checkoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Proceed to Stripe Checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── CANCEL SUBSCRIPTION CONFIRMATION MODAL ─── */}
      <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Cancel Paid Subscription?
            </DialogTitle>
            <DialogDescription>
              Your plan will downgrade to Free at the end of your billing cycle on{' '}
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : 'period end'}
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs text-muted-foreground">
            <p>Please note the following downgrade rules:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You will keep full access to paid features until the current period expires.</li>
              <li>
                The Free plan supports a maximum of <strong>5 billable team members</strong> and{' '}
                <strong>3 viewer guests</strong>.
              </li>
              <li>
                If you have more than 5 active members at the time of downgrade, your account will
                enter pending downgrade status until excess members are deactivated.
              </li>
            </ul>
          </div>

          <DialogFooter className="pt-3">
            <Button variant="ghost" onClick={() => setIsCancelOpen(false)}>
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── ENTERPRISE QUOTE MODAL ─── */}
      <Dialog open={isEnterpriseModalOpen} onOpenChange={setIsEnterpriseModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-pink-500" />
              Enterprise Plan Inquiry
            </DialogTitle>
            <DialogDescription>
              Volume discounts, SAML SSO, NET-30 invoicing, and dedicated customer success.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enterpriseQuoteMutation.mutate({
                companyName: enterpriseCompany,
                teamSize: parseInt(enterpriseTeamSize, 10) || 50,
                requirements: enterpriseRequirements,
              });
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Company Name</label>
              <Input
                placeholder="e.g. Acme Corporation"
                value={enterpriseCompany}
                onChange={(e) => setEnterpriseCompany(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Team Size (Seats)</label>
              <Input
                type="number"
                min="50"
                value={enterpriseTeamSize}
                onChange={(e) => setEnterpriseTeamSize(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Security or Invoicing Requirements
              </label>
              <textarea
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                placeholder="e.g. SAML SSO with Okta, custom SLA, NET-30 invoicing..."
                value={enterpriseRequirements}
                onChange={(e) => setEnterpriseRequirements(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setIsEnterpriseModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={enterpriseQuoteMutation.isPending}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                {enterpriseQuoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Submit Enterprise Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
