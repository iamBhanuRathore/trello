import { api } from './api';

export interface BillingOverviewData {
  plan: {
    id: string;
    name: string;
    tier: 'free' | 'pro' | 'business' | 'enterprise';
    maxSeats: number | null;
    maxWorkspaces: number | null;
    maxBoards: number | null;
    maxStorageGb: number | null;
  };
  subscription: {
    id: string;
    status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'past_due_downgrade_pending';
    seatCount: number;
    billingInterval: 'monthly' | 'annual';
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    pendingSeatChange: boolean;
    seatVersion: number;
    billingTerms: string;
    trialEndsAt: string | null;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
  };
  seats: {
    totalPaid: number;
    activeBillable: number;
    pendingBillable: number;
    usedBillable: number;
    vacant: number;
  };
  guests: {
    activeGuests: number;
    pendingGuests: number;
    usedGuests: number;
    guestCap: number;
    isOverLimit: boolean;
  };
  pricing: {
    monthlyRatePerSeat: number;
    annualRatePerSeat: number;
    estimatedMonthlyTotal: number;
  };
  invoices: Array<{
    id: string;
    number: string | null;
    amountPaid: number;
    currency: string;
    status: string;
    created: number;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
  }>;
}

export interface ProrationPreviewData {
  currentSeats: number;
  newSeats: number;
  seatDelta: number;
  prorationBehavior: string;
  upcomingInvoice: {
    amountDue: number;
    subtotal: number;
    prorationAmount: number;
    currency: string;
    nextPaymentDate: number | null;
    lineItems: Array<{
      description: string;
      amount: number;
      proration: boolean;
      quantity?: number;
    }>;
  };
}

export const billingService = {
  getOverview: async (): Promise<BillingOverviewData> => {
    const { data } = await api.get('/billing/overview');
    return data;
  },

  createCheckout: async (payload: {
    planTier: 'pro' | 'business';
    interval: 'monthly' | 'annual';
    seatCount: number;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ url: string }> => {
    const { data } = await api.post('/billing/checkout', payload);
    return data;
  },

  createPortal: async (returnUrl?: string): Promise<{ url: string }> => {
    const { data } = await api.post('/billing/portal', { returnUrl });
    return data;
  },

  previewSeatChange: async (seats: number): Promise<ProrationPreviewData> => {
    const { data } = await api.post('/billing/seats/preview', { seats });
    return data;
  },

  increaseSeats: async (seats: number) => {
    const { data } = await api.post('/billing/seats/increase', { seats });
    return data;
  },

  scheduleSeatDecrease: async (seats: number) => {
    const { data } = await api.post('/billing/seats/schedule-decrease', { seats });
    return data;
  },

  requestCancellation: async () => {
    const { data } = await api.post('/billing/cancel');
    return data;
  },

  requestEnterpriseQuote: async (payload: {
    companyName: string;
    teamSize: number;
    requirements?: string;
  }) => {
    const { data } = await api.post('/billing/enterprise/request-quote', payload);
    return data;
  },
};
