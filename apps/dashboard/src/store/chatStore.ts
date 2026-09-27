import { create } from 'zustand';
import { chatService, type ChatMessageItem } from '../lib/chatService';
import type { UserPresence } from '../lib/presenceService';

export interface QueuedMessage {
  tempId: string;
  channelId: string;
  userId: string;
  body: string;
  parentMessageId?: string | null;
  replyToMessageId?: string | null;
  replyTo?: { id: string; body: string; authorName: string } | null;
  isAnnouncement?: boolean;
  attachmentIds?: string[];
  createdAt: string;
  author: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  status: 'sending' | 'queued' | 'failed';
  retryCount: number;
}

interface ChatStoreState {
  activeChannelId: string | null;
  activeThreadMessage: ChatMessageItem | null;
  isDetailsPaneOpen: boolean;
  replyingToMessage: ChatMessageItem | null;
  typingUsers: Record<string, { userId: string; userName: string; timestamp: number }[]>;
  presenceMap: Record<string, UserPresence>;
  readReceipts: Record<string, Record<string, string>>; // channelId -> { userId -> lastReadAt }
  outbox: QueuedMessage[];
  isGlobalDockOpen: boolean;
  dockedChannelId: string | null;
  isDockMinimized: boolean;
  drafts: Record<string, string>;
  /** True while the realtime socket is open. Pollers use this to stand down. */
  wsConnected: boolean;

  setActiveChannelId: (id: string | null) => void;
  setActiveThreadMessage: (message: ChatMessageItem | null) => void;
  setReplyingToMessage: (message: ChatMessageItem | null) => void;
  toggleDetailsPane: () => void;
  setDetailsPaneOpen: (isOpen: boolean) => void;
  setTyping: (channelId: string, userId: string, userName: string, isTyping: boolean) => void;
  clearExpiredTyping: () => void;
  setUserPresence: (presence: UserPresence) => void;
  setBatchPresence: (presences: UserPresence[]) => void;
  setReadReceipt: (channelId: string, userId: string, readAt: string) => void;
  enqueueOutbox: (message: QueuedMessage) => void;
  updateOutboxStatus: (tempId: string, status: 'sending' | 'queued' | 'failed') => void;
  removeFromOutbox: (tempId: string) => void;
  processOutbox: () => Promise<void>;
  openGlobalDock: (channelId?: string | null) => void;
  closeGlobalDock: () => void;
  toggleMinimizeDock: () => void;
  setDraft: (channelId: string, text: string) => void;
  setWsConnected: (connected: boolean) => void;
}

const OUTBOX_STORAGE_KEY = 'boardly_chat_outbox';

function loadOutboxFromStorage(): QueuedMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOutboxToStorage(outbox: QueuedMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(outbox));
  } catch {}
}

export const useChatStore = create<ChatStoreState>((set) => ({
  activeChannelId: null,
  activeThreadMessage: null,
  isDetailsPaneOpen: false,
  replyingToMessage: null,
  typingUsers: {},
  presenceMap: {},
  readReceipts: {},
  outbox: loadOutboxFromStorage(),
  isGlobalDockOpen: false,
  dockedChannelId: null,
  isDockMinimized: false,
  drafts: {},
  wsConnected: false,

  setActiveChannelId: (id) =>
    set({
      activeChannelId: id,
      activeThreadMessage: null, // close thread on channel switch
      isDetailsPaneOpen: false, // keep details closed by default
      replyingToMessage: null, // clear replying state on channel switch
    }),

  setActiveThreadMessage: (message) => set({ activeThreadMessage: message }),

  setReplyingToMessage: (message) => set({ replyingToMessage: message }),

  toggleDetailsPane: () => set((state) => ({ isDetailsPaneOpen: !state.isDetailsPaneOpen })),

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
      // Explicit null clears to the conversation list; undefined keeps current.
      dockedChannelId:
        channelId === undefined ? (state.dockedChannelId ?? state.activeChannelId) : channelId,
    })),

  closeGlobalDock: () => set({ isGlobalDockOpen: false }),

  toggleMinimizeDock: () => set((state) => ({ isDockMinimized: !state.isDockMinimized })),

  setDraft: (channelId, text) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [channelId]: text,
      },
    })),

  setWsConnected: (connected) =>
    set((state) => (state.wsConnected === connected ? state : { wsConnected: connected })),

  setReadReceipt: (channelId, userId, readAt) =>
    set((state) => ({
      readReceipts: {
        ...state.readReceipts,
        [channelId]: {
          ...state.readReceipts[channelId],
          [userId]: readAt,
        },
      },
    })),

  enqueueOutbox: (message) =>
    set((state) => {
      const next = [...state.outbox, message];
      saveOutboxToStorage(next);
      return { outbox: next };
    }),

  updateOutboxStatus: (tempId, status) =>
    set((state) => {
      const next = state.outbox.map((m) => (m.tempId === tempId ? { ...m, status } : m));
      saveOutboxToStorage(next);
      return { outbox: next };
    }),

  removeFromOutbox: (tempId) =>
    set((state) => {
      const next = state.outbox.filter((m) => m.tempId !== tempId);
      saveOutboxToStorage(next);
      return { outbox: next };
    }),

  processOutbox: async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    const { outbox, updateOutboxStatus, removeFromOutbox } = useChatStore.getState();
    if (outbox.length === 0) return;

    // eslint-disable-next-line unicorn/no-useless-spread -- snapshot: removeFromOutbox mutates the store array mid-loop
    for (const item of [...outbox]) {
      try {
        updateOutboxStatus(item.tempId, 'sending');
        await chatService.sendMessage(item.channelId, {
          body: item.body,
          parentMessageId: item.parentMessageId || undefined,
          replyToMessageId: item.replyToMessageId || undefined,
          isAnnouncement: item.isAnnouncement,
          attachmentIds: item.attachmentIds,
        });

        removeFromOutbox(item.tempId);
      } catch (err: any) {
        if (!navigator.onLine || err.message?.includes('Network Error') || !err.response) {
          updateOutboxStatus(item.tempId, 'queued');
          break;
        } else {
          updateOutboxStatus(item.tempId, 'failed');
        }
      }
    }
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useChatStore.getState().processOutbox();
  });
}
