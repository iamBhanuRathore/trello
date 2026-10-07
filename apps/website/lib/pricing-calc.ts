export type PlanId = 'free' | 'pro' | 'business' | 'enterprise';

export const PER_SEAT: Record<Exclude<PlanId, 'free' | 'enterprise'>, number> = {
  pro: 10,
  business: 20,
};

export function seatCost(plan: PlanId, seats: number, annual: boolean): number | null {
  if (plan === 'enterprise') return null;
  if (plan === 'free') return 0;
  const clamped = Math.max(1, Math.min(1000, Math.floor(seats)));
  const monthly = PER_SEAT[plan] * clamped;
  return annual ? Math.round(monthly * 12 * 0.8) : monthly;
}

export function formatCost(plan: PlanId, seats: number, annual: boolean): string {
  const v = seatCost(plan, seats, annual);
  if (v === null) return 'Custom';
  if (v === 0) return '$0';
  return annual ? `$${v.toLocaleString()}/yr` : `$${v.toLocaleString()}/mo`;
}

export function savingsVsMonthly(plan: PlanId, seats: number): number {
  if (plan === 'free' || plan === 'enterprise') return 0;
  const m = seatCost(plan, seats, false) ?? 0;
  const a = seatCost(plan, seats, true) ?? 0;
  return m * 12 - a;
}
