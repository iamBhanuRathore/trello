/**
 * Integration Hub catalog — the single source of truth shared by the backend
 * (validation, serialization, quota scoping) and the dashboard (scope matrix,
 * field pickers, inbound targets, outbound mapping editor).
 *
 * Keep this file dependency-free so both runtimes can import it directly.
 */

export type ApiModuleId = 'cards' | 'boards' | 'projects' | 'comments';

export type ApiFieldType = 'string' | 'text' | 'uuid' | 'number' | 'boolean' | 'date' | 'datetime';

export interface ApiModuleField {
  id: string;
  label: string;
  type: ApiFieldType;
  /** Never accepted on create/update. */
  readOnly: boolean;
  /** Must be present on create. */
  requiredOnCreate: boolean;
  /** Accepted as a query filter / mapping source. */
  filterable: boolean;
}

export interface ApiModuleDefinition {
  id: ApiModuleId;
  label: string;
  description: string;
  /** Route slug under /v1/public. */
  slug: string;
  fields: readonly ApiModuleField[];
}

const field = (
  id: string,
  label: string,
  type: ApiFieldType,
  options: Partial<Pick<ApiModuleField, 'readOnly' | 'requiredOnCreate' | 'filterable'>> = {}
): ApiModuleField => ({
  id,
  label,
  type,
  readOnly: options.readOnly ?? false,
  requiredOnCreate: options.requiredOnCreate ?? false,
  filterable: options.filterable ?? false,
});

