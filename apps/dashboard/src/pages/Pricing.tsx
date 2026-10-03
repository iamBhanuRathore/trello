import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { billingService } from '../lib/billingService';
import { Button } from '@boardly/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boardly/ui/dialog';
import { Input } from '@boardly/ui/input';
import { CheckCircle2, Sparkles, Zap, Building2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useDialogClose } from '../hooks/useDialogClose';

export const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');
  const [proSeats, setProSeats] = useState<number>(5);
  const [businessSeats, setBusinessSeats] = useState<number>(10);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  // Enterprise Quote Modal State
  const [isEnterpriseModalOpen, setIsEnterpriseModalOpen] = useState(false);
  const [enterpriseCompany, setEnterpriseCompany] = useState('');
  const [enterpriseTeamSize, setEnterpriseTeamSize] = useState('50');
  const [enterpriseRequirements, setEnterpriseRequirements] = useState('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  const handleCheckout = async (planTier: 'pro' | 'business', seats: number) => {
    if (!isAuthenticated) {
      toast.info('Please sign up or log in to select a plan');
      navigate('/signup');
      return;
    }

    try {
      setLoadingTier(planTier);
      const res = await billingService.createCheckout({
        planTier,
        interval,
        seatCount: seats,
      });

      if (res?.url) {
        window.location.href = res.url;
      } else {
        toast.error('Failed to generate checkout link');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start checkout');
    } finally {
      setLoadingTier(null);
    }
  };

  const handleEnterpriseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enterpriseCompany.trim()) {
      toast.error('Please enter your company name');
      return;
    }

    try {
      setIsSubmittingQuote(true);
      await billingService.requestEnterpriseQuote({
        companyName: enterpriseCompany,
        teamSize: parseInt(enterpriseTeamSize, 10) || 50,
        requirements: enterpriseRequirements,
      });
      toast.success(
        'Your quote request has been submitted! Our enterprise sales team will reach out within 24 hours.'
      );
      setIsEnterpriseModalOpen(false);
      setEnterpriseCompany('');
      setEnterpriseRequirements('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to submit quote request');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  // Single close path (AGENTS.md §11) — requestClose is idempotent per
  // open session, so X / backdrop / Esc cannot double-close.
  const { handleOpenChange } = useDialogClose({
    isOpen: isEnterpriseModalOpen,
    onClose: () => setIsEnterpriseModalOpen(false),
  });

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
              Boardly
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={() => navigate('/admin/billing')}>
                Go to Billing Hub
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                  Sign In
                </Button>
                <Button size="sm" onClick={() => navigate('/signup')}>
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 pt-16 pb-12 text-center md:pt-24 md:pb-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Industry-Standard Per-Head Billing
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Predictable, transparent pricing <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              built for teams of every scale.
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
            Pay only for active team members. Unbilled guest accounts, instant prorated seat
            adjustments, and Slack-style fair billing credits built-in.
          </p>

          {/* Billing Interval Toggle */}
          <div className="pt-6 flex justify-center">
            <div className="inline-flex items-center rounded-xl bg-muted p-1 border border-border/60">
              <button
                type="button"
                onClick={() => setInterval('monthly')}
                className={`rounded-lg px-5 py-2 text-sm font-medium transition-all ${
                  interval === 'monthly'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setInterval('annual')}
                className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all ${
                  interval === 'annual'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Annual Billing
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Save 20%
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grid gap-8 lg:grid-cols-4 md:grid-cols-2">
          {/* FREE TIER */}
          <div className="relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-6 shadow-xs transition-all hover:border-border hover:shadow-md">
            <div>
              <div className="mb-4">
                <span className="inline-block rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  Starter
                </span>
                <h3 className="mt-2 text-2xl font-bold text-card-foreground">Free</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Essential tools for small teams & projects.
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-extrabold text-foreground">$0</span>
                <span className="text-sm text-muted-foreground"> / month</span>
                <p className="mt-1 text-xs text-muted-foreground font-medium">
                  Free forever · Up to 5 seats
                </p>
              </div>

              <div className="h-px w-full bg-border/60 mb-6" />

              <ul className="space-y-3 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>
                    <strong>5 team seats</strong> included
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>
                    <strong>3 free viewer guests</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>1 Workspace & 3 Active Boards</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>1 GB Cloud Storage</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Basic Kanban & Scrum Views</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (isAuthenticated ? navigate('/admin/billing') : navigate('/signup'))}
              >
                {isAuthenticated ? 'Current Free Tier' : 'Get Started Free'}
              </Button>
            </div>
          </div>

          {/* PRO TIER */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-indigo-500/50 bg-gradient-to-b from-indigo-500/5 via-card to-card p-6 shadow-md transition-all hover:border-indigo-500 hover:shadow-xl">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-sm">
              MOST POPULAR
            </div>

            <div>
              <div className="mb-4">
                <span className="inline-block rounded-lg bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Growing Teams
                </span>
                <h3 className="mt-2 text-2xl font-bold text-card-foreground">Pro</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Unlimited boards, custom workflows & agile tracking.
                </p>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-foreground">
                    ${interval === 'annual' ? '8' : '10'}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">/ seat / mo</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {interval === 'annual' ? 'Billed annually ($96/seat/yr)' : 'Billed monthly'}
                </p>
              </div>

              {/* Dynamic Seat Slider */}
              <div className="mb-6 rounded-xl bg-muted/60 p-3 border border-border/60">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-indigo-500" />
                    Seats: {proSeats}
                  </span>
                  <span className="text-foreground font-bold">
                    ${(interval === 'annual' ? 8 : 10) * proSeats}/mo
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={proSeats}
                  onChange={(e) => setProSeats(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>5 seats</span>
                  <span>50 seats</span>
                </div>
              </div>

              <div className="h-px w-full bg-border/60 mb-6" />

              <ul className="space-y-3 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span>
                    <strong>Unlimited boards & workspaces</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span>
                    <strong>10 free viewer guests</strong> per paid seat
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span>50 GB Cloud Storage</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span>Custom Sprint Planning & Reports</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span>Timesheets & Time Tracking</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Button
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-md shadow-indigo-500/20"
                disabled={loadingTier === 'pro'}
                onClick={() => handleCheckout('pro', proSeats)}
              >
                {loadingTier === 'pro' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Upgrade to Pro ({proSeats} seats)
              </Button>
            </div>
          </div>

          {/* BUSINESS TIER */}
          <div className="relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-6 shadow-xs transition-all hover:border-purple-500/50 hover:shadow-md">
            <div>
              <div className="mb-4">
                <span className="inline-block rounded-lg bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
                  Scale & Control
                </span>
                <h3 className="mt-2 text-2xl font-bold text-card-foreground">Business</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Portfolio reporting, custom roles & priority SLA.
                </p>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-foreground">
                    ${interval === 'annual' ? '16' : '20'}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">/ seat / mo</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {interval === 'annual' ? 'Billed annually ($192/seat/yr)' : 'Billed monthly'}
                </p>
              </div>

              {/* Dynamic Seat Slider */}
              <div className="mb-6 rounded-xl bg-muted/60 p-3 border border-border/60">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-purple-500" />
                    Seats: {businessSeats}
                  </span>
                  <span className="text-foreground font-bold">
                    ${(interval === 'annual' ? 16 : 20) * businessSeats}/mo
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={150}
                  step={5}
                  value={businessSeats}
                  onChange={(e) => setBusinessSeats(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>10 seats</span>
                  <span>150 seats</span>
                </div>
              </div>

              <div className="h-px w-full bg-border/60 mb-6" />

              <ul className="space-y-3 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
                  <span>Everything in Pro</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
                  <span>
                    <strong>25 free viewer guests</strong> per paid seat
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
                  <span>250 GB Cloud Storage</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
                  <span>Portfolio Cross-Project Dashboards</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
                  <span>Custom RBAC & Stage Templates</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Button
                variant="outline"
                className="w-full border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400"
                disabled={loadingTier === 'business'}
                onClick={() => handleCheckout('business', businessSeats)}
              >
                {loadingTier === 'business' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Upgrade to Business ({businessSeats} seats)
              </Button>
            </div>
          </div>

          {/* ENTERPRISE TIER */}
          <div className="relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-6 shadow-xs transition-all hover:border-pink-500/50 hover:shadow-md">
            <div>
              <div className="mb-4">
                <span className="inline-block rounded-lg bg-pink-500/10 px-2.5 py-1 text-xs font-semibold text-pink-600 dark:text-pink-400">
                  Custom Contracts
                </span>
                <h3 className="mt-2 text-2xl font-bold text-card-foreground">Enterprise</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  SSO / SAML, NET-30 invoicing, and tailored SLA.
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-extrabold text-foreground">Custom</span>
                <span className="text-sm text-muted-foreground"> / seat</span>
                <p className="mt-1 text-xs text-muted-foreground font-medium">
                  Starts at $36/seat · Min 50 seats
                </p>
              </div>

              <div className="h-px w-full bg-border/60 mb-6" />

              <ul className="space-y-3 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pink-500 shrink-0" />
                  <span>
                    <strong>SAML / SSO & SCIM Provisioning</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pink-500 shrink-0" />
                  <span>
                    <strong>Unlimited viewer guests & storage</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pink-500 shrink-0" />
                  <span>Stripe Invoicing (NET-30 / NET-60)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pink-500 shrink-0" />
                  <span>Dedicated Account Manager & 99.99% SLA</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pink-500 shrink-0" />
                  <span>SOC 2 Compliance & Audit Export</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Button
                variant="outline"
                className="w-full border-pink-500/40 hover:bg-pink-500/10 hover:text-pink-600 dark:hover:text-pink-400"
                onClick={() => setIsEnterpriseModalOpen(true)}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Comparison Matrix */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Compare All Plan Features</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Every feature compared side-by-side with full transparency.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/60 bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="py-4 px-6">Capability</th>
                <th className="py-4 px-6 text-center">Free</th>
                <th className="py-4 px-6 text-center text-indigo-600 dark:text-indigo-400">Pro</th>
                <th className="py-4 px-6 text-center text-purple-600 dark:text-purple-400">
                  Business
                </th>
                <th className="py-4 px-6 text-center text-pink-600 dark:text-pink-400">
                  Enterprise
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-xs">
              <tr>
                <td className="py-4 px-6 font-medium text-foreground">Included Seats</td>
                <td className="py-4 px-6 text-center">Up to 5</td>
                <td className="py-4 px-6 text-center">Flexible per-head</td>
                <td className="py-4 px-6 text-center">Flexible per-head</td>
                <td className="py-4 px-6 text-center">50+ custom seats</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-foreground">Free Viewer Guests</td>
                <td className="py-4 px-6 text-center">3 total</td>
                <td className="py-4 px-6 text-center">10 per paid seat</td>
                <td className="py-4 px-6 text-center">25 per paid seat</td>
                <td className="py-4 px-6 text-center">Unlimited</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-foreground">Workspaces</td>
                <td className="py-4 px-6 text-center">1</td>
                <td className="py-4 px-6 text-center">Unlimited</td>
                <td className="py-4 px-6 text-center">Unlimited</td>
                <td className="py-4 px-6 text-center">Unlimited</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-foreground">Kanban & Scrum Boards</td>
                <td className="py-4 px-6 text-center">3 Boards</td>
                <td className="py-4 px-6 text-center">Unlimited</td>
                <td className="py-4 px-6 text-center">Unlimited</td>
                <td className="py-4 px-6 text-center">Unlimited</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-foreground">Storage</td>
                <td className="py-4 px-6 text-center">1 GB</td>
                <td className="py-4 px-6 text-center">50 GB</td>
                <td className="py-4 px-6 text-center">250 GB</td>
                <td className="py-4 px-6 text-center">Unlimited</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-foreground">
                  Fair Billing Vacant Seat Credits
                </td>
                <td className="py-4 px-6 text-center">✓</td>
                <td className="py-4 px-6 text-center">✓</td>
                <td className="py-4 px-6 text-center">✓</td>
                <td className="py-4 px-6 text-center">✓</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-foreground">SSO & SAML Authentication</td>
                <td className="py-4 px-6 text-center text-muted-foreground">—</td>
                <td className="py-4 px-6 text-center text-muted-foreground">—</td>
                <td className="py-4 px-6 text-center text-muted-foreground">—</td>
                <td className="py-4 px-6 text-center text-pink-500 font-bold">✓ Included</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-foreground">
                  Payment Invoicing (NET-30)
                </td>
                <td className="py-4 px-6 text-center text-muted-foreground">—</td>
                <td className="py-4 px-6 text-center text-muted-foreground">—</td>
                <td className="py-4 px-6 text-center text-muted-foreground">—</td>
                <td className="py-4 px-6 text-center text-pink-500 font-bold">✓ Included</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Enterprise Quote Modal */}
      <Dialog open={isEnterpriseModalOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-pink-500" />
              Request Enterprise Quote
            </DialogTitle>
            <DialogDescription>
              Get a custom proposal with volume pricing, NET-30 invoicing, and dedicated
              implementation assistance.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEnterpriseSubmit} className="space-y-4 pt-2">
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
              <label className="text-xs font-semibold text-foreground">
                Expected Team Size (Seats)
              </label>
              <Input
                type="number"
                min="50"
                placeholder="50"
                value={enterpriseTeamSize}
                onChange={(e) => setEnterpriseTeamSize(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Specific Requirements or Integrations
              </label>
              <textarea
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                placeholder="e.g. SAML SSO with Okta, custom SLA, European data residency..."
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
                disabled={isSubmittingQuote}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                {isSubmittingQuote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit Quote Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
