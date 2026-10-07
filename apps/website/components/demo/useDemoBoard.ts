'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  SEED_BOARD,
  templateToBoard,
  applyMove,
  type BoardTemplate,
  type DemoBoard,
} from '@/lib/demo';

const KEY = 'boardly-demo-board-v1';

function load(): DemoBoard {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoBoard;
      if (parsed.columns?.length && parsed.cards) return parsed;
    }
  } catch {
    /* corrupted storage — fall through to seed */
  }
  return SEED_BOARD;
}

export function useDemoBoard() {
  const [board, setBoard] = useState<DemoBoard>(SEED_BOARD);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setBoard(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(KEY, JSON.stringify(board));
      } catch {
        /* storage full/blocked — demo still works in memory */
      }
    }
  }, [board, hydrated]);

  const findColumn = useCallback(
    (cardId: string) => board.columns.find((c) => c.cardIds.includes(cardId)),
    [board]
  );

  const moveCard = useCallback((activeId: string, overId: string) => {
    setBoard((prev) => applyMove(prev, activeId, overId));
  }, []);

  const addCard = useCallback((columnId: string, title: string) => {
    const id = `local-${Date.now()}`;
    setBoard((prev) => ({
      cards: {
        ...prev.cards,
        [id]: {
          id,
          title,
          label: 'New',
          labelColor: '#6366f1',
          assignee: 'YOU',
          points: 1,
          due: 'Oct 20',
          comments: 0,
        },
      },
      columns: prev.columns.map((c) =>
        c.id === columnId ? { ...c, cardIds: [...c.cardIds, id] } : c
      ),
    }));
  }, []);

  const reset = useCallback(() => setBoard(SEED_BOARD), []);
  const loadTemplate = useCallback((t: BoardTemplate) => setBoard(templateToBoard(t)), []);

  return { board, findColumn, moveCard, addCard, reset, loadTemplate };
}
