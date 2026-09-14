import { create } from 'zustand';
import type { ChatMessageItem } from '../lib/chatService';
import type { UserPresence } from '../lib/presenceService';

interface ChatStoreState {
  activeChannelId: string | null;
  activeThreadMessage: ChatMessageItem | null;
  isDetailsPaneOpen: boolean;
  typingUsers: Record<string, { userId: string; userName: string; timestamp: number }[]>;
  presenceMap: Record<string, UserPresence>;
  isGlobalDockOpen: boolean;
  dockedChannelId: string | null;
  isDockMinimized: boolean;
  drafts: Record<string, string>;

  setActiveChannelId: (id: string | null) => void;
  setActiveThreadMessage: (message: ChatMessageItem | null) => void;
  toggleDetailsPane: () => void;
  setDetailsPaneOpen: (isOpen: boolean) => void;
  setTyping: (channelId: string, userId: string, userName: string, isTyping: boolean) => void;
  clearExpiredTyping: () => void;
  setUserPresence: (presence: UserPresence) => void;
  setBatchPresence: (presences: UserPresence[]) => void;
  openGlobalDock: (channelId?: string | null) => void;
  closeGlobalDock: () => void;
  toggleMinimizeDock: () => void;
  setDraft: (channelId: string, text: string) => void;
}

export const useChatStore = create<ChatStoreState>((set) => ({
  activeChannelId: null,
  activeThreadMessage: null,
  isDetailsPaneOpen: true,
  typingUsers: {},
  presenceMap: {},
  isGlobalDockOpen: false,
  dockedChannelId: null,
  isDockMinimized: false,
  drafts: {},

  setActiveChannelId: (id) =>
    set({
      activeChannelId: id,
      activeThreadMessage: null, // close thread on channel switch
    }),

  setActiveThreadMessage: (message) => set({ activeThreadMessage: message }),

  toggleDetailsPane: () =>
    set((state) => ({ isDetailsPaneOpen: !state.isDetailsPaneOpen })),

  setDetailsPaneOpen: (isOpen) => set({ isDetailsPaneOpen: isOpen }),

  setTyping: (channelId, userId, userName, isTyping) =>
    set((state) => {
      const current = state.typingUsers[channelId] || [];
      if (isTyping) {
        const filtered = current.filter((u) => u.userId !== userId);
        filtered.push({ userId, userName, timestamp: Date.now() });
        return {
          typingUsers: {
            ...state.typingUsers,
            [channelId]: filtered,
          },
        };
      } else {
        return {
          typingUsers: {
            ...state.typingUsers,
            [channelId]: current.filter((u) => u.userId !== userId),
          },
        };
      }
    }),

  clearExpiredTyping: () =>
    set((state) => {
      const now = Date.now();
      const updated: Record<string, { userId: string; userName: string; timestamp: number }[]> = {};
      let changed = false;

      for (const [chId, list] of Object.entries(state.typingUsers)) {
        const active = list.filter((u) => now - u.timestamp < 3500);
        if (active.length !== list.length) changed = true;
        if (active.length > 0) updated[chId] = active;
      }

      return changed ? { typingUsers: updated } : state;
    }),

  setUserPresence: (presence) =>
    set((state) => ({
      presenceMap: {
        ...state.presenceMap,
        [presence.userId]: presence,
      },
    })),

  setBatchPresence: (presences) =>
    set((state) => {
      const updated = { ...state.presenceMap };
      for (const p of presences) {
        updated[p.userId] = p;
      }
      return { presenceMap: updated };
    }),

  openGlobalDock: (channelId) =>
    set((state) => ({
      isGlobalDockOpen: true,
      isDockMinimized: false,
      dockedChannelId: channelId ?? state.dockedChannelId ?? state.activeChannelId,
    })),

  closeGlobalDock: () => set({ isGlobalDockOpen: false }),

  toggleMinimizeDock: () =>
    set((state) => ({ isDockMinimized: !state.isDockMinimized })),

  setDraft: (channelId, text) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [channelId]: text,
      },
    })),
}));
