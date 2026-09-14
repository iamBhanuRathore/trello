import { api } from './api';

export interface UserPresence {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  status: 'available' | 'busy' | 'away' | 'leave' | 'offline';
  customStatusText?: string | null;
  isManualOverride: boolean;
  timezone: string;
  localTime: string;
  isWithinWorkingHours: boolean;
  schedule?: any;
}

export interface WorkingScheduleDay {
  start: string;
  end: string;
  active: boolean;
}

export interface WorkingHoursConfig {
  timezone: string;
  schedule: Record<string, WorkingScheduleDay>;
}

export const presenceService = {
  async getUsersPresence(userIds: string[]): Promise<UserPresence[]> {
    if (!userIds || userIds.length === 0) return [];
    const res = await api.get('/presence/users', {
      params: { ids: userIds.join(',') },
    });
    return res.data;
  },

  async getMyPresence(): Promise<UserPresence> {
    const res = await api.get('/presence/me');
    return res.data;
  },

  async setMyPresence(payload: {
    status: 'available' | 'busy' | 'away' | 'leave' | 'offline';
    customStatusText?: string | null;
    expiresInMinutes?: number | null;
  }): Promise<UserPresence> {
    const res = await api.put('/presence/me', payload);
    return res.data;
  },

  async clearMyPresence(): Promise<UserPresence> {
    const res = await api.delete('/presence/me');
    return res.data;
  },

  async getWorkingHours(): Promise<WorkingHoursConfig> {
    const res = await api.get('/presence/working-hours');
    return res.data;
  },

  async updateWorkingHours(payload: {
    timezone: string;
    schedule: Record<string, WorkingScheduleDay>;
  }): Promise<any> {
    const res = await api.put('/presence/working-hours', payload);
    return res.data;
  },
};
