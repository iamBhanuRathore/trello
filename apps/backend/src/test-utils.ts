import { eq, inArray } from 'drizzle-orm';
import type { Database } from './db/index';
import * as schema from './db/schema/index';

/**
 * Test isolation helpers (scratch `boardly_test` DB is shared across suites).
 *
 * Two rules keep suites repeatable and parallel-safe:
 * 1. Every suite signs up with a UNIQUE email/slug per run (`Date.now` alone
 *    collides across parallel workers — the random suffix fixes that).
 * 2. Teardown goes through `deleteTestOrg`/`deleteTestUser` below. Hand-rolled
 *    chains died on the `roles.organization_id` restrict FK (and whole-table
 *    deletes of shared tables are hostile to other suites — scope by id).
 */

export function uniqueTestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueTestEmail(prefix: string): string {
  return `${uniqueTestId(prefix)}@example.com`;
}

export function uniqueTestSlug(prefix: string): string {
  return uniqueTestId(prefix);
}

/**
 * FK-safe org teardown, leaf → root. Must run AFTER suite leaf cleanup.
 *
 * `organizations` has 30 NO ACTION foreign keys pointing at it (verified by
 * querying information_schema, not assumed), plus a second tier of tables that
 * hang off those — `cards` owns assignees, labels, checklists and comments, none
 * of which carry an `organization_id` of their own. Every one of them has to be
 * gone before the org row is.
 *
 * The helper is the whole teardown chain: cards (+ every card-leaf table),
 * boards/lists/labels, projects/sprints/phases, workspaces, chat (channels,
 * messages with self-referential reply edges, attachments, reactions),
 * git repos/links, media attachments (card + chat), inbox/inbound rows,
 * automations, docs/forms, webhooks/integrations — then the signup-produced
 * rows the helper always covered. Suites no longer hand-roll delete chains;
 * chat-test-teardown.ts delegates here.
 *
 * Delete failures are deliberately not swallowed. A teardown that cannot finish
 * has to be loud, because the alternative is a suite that reports success while
 * leaking rows into the shared database forever.
 */
