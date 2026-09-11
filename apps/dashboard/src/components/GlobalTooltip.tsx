import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TooltipState {
  text: string;
  x: number;
  y: number;
  side: 'top' | 'bottom';
  visible: boolean;
}

export function GlobalTooltip() {
  const [state, setState] = useState<TooltipState>({
    text: '',
    x: 0,
    y: 0,
    side: 'top',
    visible: false,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const isRecentRef = useRef<boolean>(false);
  const recentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const triggerEl = target.closest('[data-tooltip], [title]') as HTMLElement | null;
      if (!triggerEl) return;

      // Avoid double-tooltips if already handled by React Base UI TooltipTrigger
      if (
        triggerEl.hasAttribute('data-base-ui-tooltip-trigger') ||
        triggerEl.closest('[data-base-ui-tooltip-trigger]')
      ) {
        return;
      }

      // Convert native title attribute to data-tooltip to suppress browser native tooltip
      const nativeTitle = triggerEl.getAttribute('title');
      if (nativeTitle && nativeTitle.trim()) {
        triggerEl.dataset.tooltip = nativeTitle.trim();
        triggerEl.setAttribute('aria-label', nativeTitle.trim());
        triggerEl.removeAttribute('title');
      }

      const tooltipText = triggerEl.dataset.tooltip;
      if (!tooltipText || !tooltipText.trim()) return;

      if (activeElementRef.current === triggerEl && state.visible) return;
      activeElementRef.current = triggerEl;

      const show = () => {
        if (activeElementRef.current !== triggerEl) return;
        const rect = triggerEl.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const side = rect.top < 45 ? 'bottom' : 'top';
        const x = rect.left + rect.width / 2;
        const y = side === 'top' ? rect.top - 6 : rect.bottom + 6;

        setState({
          text: tooltipText,
          x,
          y,
          side,
          visible: true,
        });

        isRecentRef.current = true;
        if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
      };

      if (timerRef.current) clearTimeout(timerRef.current);

      if (isRecentRef.current) {
        show();
      } else {
        // Enterprise-standard hover intent delay: avoids accidental popups
        // while scanning the UI, matching the Base UI TooltipProvider below.
        timerRef.current = setTimeout(show, 500);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !activeElementRef.current) return;

      const related = e.relatedTarget as HTMLElement | null;
      if (activeElementRef.current.contains(related)) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      activeElementRef.current = null;
      setState((prev) => ({ ...prev, visible: false }));

      if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
      // Skip-delay grace window: moving between adjacent triggers shows
      // instantly within this window (Radix/enterprise default: 300ms).
      recentTimerRef.current = setTimeout(() => {
        isRecentRef.current = false;
      }, 300);
    };

    const handleScrollOrDown = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      activeElementRef.current = null;
      setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));

      // Same grace-window reset as mouseout: without this, hiding via
      // scroll/click leaves the instant-show flag stuck on forever.
      if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
      recentTimerRef.current = setTimeout(() => {
        isRecentRef.current = false;
      }, 300);
    };

    document.addEventListener('mouseover', handleMouseOver, { passive: true });
    document.addEventListener('mouseout', handleMouseOut, { passive: true });
    document.addEventListener('mousedown', handleScrollOrDown, { passive: true });
    window.addEventListener('scroll', handleScrollOrDown, { passive: true, capture: true });

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('mousedown', handleScrollOrDown);
      window.removeEventListener('scroll', handleScrollOrDown, { capture: true });
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
    };
  }, [state.visible]);

  if (!state.visible || !state.text) return null;

  return createPortal(
    <div
      data-slot="global-tooltip"
      style={{
        position: 'fixed',
        left: `${state.x}px`,
        top: `${state.y}px`,
        transform: state.side === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
      className="z-[99999] pointer-events-none max-w-xs origin-center overflow-hidden rounded-md bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md ring-1 ring-border/80 backdrop-blur-xs select-none duration-150 animate-in fade-in-0 zoom-in-95 data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1 whitespace-nowrap"
      data-side={state.side}
    >
      {state.text}
    </div>,
    document.body
  );
}
