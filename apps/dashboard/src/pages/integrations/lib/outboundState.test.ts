import { describe, expect, it } from 'bun:test';
import {
  draftFromIntegration,
  emptyOutboundDraft,
  parseHeaders,
  serializeOutboundDraft,
  setSourceModule,
  toggleTrigger,
  validateOutboundDraft,
} from './outboundState';

describe('Outbound form state', () => {
  it('requires a name, a trigger and a data URL', () => {
    const draft = emptyOutboundDraft();
    expect(validateOutboundDraft(draft)).toBe('Give the integration a name');

    draft.name = 'Sync';
    expect(validateOutboundDraft(draft)).toBe('Data call URL is required');

    draft.dataConfig.url = 'not-a-url';
    expect(validateOutboundDraft(draft)).toBe('Data call URL must be a valid URL');

    draft.dataConfig.url = 'https://example.com/hook';
    expect(validateOutboundDraft(draft)).toBeNull();

    draft.triggerEvents = [];
    expect(validateOutboundDraft(draft)).toBe('Select at least one trigger event');
  });

  it('requires auth URL and token path when auth is enabled', () => {
    const draft = emptyOutboundDraft();
    draft.name = 'Sync';
    draft.dataConfig.url = 'https://example.com/hook';
    draft.authEnabled = true;
    expect(validateOutboundDraft(draft)).toBe('Auth call URL is required');
    draft.authConfig.url = 'https://example.com/auth';
    expect(validateOutboundDraft(draft)).toBe('Token path is required');
    draft.authConfig.tokenPath = 'data.access_token';
    expect(validateOutboundDraft(draft)).toBeNull();
  });

  it('flags mapping rows without a target or CRM source', () => {
    const draft = emptyOutboundDraft();
    draft.name = 'Sync';
    draft.dataConfig.url = 'https://example.com/hook';
    draft.fieldMappings = [
      {
        targetPath: '',
        mode: 'crm_field',
        source: '',
        value: '',
        token: '',
        dateFormat: 'iso8601',
      },
    ];
    expect(validateOutboundDraft(draft)).toContain('empty mapping');
    draft.fieldMappings[0]!.targetPath = 'name';
    expect(validateOutboundDraft(draft)).toContain('Pick a CRM field');
    draft.fieldMappings[0]!.source = 'title';
    expect(validateOutboundDraft(draft)).toBeNull();
  });

  it('resets triggers when the source module changes', () => {
    const cards = emptyOutboundDraft();
    const boards = setSourceModule(cards, 'boards');
    expect(boards.triggerEvents).toEqual(['board.created']);
    expect(boards.triggerFilter).toEqual({});
    const projects = setSourceModule(boards, 'projects');
    expect(projects.triggerEvents).toEqual(['project.created']);
  });

  it('toggles triggers without duplicates', () => {
    let draft = emptyOutboundDraft();
    draft = toggleTrigger(draft, 'card.moved', true);
    draft = toggleTrigger(draft, 'card.moved', true);
    expect(draft.triggerEvents).toEqual(['card.created', 'card.moved']);
    draft = toggleTrigger(draft, 'card.created', false);
    expect(draft.triggerEvents).toEqual(['card.moved']);
  });

  it('parses headers and serializes secrets out of empty sections', () => {
    expect(parseHeaders('authorization: Bearer x\n\ncontent-type: application/json')).toEqual({
      authorization: 'Bearer x',
      'content-type': 'application/json',
    });
    expect(parseHeaders('')).toBeUndefined();

    const draft = emptyOutboundDraft();
    draft.name = '  Sync  ';
    draft.dataConfig = {
      url: 'https://example.com/hook',
      method: 'PATCH',
      headers: 'x-api-key: {{auth_token}}',
      bodyTemplate: '',
    };
    draft.fieldMappings = [
      {
        targetPath: 'name',
        mode: 'crm_field',
        source: 'title',
        value: '',
        token: '',
        dateFormat: 'iso8601',
      },
      {
        targetPath: 'stage',
        mode: 'static',
        source: '',
        value: 'new',
        token: '',
        dateFormat: 'iso8601',
      },
      {
        targetPath: 'created',
        mode: 'crm_field',
        source: 'createdAt',
        value: '',
        token: '',
        dateFormat: 'date',
      },
    ];

    const payload = serializeOutboundDraft(draft) as Record<string, unknown>;
    expect(payload.name).toBe('Sync');
    expect(payload.triggerFilter).toBeNull();
    expect(payload.authConfig).toBeNull();
    expect(payload.successCheck).toBeNull();
    expect(payload.dataConfig).toEqual({
      url: 'https://example.com/hook',
      method: 'PATCH',
      headers: { 'x-api-key': '{{auth_token}}' },
    });
    expect(payload.fieldMappings).toEqual([
      { targetPath: 'name', mode: 'crm_field', source: 'title' },
      { targetPath: 'stage', mode: 'static', value: 'new' },
      {
        targetPath: 'created',
        mode: 'crm_field',
        source: 'createdAt',
        dateFormat: 'date',
      },
    ]);
  });

  it('hydrates an integration back into an editable draft', () => {
    const draft = draftFromIntegration({
      name: 'Attio sync',
      sourceModule: 'cards',
      triggerEvents: ['card.created'],
      triggerFilter: { listId: 'l1' },
      authEnabled: true,
      authConfig: {
        url: 'https://api.example.com/auth',
        method: 'GET',
        headers: { 'x-id': 'abc' },
        tokenPath: 'token',
        ttlSeconds: 60,
      },
      dataConfig: { url: 'https://api.example.com/data', method: 'PUT', headers: {} },
      fieldMappings: [{ targetPath: 'name', mode: 'crm_field', source: 'title' }],
      successCheck: null,
      isActive: false,
    });

    expect(draft.authConfig.method).toBe('GET');
    expect(draft.authConfig.headers).toBe('x-id: abc');
    expect(draft.dataConfig.method).toBe('PUT');
    expect(draft.fieldMappings[0]!.source).toBe('title');
    expect(draft.triggerFilter).toEqual({ listId: 'l1' });
    expect(draft.isActive).toBe(false);
  });
});
