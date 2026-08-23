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
  isAuthenticated: false,
  isLoading: true,
  login: (data) => {
    if (data.accessToken) localStorage.setItem('boardly_access_token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('boardly_refresh_token', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
  },
  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('boardly_refresh_token');
      if (refreshToken) {
        await api.post('/auth/sign-out', { refreshToken });
      }
    } catch (err) { }
    localStorage.removeItem('boardly_access_token');
    localStorage.removeItem('boardly_refresh_token');
    set({ user: null, isAuthenticated: false });
  },
  checkAuth: async () => {
    try {
      const res = await api.get('/auth/me');
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
