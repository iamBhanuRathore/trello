/**
 * Master Cards Service Facade
 *
 * Decomposed into modular domain submodules under `apps/backend/src/modules/cards/`:
 * - `card-helpers.ts`: Shared tenancy verifications, UUID validation, and cache-bumping logic.
 * - `card-labels.ts`: Board-level and card-level label assignments.
 * - `card-members.ts`: Assignees, participants, watchers, and presence viewers.
 * - `card-activity.ts`: Comments, mentions, and file attachments.
 * - `card-checklists.ts`: Checklists, bulk items, and status toggles.
 * - `card-movement.ts`: Column transitions, optimistic concurrency versions, and list rebalancing.
 * - `card-mytasks.ts`: Cross-project personal task aggregator and badges.
 * - `card-clone.ts`: Deep copying tasks with checklists, labels, and subtask trees.
 * - `card-crud.ts`: Core card queries, filters, subtask queries, and lifecycle management.
 */

export * from './card-helpers';
export * from './card-labels';
export * from './card-members';
export * from './card-activity';
export * from './card-checklists';
export * from './card-movement';
export * from './card-mytasks';
export * from './card-clone';
export * from './card-crud';
