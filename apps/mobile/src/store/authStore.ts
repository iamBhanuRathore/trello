import { create } from 'zustand';
import { setAuthToken } from '../lib/api';

export interface MobileUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  organizationId: string;
  isPlatformAdmin?: boolean;
}

interface AuthState {
  user: MobileUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isOfflineMode: boolean;
  setAuth: (user: MobileUser, token: string) => void;
  logout: () => void;
  toggleOfflineMode: () => void;
}

export const useMobileAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isOfflineMode: false,

  setAuth: (user, token) => {
    setAuthToken(token);
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    setAuthToken(null);
    set({ user: null, token: null, isAuthenticated: false });
  },

  toggleOfflineMode: () => {
    set((state) => ({ isOfflineMode: !state.isOfflineMode }));
  },
}));