export async function deleteTestOrg(db: Database, orgId: string): Promise<void> {
  // Subquery roots — everything below scopes through these, never by bare delete.
  const orgCards = db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(eq(schema.cards.organizationId, orgId));
  const orgBoards = db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(eq(schema.boards.organizationId, orgId));
  const orgProjects = db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.organizationId, orgId));
  const orgWorkspaces = db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.organizationId, orgId));
  const orgChannels = db
    .select({ id: schema.chatChannels.id })
    .from(schema.chatChannels)
    .where(eq(schema.chatChannels.organizationId, orgId));
  const orgMessages = db
    .select({ id: schema.chatMessages.id })
    .from(schema.chatMessages)
    .where(inArray(schema.chatMessages.channelId, orgChannels));
  const orgChecklists = db
    .select({ id: schema.checklists.id })
    .from(schema.checklists)
    .where(inArray(schema.checklists.cardId, orgCards));
  const orgDocs = db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(eq(schema.documents.organizationId, orgId));
  const orgForms = db
    .select({ id: schema.intakeForms.id })
    .from(schema.intakeForms)
    .where(eq(schema.intakeForms.organizationId, orgId));
  const orgRules = db
    .select({ id: schema.projectAutomationRules.id })
    .from(schema.projectAutomationRules)
    .where(eq(schema.projectAutomationRules.organizationId, orgId));
  const orgTemplates = db
    .select({ id: schema.stageTemplates.id })
    .from(schema.stageTemplates)
    .where(eq(schema.stageTemplates.organizationId, orgId));

  // ─── Chat (self-referential messages: break reply edges first) ────────────
  await db.delete(schema.chatReactions).where(inArray(schema.chatReactions.messageId, orgMessages));
  await db
    .delete(schema.chatAttachments)
    .where(inArray(schema.chatAttachments.channelId, orgChannels));
  await db
    .update(schema.chatMessages)
    .set({ parentMessageId: null, replyToMessageId: null, forwardedFromId: null })
    .where(inArray(schema.chatMessages.channelId, orgChannels));
  await db.delete(schema.chatMessages).where(inArray(schema.chatMessages.channelId, orgChannels));
  await db
    .delete(schema.chatChannelMembers)
    .where(inArray(schema.chatChannelMembers.channelId, orgChannels));
  await db.delete(schema.chatChannels).where(eq(schema.chatChannels.organizationId, orgId));

  // ─── Card leaves (every table keyed by card, none carrying organization_id) ─
  await db.delete(schema.cardAssignees).where(inArray(schema.cardAssignees.cardId, orgCards));
  await db.delete(schema.cardParticipants).where(inArray(schema.cardParticipants.cardId, orgCards));
  await db.delete(schema.cardWatchers).where(inArray(schema.cardWatchers.cardId, orgCards));
  await db.delete(schema.cardLabels).where(inArray(schema.cardLabels.cardId, orgCards));
  await db.delete(schema.comments).where(inArray(schema.comments.cardId, orgCards));
  await db.delete(schema.attachments).where(inArray(schema.attachments.cardId, orgCards));
  await db.delete(schema.timeLogs).where(inArray(schema.timeLogs.cardId, orgCards));
  await db.delete(schema.cardSprints).where(inArray(schema.cardSprints.cardId, orgCards));
  await db.delete(schema.cardPhase).where(inArray(schema.cardPhase.cardId, orgCards));
  await db.delete(schema.cardViews).where(inArray(schema.cardViews.cardId, orgCards));
  await db
    .delete(schema.cardAccessRequests)
    .where(inArray(schema.cardAccessRequests.cardId, orgCards));
  await db.delete(schema.cardComponents).where(inArray(schema.cardComponents.cardId, orgCards));
  await db.delete(schema.cardEvents).where(inArray(schema.cardEvents.cardId, orgCards));
  await db
    .delete(schema.calendarEventLinks)
    .where(inArray(schema.calendarEventLinks.cardId, orgCards));
  await db.delete(schema.documentCards).where(inArray(schema.documentCards.cardId, orgCards));
  await db.delete(schema.formSubmissions).where(inArray(schema.formSubmissions.cardId, orgCards));
  await db.delete(schema.gitLinks).where(inArray(schema.gitLinks.cardId, orgCards));
  await db
    .delete(schema.automationRuleRuns)
    .where(inArray(schema.automationRuleRuns.cardId, orgCards));
  await db
    .delete(schema.checklistItems)
    .where(inArray(schema.checklistItems.checklistId, orgChecklists));
  await db.delete(schema.checklists).where(inArray(schema.checklists.cardId, orgCards));
  // Break the card self-reference (subtasks) before deleting any card.
  await db
    .update(schema.cards)
    .set({ parentCardId: null })
    .where(eq(schema.cards.organizationId, orgId));
  await db.delete(schema.cards).where(eq(schema.cards.organizationId, orgId));

  // ─── Boards / lists / labels ─────────────────────────────────────────────
  await db.delete(schema.automations).where(inArray(schema.automations.boardId, orgBoards));
  await db.delete(schema.boardMembers).where(inArray(schema.boardMembers.boardId, orgBoards));
  await db.delete(schema.labels).where(inArray(schema.labels.boardId, orgBoards));
  await db.delete(schema.lists).where(inArray(schema.lists.boardId, orgBoards));
  await db.delete(schema.intakeForms).where(inArray(schema.intakeForms.boardId, orgBoards));
  await db.delete(schema.components).where(inArray(schema.components.boardId, orgBoards));
  await db.delete(schema.assignmentRules).where(inArray(schema.assignmentRules.boardId, orgBoards));
  await db.delete(schema.installedApps).where(inArray(schema.installedApps.boardId, orgBoards));
  await db.delete(schema.boards).where(eq(schema.boards.organizationId, orgId));

  // ─── Docs / forms (parents follow their card leaves) ─────────────────────
  await db.delete(schema.documentCards).where(inArray(schema.documentCards.documentId, orgDocs));
  await db.delete(schema.documents).where(eq(schema.documents.organizationId, orgId));
  await db.delete(schema.formSubmissions).where(inArray(schema.formSubmissions.formId, orgForms));
  await db.delete(schema.intakeForms).where(eq(schema.intakeForms.organizationId, orgId));

  // ─── Projects (sprints/phases/rules first) ───────────────────────────────
  await db
    .delete(schema.cardSprints)
    .where(
      inArray(
        schema.cardSprints.sprintId,
        db
          .select({ sprintId: schema.sprints.id })
          .from(schema.sprints)
          .where(inArray(schema.sprints.projectId, orgProjects))
      )
    );
  await db.delete(schema.sprints).where(inArray(schema.sprints.projectId, orgProjects));
  await db
    .delete(schema.cardPhase)
    .where(
      inArray(
        schema.cardPhase.phaseId,
        db
          .select({ phaseId: schema.phases.id })
          .from(schema.phases)
          .where(inArray(schema.phases.projectId, orgProjects))
      )
    );
  await db.delete(schema.phases).where(inArray(schema.phases.projectId, orgProjects));
  await db
    .delete(schema.automationRuleCursors)
    .where(inArray(schema.automationRuleCursors.ruleId, orgRules));
  await db
    .delete(schema.automationRuleRuns)
    .where(inArray(schema.automationRuleRuns.ruleId, orgRules));
  await db
    .delete(schema.projectAutomationRules)
    .where(eq(schema.projectAutomationRules.organizationId, orgId));
  await db
    .delete(schema.projectMembers)
    .where(inArray(schema.projectMembers.projectId, orgProjects));
  await db.delete(schema.gitRepositories).where(eq(schema.gitRepositories.organizationId, orgId));
  await db
    .delete(schema.calendarConnections)
    .where(eq(schema.calendarConnections.organizationId, orgId));
  await db.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));

  // ─── Workspaces ──────────────────────────────────────────────────────────
  await db
    .delete(schema.workspaceMembers)
    .where(inArray(schema.workspaceMembers.workspaceId, orgWorkspaces));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));

  // ─── Stages (cards are gone, so stage references are free) ───────────────
  await db.delete(schema.stages).where(inArray(schema.stages.templateId, orgTemplates));
  await db.delete(schema.stageTemplates).where(eq(schema.stageTemplates.organizationId, orgId));

  // ─── Org-direct rows: inbox / inbound / integrations / misc ──────────────
  await db.delete(schema.inboundEmails).where(eq(schema.inboundEmails.organizationId, orgId));
  await db
    .delete(schema.inboundEmailTokens)
    .where(eq(schema.inboundEmailTokens.organizationId, orgId));
  await db.delete(schema.webhooks).where(eq(schema.webhooks.organizationId, orgId));
  await db.delete(schema.integrations).where(eq(schema.integrations.organizationId, orgId));
  await db.delete(schema.priorities).where(eq(schema.priorities.organizationId, orgId));
  await db.delete(schema.assignmentRules).where(eq(schema.assignmentRules.organizationId, orgId));
  await db.delete(schema.installedApps).where(eq(schema.installedApps.organizationId, orgId));
  await db.delete(schema.pushDevices).where(eq(schema.pushDevices.organizationId, orgId));

  const orgSubs = db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.organizationId, orgId));
  await db
    .delete(schema.seatChangeRequests)
    .where(inArray(schema.seatChangeRequests.subscriptionId, orgSubs));
  await db.delete(schema.guestSeats).where(eq(schema.guestSeats.organizationId, orgId));
  await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId));
  // sso_configurations.organization_id is NO ACTION (verified against
  // information_schema), so the org delete below trips on it. Three suites were
  // each hand-rolling this one statement because the helper could not be used
  // without it.
  await db
    .delete(schema.ssoConfigurations)
    .where(eq(schema.ssoConfigurations.organizationId, orgId));
  await db.delete(schema.ssoLoginStates).where(eq(schema.ssoLoginStates.organizationId, orgId));
  await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
  await db.delete(schema.activityLog).where(eq(schema.activityLog.organizationId, orgId));
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.organizationId, orgId));
  await db.delete(schema.billingEvents).where(eq(schema.billingEvents.organizationId, orgId));
  await db.delete(schema.invitations).where(eq(schema.invitations.organizationId, orgId));
  await db
    .delete(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.organizationId, orgId));
  await db.delete(schema.notifications).where(eq(schema.notifications.organizationId, orgId));
  await db
    .delete(schema.organizationRoleMembers)
    .where(eq(schema.organizationRoleMembers.organizationId, orgId));
  await db
    .delete(schema.rolePermissions)
    .where(
      inArray(
        schema.rolePermissions.roleId,
        db
          .select({ id: schema.roles.id })
          .from(schema.roles)
          .where(eq(schema.roles.organizationId, orgId))
      )
    );
  await db.delete(schema.roles).where(eq(schema.roles.organizationId, orgId));
  await db
    .delete(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}

/** FK-safe user teardown (tokens first — `refresh_tokens.user_id` restricts). */
export async function deleteTestUser(db: Database, email: string): Promise<void> {
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) return;
  await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, user.id));
  // User-scoped rows without an organization_id: `inbox_item_state` and
  // `notification_preferences` both restrict on user_id, so the user delete
  // below trips on them (inbox suite hit this). Scoped by user id — same rule
  // as the token delete above.
  await db.delete(schema.inboxItemState).where(eq(schema.inboxItemState.userId, user.id));
  await db
    .delete(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.userId, user.id));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
}

/**
 * Deletes refresh tokens for the named users only.
 *
 * Several suites reset token state with a bare `db.delete(refreshTokens)` and
 * no WHERE. `refresh_tokens` is shared, so that wiped every live token in
 * boardly_test — including other suites' — so an unrelated suite's mid-test
 * sign-in could fail with a 401 depending on file execution order. Use this, or
 * `deleteTestUser`, instead.
 */
export async function deleteTestUserTokens(db: Database, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  await db
    .delete(schema.refreshTokens)
    .where(
      inArray(
        schema.refreshTokens.userId,
        db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(inArray(schema.users.email, emails))
      )
    );
}
