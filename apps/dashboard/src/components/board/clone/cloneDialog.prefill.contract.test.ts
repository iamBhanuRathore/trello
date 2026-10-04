import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Clone dialog prefill/submit contract (static guard).
 *
 * The review step is only useful if the draft actually starts from the source
 * card: every editable field must seed from `card`, and every seeded field
 * must reach `POST /cards/:id/clone` on submit. A field that seeds but never
 * submits (or submits but never seeds) looks editable and silently does the
 * wrong thing. Checklist state is intentionally read-only — a summary line,
 * never an editable payload — so cloning keeps its deep-copy semantics.
 */

const dialogPath = join(import.meta.dir, 'CloneCardDialog.tsx');

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

describe('clone dialog prefill/submit', () => {
  it('seeds every editable field from the source card', async () => {
    const src = code(await readFile(dialogPath, 'utf-8'));

    // Title templates per mode; everything else copies the source verbatim.
    expect(src).toContain('`Subtask: ${card.title');
    expect(src).toContain('(Copy)');
    expect(src).toContain('setDescription(card.description ||');
    expect(src).toContain('setListId(card.listId ||');
    expect(src).toContain('setAssigneeId(card.assignee?.id ||');
    expect(src).toContain('setDueDate(toDateInput(card.dueDate))');
    expect(src).toContain('setPriorityId(card.priorityId ||');
    expect(src).toContain('setStageId(card.stageId ||');
    expect(src).toContain('setStoryPoints(card.storyPoints != null ? String(card.storyPoints)');
    expect(src).toContain('setLabelIds((card.labels || []).map');
  });

  it('submits every seeded field with null-clear semantics', async () => {
    const src = code(await readFile(dialogPath, 'utf-8'));

    // '' means "untouched/cleared" in the form; the endpoint treats null as
    // clear and undefined as fallback, so the dialog must send null — never
    // '' — for cleared fields.
    expect(src).toContain('description: description.trim()');
    expect(src).toContain('dueDate: dueDate ? new Date(dueDate).toISOString() : null');
    expect(src).toContain('priorityId: priorityId || null');
    expect(src).toContain('stageId: stageId || null');
    expect(src).toContain("storyPoints: storyPoints === '' ? null : Number(storyPoints)");
    expect(src).toContain('assigneeId: assigneeId || null');
    expect(src).toContain('labelIds,');
  });

  it('keeps checklists read-only and loads labels from the board endpoint', async () => {
    const src = code(await readFile(dialogPath, 'utf-8'));

    // Summary only: no checklist payload is ever built or sent.
    expect(src).toContain('checklistSummary');
    expect(src).toContain('reset to not done');
    expect(src).not.toContain('checklistTitle');
    expect(src).not.toContain('checklistItemsText');

    // Board-scoped labels live under /boards/:id/labels (same as the composer
    // and LabelPicker); a bare /labels path 404s and leaves the section empty.
    expect(src).toContain('/boards/${card?.boardId}/labels');
    expect(src).not.toContain('/labels?boardId=');
  });
});
