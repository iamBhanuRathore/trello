import { describe, expect, it } from 'bun:test';
import { API_MODULES } from '@boardly/shared-types';
import {
  configuredModuleCount,
  emptyScopeDrafts,
  isScopeValid,
  serializeScopeDrafts,
  toggleModuleField,
  toggleModuleScope,
} from './scopeState';

describe('API key scope state', () => {
  it('starts with one unconfigured row per catalogue module', () => {
    const drafts = emptyScopeDrafts();
    expect(drafts).toHaveLength(API_MODULES.length);
    expect(drafts.every((draft) => !draft.read && !draft.write && draft.unlimited)).toBe(true);
    expect(configuredModuleCount(drafts)).toBe(0);
  });

  it('toggles read/write independently and serializes only configured modules', () => {
    let drafts = toggleModuleScope(emptyScopeDrafts(), 'cards', 'read', true);
    drafts = toggleModuleScope(drafts, 'boards', 'write', true);
    expect(configuredModuleCount(drafts)).toBe(2);

    const payload = serializeScopeDrafts(drafts);
    expect(payload).toEqual([
      { module: 'cards', read: true, write: false, fields: null, hitLimit: null },
      { module: 'boards', read: false, write: true, fields: null, hitLimit: null },
    ]);
    expect(isScopeValid(drafts)).toBe(true);
  });

  it('drops the quota when unlimited and keeps it when limited', () => {
    const drafts = emptyScopeDrafts().map((draft) =>
      draft.module === 'cards' ? { ...draft, read: true, unlimited: false, hitLimit: 250 } : draft
    );
    const [cards] = serializeScopeDrafts(drafts);
    expect(cards?.hitLimit).toBe(250);
  });

  it('collapses an all-fields selection to null and restricts subsets', () => {
    const cards = API_MODULES.find((m) => m.id === 'cards')!;
    let drafts = emptyScopeDrafts().map((draft) =>
      draft.module === 'cards' ? { ...draft, read: true } : draft
    );

    drafts = toggleModuleField(drafts, 'cards', 'title', false);
    let cardDraft = drafts.find((draft) => draft.module === 'cards')!;
    expect(cardDraft.fields).not.toBeNull();
    expect(cardDraft.fields).not.toContain('title');

    // Re-add the missing field; a full set must fall back to "all fields".
    const missing = cards.fields.find((field) => !(cardDraft.fields ?? []).includes(field.id))!;
    drafts = toggleModuleField(drafts, 'cards', missing.id, true);
    cardDraft = drafts.find((draft) => draft.module === 'cards')!;
    expect(cardDraft.fields).toBeNull();
  });
});