export const API_MODULES: readonly ApiModuleDefinition[] = [
  {
    id: 'cards',
    label: 'Cards',
    description: 'Tasks with title, description, list placement and scheduling.',
    slug: 'cards',
    fields: [
      field('id', 'ID', 'uuid', { readOnly: true, filterable: true }),
      field('key', 'Key', 'string', { readOnly: true, filterable: true }),
      field('title', 'Title', 'string', { requiredOnCreate: true, filterable: true }),
      field('description', 'Description', 'text'),
      field('listId', 'List', 'uuid', { requiredOnCreate: true, filterable: true }),
      field('boardId', 'Board', 'uuid', { readOnly: true, filterable: true }),
      field('projectId', 'Project', 'uuid', { readOnly: true, filterable: true }),
      field('dueDate', 'Due date', 'datetime'),
      field('stageId', 'Stage', 'uuid'),
      field('priorityId', 'Priority', 'uuid'),
      field('storyPoints', 'Story points', 'number'),
      field('estimateMinutes', 'Estimate (minutes)', 'number'),
      field('isArchived', 'Archived', 'boolean', { readOnly: true, filterable: true }),
      field('createdAt', 'Created at', 'datetime', { readOnly: true, filterable: true }),
      field('updatedAt', 'Updated at', 'datetime', { readOnly: true, filterable: true }),
    ],
  },
  {
    id: 'boards',
    label: 'Boards',
    description: 'Kanban boards belonging to a project.',
    slug: 'boards',
    fields: [
      field('id', 'ID', 'uuid', { readOnly: true, filterable: true }),
      field('name', 'Name', 'string', { requiredOnCreate: true, filterable: true }),
      field('projectId', 'Project', 'uuid', { requiredOnCreate: true, filterable: true }),
      field('background', 'Background', 'string'),
      field('isArchived', 'Archived', 'boolean', { readOnly: true, filterable: true }),
      field('isTemplate', 'Template', 'boolean', { readOnly: true }),
      field('createdAt', 'Created at', 'datetime', { readOnly: true, filterable: true }),
      field('updatedAt', 'Updated at', 'datetime', { readOnly: true, filterable: true }),
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Delivery projects inside a workspace.',
    slug: 'projects',
    fields: [
      field('id', 'ID', 'uuid', { readOnly: true, filterable: true }),
      field('name', 'Name', 'string', { requiredOnCreate: true, filterable: true }),
      field('key', 'Key', 'string', { filterable: true }),
      field('description', 'Description', 'text'),
      field('status', 'Status', 'string', { filterable: true }),
      field('workspaceId', 'Workspace', 'uuid', { requiredOnCreate: true, filterable: true }),
      field('startDate', 'Start date', 'date'),
      field('endDate', 'End date', 'date'),
      field('isArchived', 'Archived', 'boolean', { readOnly: true, filterable: true }),
      field('createdAt', 'Created at', 'datetime', { readOnly: true, filterable: true }),
      field('updatedAt', 'Updated at', 'datetime', { readOnly: true, filterable: true }),
    ],
  },
  {
    id: 'comments',
    label: 'Comments',
    description: 'Comments posted on a card.',
    slug: 'comments',
    fields: [
      field('id', 'ID', 'uuid', { readOnly: true, filterable: true }),
      field('cardId', 'Card', 'uuid', { requiredOnCreate: true, filterable: true }),
      field('userId', 'Author', 'uuid', { readOnly: true, filterable: true }),
      field('body', 'Body', 'text', { requiredOnCreate: true }),
      field('isEdited', 'Edited', 'boolean', { readOnly: true }),
      field('createdAt', 'Created at', 'datetime', { readOnly: true, filterable: true }),
      field('updatedAt', 'Updated at', 'datetime', { readOnly: true, filterable: true }),
    ],
  },
] as const;

export const API_MODULE_IDS: readonly ApiModuleId[] = API_MODULES.map((m) => m.id);

export function getApiModule(id: string): ApiModuleDefinition | undefined {
  return API_MODULES.find((m) => m.id === id);
}

export function getApiModuleFields(id: string): readonly ApiModuleField[] {
  return getApiModule(id)?.fields ?? [];
}

export function isApiModuleId(id: string): id is ApiModuleId {
  return API_MODULES.some((m) => m.id === id);
}

/**
 * Resolve the fields a key may read/write. `null`/empty means "all fields the
 * module exposes" (minus read-only fields on write, always).
 */
export function resolveAllowedFields(
  moduleId: string,
  selected: readonly string[] | null | undefined,
  mode: 'read' | 'write'
): string[] {
  const fields = getApiModuleFields(moduleId);
  const writable = mode === 'write' ? fields.filter((f) => !f.readOnly) : fields;
  if (!selected || selected.length === 0) return writable.map((f) => f.id);
  return writable.filter((f) => selected.includes(f.id)).map((f) => f.id);
}

export interface OutboundTrigger {
  id: string;
  label: string;
  /** Offers the "moved to list/stage" filter in the editor. */
  supportsMoveFilter?: boolean;
}

export const OUTBOUND_TRIGGERS: Record<ApiModuleId, readonly OutboundTrigger[]> = {
  cards: [
    { id: 'card.created', label: 'Card created' },
    { id: 'card.updated', label: 'Card updated' },
    { id: 'card.moved', label: 'Card moved', supportsMoveFilter: true },
    { id: 'card.archived', label: 'Card archived' },
    { id: 'card.commented', label: 'Card commented' },
    { id: 'card.assigned', label: 'Card assigned' },
    { id: 'card.labeled', label: 'Card labeled' },
  ],
  boards: [
    { id: 'board.created', label: 'Board created' },
    { id: 'board.updated', label: 'Board updated' },
  ],
  projects: [
    { id: 'project.created', label: 'Project created' },
    { id: 'project.updated', label: 'Project updated' },
  ],
  comments: [{ id: 'card.commented', label: 'Comment created' }],
};

export function getOutboundTriggers(moduleId: string): readonly OutboundTrigger[] {
  return isApiModuleId(moduleId) ? OUTBOUND_TRIGGERS[moduleId] : [];
}

export const FIELD_MAPPING_MODES = [
  { id: 'crm_field', label: 'CRM Field' },
  { id: 'static', label: 'Static Value' },
  { id: 'auth_token', label: 'Auth Token' },
] as const;

export type FieldMappingMode = (typeof FIELD_MAPPING_MODES)[number]['id'];

export const DATE_FORMATS = [
  { id: 'iso8601', label: 'ISO 8601', pattern: null },
  { id: 'date', label: 'Date only (YYYY-MM-DD)', pattern: 'date' },
  { id: 'unix_seconds', label: 'Unix seconds', pattern: 'seconds' },
  { id: 'unix_millis', label: 'Unix milliseconds', pattern: 'millis' },
] as const;

export type DateFormatId = (typeof DATE_FORMATS)[number]['id'];

export const AUTH_PLACEHOLDERS = ['{{auth_token}}', '{{auth_token_2}}'] as const;
export type AuthPlaceholder = (typeof AUTH_PLACEHOLDERS)[number];

/** Canonical scope chip, e.g. `cards:read`. */
export function scopeChip(moduleId: string, action: 'read' | 'write'): string {
  return `${moduleId}:${action}`;
}

/** Flat list of scope chips for a set of module permissions. */
export function scopeChips(
  scopes: ReadonlyArray<{ module: string; read: boolean; write: boolean }>
): string[] {
  return scopes.flatMap((s) => [
    ...(s.read ? [scopeChip(s.module, 'read')] : []),
    ...(s.write ? [scopeChip(s.module, 'write')] : []),
  ]);
}

export function countConfiguredModules(
  scopes: ReadonlyArray<{ module: string; read: boolean; write: boolean }>
): number {
  return new Set(scopes.filter((s) => s.read || s.write).map((s) => s.module)).size;
}

/**
 * Flatten a pasted JSON schema into mapping target paths.
 * `{ items: [{ rate: 1 }] }` → `items[].rate`
 */
export function flattenJsonSchema(input: unknown, prefix = ''): string[] {
  if (Array.isArray(input)) {
    const base = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;
    if (input.length === 0) return base ? [`${base}[]`] : [];
    const first = input[0];
    // Array of objects: descend into the first item and suffix the segment
    // with `[]` so paths read `items[].rate`.
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return flattenJsonSchema(first, `${base}[].`);
    }
    return base ? [`${base}[]`] : [];
  }
  if (!input || typeof input !== 'object') return prefix ? [prefix] : [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const path = `${prefix}${key}`;
    if (Array.isArray(value)) {
      paths.push(...flattenJsonSchema(value, path));
    } else if (value && typeof value === 'object') {
      paths.push(...flattenJsonSchema(value, `${path}.`));
    } else {
      paths.push(path);
    }
  }
  return paths;
}
