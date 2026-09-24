import { create } from 'zustand';
import { api } from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  avatarUrl?: string;
  createdAt: string;
  isPlatformAdmin: boolean;
  timezone: string;
  twoFactorEnabled: boolean;
  role?: string | null; // org-level role: org_owner, org_admin, member, etc.
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: { user: User; accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('boardly_access_token'),
  isLoading: !!localStorage.getItem('boardly_access_token'),
  login: (data) => {
    if (data.accessToken) localStorage.setItem('boardly_access_token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('boardly_refresh_token', data.refreshToken);
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },
  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('boardly_refresh_token');
      if (refreshToken) {
        await api.post('/auth/sign-out', { refreshToken });
      }
    } catch (err) {}
    localStorage.removeItem('boardly_access_token');
    localStorage.removeItem('boardly_refresh_token');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
  checkAuth: async () => {
    const token = localStorage.getItem('boardly_access_token');
    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const res = await api.get('/auth/me');
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      const status = error?.response?.status;
      // Reboot/network blip (or 5xx): the stored session may still be valid.
      // Keep tokens and stay authenticated — queries retry on their own.
      // Only a definitive rejection clears the session below.
      if (status === undefined || status >= 500) {
        set({ isLoading: false });
        return;
      }
      // If a login just occurred with a new token, do not wipe the new session
      const currentToken = localStorage.getItem('boardly_access_token');
      if (!currentToken || currentToken === token) {
        localStorage.removeItem('boardly_access_token');
        localStorage.removeItem('boardly_refresh_token');
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    }
  },
}));
