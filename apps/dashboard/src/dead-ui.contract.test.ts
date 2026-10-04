import { describe, it, expect } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Dead / misleading UI contracts (P3-5).
 *
 * AGENTS.md §7: "every visible button must either act or be disabled with an
 * explanatory tooltip. A control that silently does nothing is a defect."
 *
 * This pins four confirmed cases from the dead-control audit. The generic guard
 * at the bottom is the reusable part: a NON-interactive element (h4/span/div)
 * carrying `cursor-pointer` is, by definition, advertising a click it does not
 * handle — the exact signature of the checklist-title bug.
 */

const APP = import.meta.dir;
const read = (rel: string) => readFile(join(APP, rel), 'utf-8');

async function tsxFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(APP, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await tsxFiles(rel)));
    // Normalise: the walk starts at '.', so paths would otherwise be './foo'.
    else if (entry.name.endsWith('.tsx')) out.push(rel.replace(/^\.\//, ''));
  }
  return out;
}

/**
 * Locates opening tags that advertise a click (`cursor-pointer`) without
 * handling one.
 *
 * Two things make this non-trivial, and both produced false positives in the
 * first version of this guard:
 *
 * 1. `className` template literals contain nested `${…}` braces and JSX
 *    conditionals, so a regex cannot reliably find the end of a tag. This walks
 *    the tag with a brace/backtick counter instead.
 * 2. Base UI / Radix `render={<div …>}` and `asChild` inject their own
 *    onClick/onKeyDown at runtime, so those elements look handler-less in source
 *    but are not. Any tag lexically inside an open `render={` brace is skipped.
 *
 * Components (capitalised tags) are skipped too: they may forward handlers via
 * props or spread, which source inspection cannot see.
 */
function deadPointerTags(src: string): string[] {
  const dead: string[] = [];

  // Ranges of `render={ … }` / `asChild={ … }` attribute values, by brace depth.
  const injected: Array<[number, number]> = [];
  {
    const stack: number[] = [];
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '{') stack.push(i);
      else if (src[i] === '}') {
        const open = stack.pop();
        if (open !== undefined) {
          const before = src.slice(Math.max(0, open - 24), open);
          if (/render\s*=\s*$/.test(before) || /asChild\s*=\s*$/.test(before)) {
            injected.push([open, i]);
          }
        }
      }
    }
  }
  const isInjected = (idx: number) => injected.some(([a, b]) => idx > a && idx < b);

  for (let i = src.indexOf('cursor-pointer'); i !== -1; i = src.indexOf('cursor-pointer', i + 1)) {
    // Walk back to the `<` that opens this tag, stepping over `key={…}`-style
    // attribute expressions rather than stopping at their closing brace.
    let start = -1;
    let back = 0;
    for (let j = i; j >= 0; j--) {
      const c = src[j];
      if (c === '}') back++;
      else if (c === '{') {
        if (back === 0) break;
        back--;
      } else if (back === 0 && c === '>') break;
      else if (back === 0 && c === '<') {
        start = j;
        break;
      }
    }
    if (start === -1 || isInjected(start)) continue;

    const nameMatch = /^<([A-Za-z][\w.]*)/.exec(src.slice(start));
    if (!nameMatch) continue;
    const tag = nameMatch[1];
    // Native interactive elements handle clicks by definition; components may
    // forward handlers we cannot see.
    if (!/^[a-z]/.test(tag) || /^(button|a|label|summary|input|select|textarea|option)$/.test(tag))
      continue;

    // Walk forward to the tag's closing `>`, tracking `{}` and template literals.
    let depth = 0;
    let inTemplate = false;
    let end = -1;
    for (let j = start + 1; j < src.length; j++) {
      const c = src[j];
      if (c === '\\') {
        j++;
        continue;
      }
      if (c === '`') inTemplate = !inTemplate;
      else if (!inTemplate && c === '{') depth++;
      else if (!inTemplate && c === '}') depth--;
      else if (!inTemplate && depth === 0 && c === '>') {
        end = j;
        break;
      }
    }
    if (end === -1) continue;

    const attrs = src.slice(start, end + 1);
    if (/\bon(Click|MouseDown|PointerDown|KeyDown|Press)\s*=/.test(attrs)) continue;
    dead.push(`<${tag}> @${src.slice(0, start).split('\n').length}`);
  }
  return dead;
}

