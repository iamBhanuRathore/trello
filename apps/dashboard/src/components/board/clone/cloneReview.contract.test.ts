import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Review-before-clone contract (static guard).
 *
 * "Clone Task" and "Clone & Create Subtask" used to call `cloneCardMutation.mutate`
 * straight from the overflow menu. The title was templated in the handler
 * (`"${title} (Copy)"`) and persisted on click, so the caller never got a moment
 * to correct a title, list, assignee or due date — the clone was already committed
 * before anything could be reviewed.
 *
 * These assertions pin the two properties that matter:
 *  1. no path clones on click — every clone route goes through the review dialog;
 *  2. the dialog submits to `/clone`, so the review step did not quietly downgrade
 *     a clone into a plain `POST /cards` and lose checklists/cover/position.
 */

const BOARD = join(import.meta.dir, '..');
const dialogPath = join(BOARD, 'clone/CloneCardDialog.tsx');
const detailPath = join(BOARD, 'TaskDetailView.tsx');

/** Source with comment lines removed, so prose cannot satisfy an assertion. */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('clone review contract', () => {
  it('no longer clones on click — the immediate mutation is gone', async () => {
    const src = code(await readFile(detailPath, 'utf-8'));

    // The mutation that fired from the menu is deleted outright. Leaving it
    // declared-but-unused would be a trap for the next person to wire it up.
    expect(src).not.toContain('cloneCardMutation');
    expect(src).not.toContain('Task cloned successfully');
    expect(src).not.toContain(`(Copy)\``);

    // Both menu entry points now only open the review dialog.
    expect(src).toContain("setCloneMode('clone')");
    expect(src).toContain("setCloneMode('subtask')");
    expect(src).toContain('<CloneCardDialog');
  });

  it('submits to the clone endpoint so clone semantics survive the review step', async () => {
    const src = code(await readFile(dialogPath, 'utf-8'));

    expect(src).toContain('/clone`');
    // A plain POST /cards would keep the form but drop checklists, cover image
    // and list-position handling — a silent downgrade of what "Clone" means.
    expect(src).not.toContain("api.post('/cards'");

    // Every field the dialog lets the user edit must actually reach the endpoint,
    // or the edit would look successful and change nothing.
    for (const field of [
      'title:',
      'description:',
      'listId,',
      'dueDate:',
      'priorityId:',
      'stageId:',
      'storyPoints:',
      'assigneeId:',
      'labelIds,',
    ]) {
      expect(src).toContain(field);
    }
  });

  it('re-seeds the draft from the source card on every open', async () => {
    const src = code(await readFile(dialogPath, 'utf-8'));

    // Without this, a second clone inherits the first one's edits — the dialog
    // would open pre-modified from a stale previous session.
    expect(src).toMatch(/useEffect\(\(\) => \{[\s\S]*?\}, \[open, card, isSubtask\]\)/);
    // Labels are multi-valued, so they need an explicit reset, not an assignment.
    expect(src).toContain('setLabelIds((card.labels || []).map');

    // Subtask mode parents the clone; plain clone must not send a parent.
    expect(src).toContain('parentCardId: isSubtask ? parentCardId : undefined');
    // `null` clears a field, which is distinct from omitting it (the endpoint
    // falls back per field). Sending '' for these would be a silent no-op.
    expect(src).toContain('dueDate: dueDate ? new Date(dueDate).toISOString() : null');
  });

  it('labels the confirm button so it is clear nothing is saved until then', async () => {
    const src = await readFile(dialogPath, 'utf-8');
    // The user's whole complaint was not knowing a save had already happened.
    expect(src).toContain('Nothing is saved until you click');
    expect(src).toMatch(/isSubtask\s*\?\s*'Create Subtask'\s*:\s*'Clone Task'/);
  });
});
