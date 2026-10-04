import { api, getApiErrorMessage } from './api';

// Google writes go to Google's servers and back — bound them client-side too
// so a stall fails loudly instead of hanging the mutation forever.
const WRITE_TIMEOUT_MS = 30000;

export function describeCalendarError(err: any, fallback: string): string {
  if (!err?.response) {
    return 'Server unreachable — change NOT saved. The meeting on Google is untouched; please retry.';
  }
  // Delegate to the shared parser instead of reading `data.message` directly.
  // Backend error bodies are `{ error, details? }` (see lib/errors.ts
  // formatErrorResponse) and only validation failures carry `message`, so
  // reading `.message` alone silently discarded the real text and every failure
  // rendered as "Request failed with status code 502".
  return getApiErrorMessage(err, fallback);
}

export interface CalendarBlock {
  kind: 'task';
  id: string;
  key?: string | null;
  title: string;
  start: string;
  end?: string | null;
  stageId?: string | null;
  listId?: string | null;
  googleUrl?: string | null;
}

export interface CalendarDue {
  kind: 'due';
  id: string;
  key?: string | null;
  title: string;
  start: string;
}

export interface CalendarSprint {
  kind: 'sprint';
  id: string;
  name: string;
  status: string;
  start: string;
  end: string;
  projectId: string;
}

export interface CalendarMilestone {
  kind: 'milestone';
  id: string;
  name: string;
  status: string;
  start: string;
  end: string;
  projectId: string;
}

export interface CalendarExternal {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  htmlLink?: string | null;
  description?: string | null;
  attendees?: string[];
  location?: string | null;
  hangoutLink?: string | null;
  organizer?: string | null;
  recurrence?: string[];
}

export interface UnscheduledTask {
  id: string;
  key?: string | null;
  title: string;
  dueDate?: string | null;
}

export interface CalendarFeed {
  blocks: CalendarBlock[];
  dueDates: CalendarDue[];
  unscheduled: UnscheduledTask[];
  sprints: CalendarSprint[];
  milestones: CalendarMilestone[];
  external: CalendarExternal[];
  externalError?: string | null;
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  connection?: {
    id: string;
    email?: string | null;
    lastSyncAt?: string | null;
    lastError?: string | null;
  } | null;
}

export const calendarService = {
  async status(): Promise<GoogleStatus> {
    const res = await api.get('/calendar/google/status');
    return res.data;
  },

  async authUrl(): Promise<string> {
    const res = await api.get('/calendar/google/auth-url');
    return res.data.url;
  },

  async disconnect(): Promise<void> {
    await api.delete('/calendar/google');
  },

  async feed(from: string, to: string): Promise<CalendarFeed> {
    const res = await api.get('/calendar/events', { params: { from, to } });
    return res.data;
  },

  async schedule(cardId: string, start: string | null, end?: string | null): Promise<any> {
    const res = await api.patch(`/calendar/cards/${cardId}/schedule`, { start, end: end ?? null });
    return res.data;
  },

  async pull(): Promise<{ events: CalendarExternal[] }> {
    const res = await api.post('/calendar/sync/pull');
    return res.data;
  },

  async push(): Promise<{ pushed: number; failed: number }> {
    const res = await api.post('/calendar/sync/push');
    return res.data;
  },

  async createExternalEvent(payload: {
    title: string;
    start?: string | null;
    end?: string | null;
    description?: string;
  }): Promise<CalendarExternal> {
    const res = await api.post('/calendar/google/events', payload, {
      timeout: WRITE_TIMEOUT_MS,
    });
    return res.data;
  },

  async updateExternalEvent(
    eventId: string,
    payload: { title?: string; start?: string | null; end?: string | null; addConference?: boolean }
  ): Promise<{ success: boolean; hangoutLink?: string | null }> {
    const res = await api.patch(`/calendar/google/events/${eventId}`, payload, {
      timeout: WRITE_TIMEOUT_MS,
    });
    return res.data;
  },

  async deleteExternalEvent(eventId: string): Promise<{ success: boolean }> {
    const res = await api.delete(`/calendar/google/events/${eventId}`, {
      timeout: WRITE_TIMEOUT_MS,
    });
    return res.data;
  },
};