describe('dead control guard', () => {
  it('no native element advertises cursor-pointer without handling a click', async () => {
    const files = await tsxFiles('.');
    const offenders: string[] = [];
    for (const f of files) {
      const dead = deadPointerTags(await read(f));
      if (dead.length) offenders.push(`${f}: ${dead.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('checklist title is a real rename control', () => {
  it('renders a button that opens the existing inline rename editor', async () => {
    const src = await read('components/board/task-detail/TaskChecklistsCard.tsx');
    // The audit found `cursor-pointer hover:text-primary` on an <h4> with no
    // handler — the only such pair in the file, so it read as tappable and was
    // inert. Touch users had no cue at all.
    expect(src).not.toMatch(/<h4[^>]*cursor-pointer/);
    expect(src).toMatch(/<button[\s\S]{0,400}?title="Rename checklist"/);
    // …and it must drive the same state the "Rename checklist" menu item does,
    // so the two entry points cannot drift.
    const titleBlock = src.slice(
      src.indexOf('title="Rename checklist"') - 400,
      src.indexOf('title="Rename checklist"')
    );
    expect(titleBlock).toContain('setEditingChecklistId(cl.id)');
    expect(titleBlock).toContain('setEditingChecklistTitle(');
  });
});

describe('My Tasks counters match their lists', () => {
  it('the All Tasks badge uses the deduplicated union count, not a sum of sets', async () => {
    const src = await read('pages/MyTasks.tsx');
    // The backend builds `all` as a Set union and returns `count(distinct id)`
    // as `total`; the four summary fields are four independent Set sizes. Any
    // card both assigned and commented on was counted twice, so the badge
    // permanently over-reported against the list it labels.
    expect(src).not.toMatch(/totalAssigned\s*\+\s*\n?\s*summary\.totalObserving/);
    expect(src).toContain('const allTasksCount = liveCounts?.total ?? 0;');
  });

  it('the summary envelope has exactly one queryFn across the app', async () => {
    // Regression: the page and the sidebar both used ['my-tasks','summary'] with
    // DIFFERENT shapes ({summary,total} vs a bare summary). TanStack keeps one
    // cache entry per key, so whichever observer mounted last decided the shape
    // for both — the loser read undefined and all counters fell back to 0 while
    // the API correctly returned 32 assigned tasks.
    const page = await read('pages/MyTasks.tsx');
    const sidebar = await read('components/AppSidebar.tsx');
    const hook = await read('hooks/useMyTasksSummary.ts');

    expect(page).toContain('useMyTasksSummary()');
    expect(sidebar).toContain('useMyTasksSummary()');
    // The key must be declared in exactly one place.
    expect(hook).toContain("queryKey: ['my-tasks', 'summary']");
    expect(page).not.toContain("queryKey: ['my-tasks', 'summary']");
    expect(sidebar).not.toContain("queryKey: ['my-tasks', 'summary']");
    // Neither consumer may re-declare the query locally any more.
    expect(page).not.toContain("api.get('/cards/my-tasks?limit=1')");
    expect(sidebar).not.toContain("api.get('/cards/my-tasks?limit=1')");
    // The sidebar must read through the envelope, not off a bare summary.
    expect(sidebar).toContain('myTasksSummary?.summary?.openAssignedCount ?? 0');
  });
});

describe('automation rule rows do not look editable', () => {
  it('no rule tile carries a click affordance it does not implement', async () => {
    const src = await read('components/board/AutomationsModal.tsx');
    // There is no edit path for a rule anywhere in the file — only create and
    // delete. The hover tint advertised a row click that did nothing, so the
    // affordance was removed rather than a half-built editor added (adding rule
    // editing would be a feature, and this pass is fix-only).
    expect(src).not.toMatch(/hover:bg-muted\/20/);
    const ruleRow = src.slice(
      src.indexOf('automations.map('),
      src.indexOf('automations.map(') + 900
    );
    expect(ruleRow).not.toContain('cursor-pointer');
  });
});

describe('disabled controls explain themselves', () => {
  it('Timesheets Export CSV says why it is disabled', async () => {
    const src = await read('pages/Timesheets.tsx');
    const btn = src.slice(
      src.indexOf('onClick={exportCSV}') - 200,
      src.indexOf('onClick={exportCSV}') + 400
    );
    expect(btn).toContain('disabled={entries.length === 0}');
    expect(btn).toContain('title={');
    expect(btn).toContain('No timesheet entries match the current filters');
  });
});

describe('presence avatars are informational', () => {
  it('does not claim to be clickable — nothing handles the click', async () => {
    const src = await read('components/board/PresenceAvatars.tsx');
    // Found by the generic guard above, not the manual audit: the avatar
    // wrapper carried `cursor-pointer` and a tooltip, but BoardHeader renders
    // <PresenceAvatars> bare, so a click did nothing.
    expect(src).not.toContain('cursor-pointer');
    expect(src).toContain('group-hover:flex'); // tooltip stays — it is information
  });
});

describe('saved-search rows are fully clickable and touch-deletable', () => {
  it('the whole row label is a button, not a padded dead zone', async () => {
    const src = await read('components/SearchPalette.tsx');
    const row = src.slice(
      src.indexOf('savedSearches.map('),
      src.indexOf('savedSearches.map(') + 2000
    );
    // Previously the row advertised hover + cursor-pointer while only the inner
    // <div> carried the onClick, so the row's padding was inert.
    expect(row).toContain('<button');
    expect(row).toContain('onClick={() => setQuery(ss.query)}');
    expect(row).toContain('cursor-pointer');
  });

  it('the delete action is not hover-only', async () => {
    const src = await read('components/SearchPalette.tsx');
    const row = src.slice(
      src.indexOf('savedSearches.map('),
      src.indexOf('savedSearches.map(') + 2000
    );
    // `opacity-0 group-hover:opacity-100` hid delete from touch entirely
    // (AGENTS.md §9: hover-only actions need a touch equivalent).
    expect(row).not.toMatch(/opacity-0\s+group-hover:opacity-100/);
    expect(row).toContain('sm:opacity-0 sm:group-hover:opacity-100');
  });
});

/**
 * A CONTROLLED dialog whose only opener is a Radix `DialogTrigger` is dead if its
 * `onOpenChange` is `useDialogClose().handleOpenChange`.
 *
 * `handleOpenChange` is the close path by contract — its whole body is
 * `if (!nextOpen) requestClose()`. It deliberately ignores open requests. So
 * when a parent passes it to a controlled `<Dialog open={x}>` whose trigger is
 * the thing that has to set `x`, Radix calls `onOpenChange(true)`, the hook
 * swallows it, `x` never changes, and the dialog cannot be opened at all.
 *
 * This shipped: `pages/Workspaces.tsx` rendered
 * `<CreateWorkspaceDialog open={createOpen} onOpenChange={handleOpenChange} />`
 * with `createOpen` initialised to `false` and **no `setCreateOpen(true)` anywhere
 * in the file**. The visible "+ Create Workspace" button did nothing, and the
 * Network panel stayed empty on click because no request was ever made.
 * `CreateWorkspaceDialog` had already tried to defend itself —
 * `handleDialogOpenChange` calls `setDialogOpen(true)` on open, with a comment
 * saying handleOpenChange "swallows opens, which left this button dead" — but in
 * controlled mode `setDialogOpen` only forwards to `onOpenChange`, so the
 * defence routes straight back into the no-op.
 *
 * Two ways to be right: open it programmatically (which the fix does), or make
 * `onOpenChange` handle opens too. Never rely on a close-only sink to open.
 */
describe('controlled dialogs are not wired to a close-only onOpenChange', () => {
  /** Strip comments so prose quoting dead JSX is not scanned as code. */
  const code = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  // A repo-wide "close-only handler must be gated on its open state" rule was
  // written and measured, then deliberately NOT shipped. Resolving the close-only
  // names from the `useDialogClose` destructuring (rather than by regex, which
  // misreads the legitimate open+close wrapper `handleDialogOpenChange`) cut the
  // false positives from 33 to a set that is entirely correct code: dialogs like
  // `AppearanceModal` and `CreateTaskModal` are controlled by their PARENT, so
  // the `open` state is not in the same file and no in-file gate can be required.
  // The property is not statically decidable per file, so the assertions below
  // pin the actual regression instead of a rule that cannot hold.

  it('the Workspaces create button opens the shell creator instead of a dead controlled dialog', async () => {
    const src = code(await read('pages/Workspaces.tsx'));
    // It must not own a controlled creator...
    expect(src).not.toContain('open={createOpen}');
    expect(src).not.toMatch(/setCreateOpen\(true\)/);
    expect(src).not.toMatch(/useState\(false\)[^\n]*createOpen/);
    // ...and must open the one shell-level creator, the same path the sidebar uses.
    expect(src).toContain('useOpenCreateWorkspace()');
    expect(src).toContain('onClick={openCreateWorkspace}');
    // The button stays permission-gated: a create control the user cannot act
    // on must not render (AGENTS.md §7).
    expect(src).toContain("can('workspace.create')");
  });

  it('the creator is mounted exactly once, by the shell', async () => {
    const mounters: string[] = [];
    for (const rel of await tsxFiles('.')) {
      const src = code(await read(rel));
      // The definition itself is not a mount.
      if (/export function CreateWorkspaceDialog/.test(src)) continue;
      if (/<CreateWorkspaceDialog[\s>]/.test(src)) mounters.push(rel);
    }
    // A second mount is how the dead controlled instance came to exist in the
    // first place; two instances also mean two competing URL-param readers.
    expect(mounters).toEqual(['components/workspaces/GlobalCreateWorkspaceDialog.tsx']);
  });
});
