import { create } from 'zustand';
import { api } from '../lib/api';

export interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  isPlatformAdmin: boolean;
  timezone?: string;
  createdAt: string;
}

interface AuthState {
  user: SuperAdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!(
    localStorage.getItem('boardly_superadmin_token') ||
    localStorage.getItem('boardly_access_token')
  ),
  isLoading: true,

  login: async ({ email, password }) => {
    const res = await api.post('/auth/sign-in', { email, password });
    const { user, accessToken } = res.data;

    if (!user?.isPlatformAdmin) {
      throw new Error(
        'Access Denied: Your account does not hold Platform Super Administrator privileges.'
      );
    }

    localStorage.setItem('boardly_superadmin_token', accessToken);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('boardly_superadmin_token');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  checkAuth: async () => {
    const token =
      localStorage.getItem('boardly_superadmin_token') ||
      localStorage.getItem('boardly_access_token');

    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const res = await api.get('/auth/me');
      const user = res.data;

      if (!user?.isPlatformAdmin) {
        localStorage.removeItem('boardly_superadmin_token');
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('boardly_superadmin_token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
