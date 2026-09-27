import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import type { ChatChannel } from '../lib/chatService';

export interface GlobalShortcutsOptions {
  onOpenShortcuts?: () => void;
  onOpenNewDm?: () => void;
  onOpenNewChannel?: () => void;
  onOpenWorkingHours?: () => void;
  onOpenCreateTask?: () => void;
  channels?: ChatChannel[];
}

/**
 * Checks if active focus is inside a form control or editable surface.
 */
function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts(options: GlobalShortcutsOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isChat = location.pathname.startsWith('/chat');

  const {
    activeChannelId,
    isDetailsPaneOpen,
    setDetailsPaneOpen,
    activeThreadMessage,
    setActiveThreadMessage,
  } = useChatStore();

  const chordRef = useRef<{ key: string; expiresAt: number } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if event was already handled
      if (e.defaultPrevented) return;

      const hasMod = e.metaKey || e.ctrlKey;
      const hasAlt = e.altKey;
      const isInput = isEditableElement(document.activeElement);

      // 1. Keyboard Shortcuts Cheatsheet: Cmd+/ or ? (when outside inputs)
      if ((e.key === '/' && hasMod) || (e.key === '?' && (!isInput || hasMod))) {
        e.preventDefault();
        options.onOpenShortcuts?.();
        return;
      }

      // 2. Working Hours: Cmd+Shift+H / Ctrl+Shift+H
      if (hasMod && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault();
        options.onOpenWorkingHours?.();
        return;
      }

      // 3. Channel creation: Cmd+Shift+C / Ctrl+Shift+C (on chat route or globally)
      if (hasMod && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        if (options.onOpenNewChannel) {
          options.onOpenNewChannel();
        } else {
          navigate('/chat');
        }
        return;
      }

      // 4. Chat-specific hotkeys
      if (isChat) {
        // Alt+Up / Alt+Down: Navigate through channels
        if (hasAlt && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const channelList = options.channels || [];
          if (channelList.length > 0) {
            const currentIndex = channelList.findIndex((c) => c.id === activeChannelId);
            let nextIndex = 0;
            if (e.key === 'ArrowUp') {
              nextIndex = currentIndex > 0 ? currentIndex - 1 : channelList.length - 1;
            } else {
              nextIndex = currentIndex < channelList.length - 1 ? currentIndex + 1 : 0;
            }
            const nextChannel = channelList[nextIndex];
            if (nextChannel && nextChannel.id !== activeChannelId) {
              // Route is the source of truth — ChatPage syncs the store.
              navigate(`/chat/${nextChannel.id}`);
            }
          }
          return;
        }

        // Cmd+I or Cmd+.: Toggle channel details pane
        if (hasMod && (e.key === 'i' || e.key === 'I' || e.key === '.')) {
          e.preventDefault();
          setDetailsPaneOpen(!isDetailsPaneOpen);
          return;
        }

        // Cmd+T: Toggle Thread pane
        if (hasMod && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
          if (activeThreadMessage) {
            e.preventDefault();
            setActiveThreadMessage(null);
            return;
          }
        }
      }

      // 5. Non-input single key shortcuts & chords
      if (!isInput && !hasMod && !hasAlt) {
        const now = Date.now();

        // Check if we are inside a chord
        if (chordRef.current && now < chordRef.current.expiresAt) {
          const prefix = chordRef.current.key;
          chordRef.current = null;

          if (prefix === 'g') {
            if (e.key === 'c' || e.key === 'C') {
              e.preventDefault();
              navigate('/chat');
              return;
            }
            if (e.key === 'b' || e.key === 'B' || e.key === 'w' || e.key === 'W') {
              e.preventDefault();
              navigate('/');
              return;
            }
            if (e.key === 't' || e.key === 'T') {
              e.preventDefault();
              navigate('/my-tasks');
              return;
            }
          }
        }

        // Start 'g' chord
        if (e.key === 'g' || e.key === 'G') {
          chordRef.current = { key: 'g', expiresAt: now + 1200 };
          return;
        }

        // 'c': New Direct Message
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          if (options.onOpenNewDm) {
            options.onOpenNewDm();
          } else {
            navigate('/chat');
          }
          return;
        }

        // '/': Focus message composer on /chat
        if (e.key === '/' && isChat) {
          e.preventDefault();
          const composer = document.querySelector<HTMLTextAreaElement>(
            'textarea[placeholder*="Message"]'
          );
          composer?.focus();
          return;
        }

        // 't': Quick create task
        if ((e.key === 't' || e.key === 'T') && options.onOpenCreateTask) {
          e.preventDefault();
          options.onOpenCreateTask();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    navigate,
    location.pathname,
    isChat,
    options,
    activeChannelId,
    isDetailsPaneOpen,
    setDetailsPaneOpen,
    activeThreadMessage,
    setActiveThreadMessage,
  ]);
}
