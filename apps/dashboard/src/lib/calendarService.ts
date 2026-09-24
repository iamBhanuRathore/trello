import { api } from './api';

export interface CalendarBlock {
  kind: 'task';
  id: string;
  key?: string | null;
  title: string;
  start: string;
  end?: string | null;
  stageId?: string | null;
  listId?: string | null;
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
};
