export type DemoCard = {
  id: string;
  title: string;
  label: string;
  labelColor: string;
  assignee: string;
  points: number;
  due: string;
  comments: number;
};

export type DemoColumn = { id: string; name: string; cardIds: string[] };
export type DemoBoard = { columns: DemoColumn[]; cards: Record<string, DemoCard> };

const C = (
  id: string,
  title: string,
  label: string,
  labelColor: string,
  assignee: string,
  points: number,
  due: string,
  comments = 0
): DemoCard => ({ id, title, label, labelColor, assignee, points, due, comments });

export const SEED_BOARD: DemoBoard = {
  columns: [
    { id: 'backlog', name: 'Backlog', cardIds: ['c1', 'c2', 'c3'] },
    { id: 'doing', name: 'In Progress', cardIds: ['c4', 'c5'] },
    { id: 'review', name: 'In Review', cardIds: ['c6'] },
    { id: 'done', name: 'Done', cardIds: ['c7', 'c8'] },
  ],
  cards: {
    c1: C('c1', 'Design homepage hero', 'Design', '#8b5cf6', 'AK', 5, 'Oct 10', 4),
    c2: C('c2', 'SSO login flow', 'Engineering', '#6366f1', 'RS', 8, 'Oct 12', 2),
    c3: C('c3', 'Q4 launch checklist', 'Planning', '#0ea5e9', 'NP', 3, 'Oct 14'),
    c4: C('c4', 'Drag-and-drop polish', 'Engineering', '#6366f1', 'AK', 5, 'Oct 08', 6),
    c5: C('c5', 'Pricing page copy', 'Marketing', '#f59e0b', 'MJ', 2, 'Oct 09', 1),
    c6: C('c6', 'Burndown chart widget', 'Analytics', '#10b981', 'RS', 5, 'Oct 07', 3),
    c7: C('c7', 'Invite flow emails', 'Growth', '#ec4899', 'NP', 3, 'Oct 05', 5),
    c8: C('c8', 'Mobile offline queue', 'Mobile', '#14b8a6', 'MJ', 8, 'Oct 03', 2),
  },
};

export type BoardTemplate = {
  id: string;
  name: string;
  desc: string;
  columns: string[];
  cards: string[];
};

export const TEMPLATES: BoardTemplate[] = [
  {
    id: 'sprint',
    name: 'Sprint Planning',
    desc: 'Backlog → Ready → In Progress → Review → Done, with story points on every card.',
    columns: ['Backlog', 'Ready', 'In Progress', 'Review', 'Done'],
    cards: ['Capacity planning', 'Sprint goal draft', 'Carry-over triage', 'Retro actions'],
  },
  {
    id: 'bugs',
    name: 'Bug Bash',
    desc: 'New → Triaged → Fixing → Verify → Released. Severity labels keep the queue honest.',
    columns: ['New', 'Triaged', 'Fixing', 'Verify', 'Released'],
    cards: [
      'Login 500 on Safari',
      'Avatar upload stalls',
      'Push duplicates',
      'CSV export encoding',
    ],
  },
  {
    id: 'content',
    name: 'Content Calendar',
    desc: 'Ideas → Drafting → Design → Scheduled → Published for the marketing pipeline.',
    columns: ['Ideas', 'Drafting', 'Design', 'Scheduled', 'Published'],
    cards: ['Launch announcement', 'Changelog video', 'Customer story: Acme', 'Docs refresh'],
  },
  {
    id: 'onboarding',
    name: 'Client Onboarding',
    desc: 'Kickoff → Setup → Training → Go-live → Handoff. One board per client, zero chaos.',
    columns: ['Kickoff', 'Setup', 'Training', 'Go-live', 'Handoff'],
    cards: [
      'Stakeholder interviews',
      'SSO configuration',
      'Team training session',
      'Success review',
    ],
  },
];

const PALETTE = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899'];

function moveInList(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Pure card-move used by the live demo (and its tests). No-op on unknown ids. */
export function applyMove(prev: DemoBoard, activeId: string, overId: string): DemoBoard {
  if (activeId === overId) return prev;
  const from = prev.columns.find((c) => c.cardIds.includes(activeId));
  if (!from) return prev;
  const toCol = prev.columns.find((c) => c.id === overId);
  const to = toCol ?? prev.columns.find((c) => c.cardIds.includes(overId));
  if (!to) return prev;
  if (from.id === to.id && !toCol) {
    const fromIdx = to.cardIds.indexOf(activeId);
    const toIdx = to.cardIds.indexOf(overId);
    if (fromIdx + 1 === toIdx) return prev; // already directly before target — no-op
    const ids = moveInList(to.cardIds, fromIdx, toIdx);
    return {
      ...prev,
      columns: prev.columns.map((c) => (c.id === to.id ? { ...c, cardIds: ids } : c)),
    };
  }
  const nextFrom = from.cardIds.filter((id) => id !== activeId);
  const insertAt = toCol ? to.cardIds.length : Math.max(0, to.cardIds.indexOf(overId));
  const nextTo = [...to.cardIds.slice(0, insertAt), activeId, ...to.cardIds.slice(insertAt)];
  return {
    ...prev,
    columns: prev.columns.map((c) =>
      c.id === from.id
        ? { ...c, cardIds: nextFrom }
        : c.id === to.id
          ? { ...c, cardIds: nextTo }
          : c
    ),
  };
}

export function templateToBoard(t: BoardTemplate): DemoBoard {
  const cards: Record<string, DemoCard> = {};
  const columns: DemoColumn[] = t.columns.map((name, ci) => {
    const ids: string[] = [];
    t.cards.forEach((title, i) => {
      if (i % t.columns.length === ci) {
        const id = `${t.id}-${ci}-${i}`;
        ids.push(id);
        cards[id] = C(
          id,
          title,
          name,
          PALETTE[(ci + i) % PALETTE.length]!,
          ['AK', 'RS', 'NP', 'MJ'][(ci + i) % 4]!,
          [2, 3, 5, 8][(ci + i) % 4]!,
          `Oct ${10 + ((ci + i) % 12)}`,
          (ci + i) % 5
        );
      }
    });
    return { id: `${t.id}-col-${ci}`, name, cardIds: ids };
  });
  return { columns, cards };
}
