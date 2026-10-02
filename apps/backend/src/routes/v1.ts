import { Elysia } from 'elysia';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { authRoutes } from '../modules/auth/routes';
import { orgRoutes, inviteRoutes } from '../modules/organizations/routes';
import { workspaceRoutes } from '../modules/workspaces/routes';
import { projectRoutes } from '../modules/projects/routes';
import { boardRoutes } from '../modules/boards/routes';
import { listRoutes } from '../modules/lists/routes';
import { cardRoutes, cardPublicRoutes } from '../modules/cards/routes';
import { realtimeRoutes } from '../modules/realtime/routes';
import { notificationRoutes } from '../modules/notifications/routes';
import { superadminRoutes } from '../modules/superadmin/routes';
import { stageRoutes } from '../modules/stages/routes';
import { sprintRoutes } from '../modules/sprints/routes';
import { phaseRoutes } from '../modules/phases/routes';
import { searchRoutes } from '../modules/search/routes';
import { webhookRoutes } from '../modules/webhooks/routes';
import { automationRoutes } from '../modules/automations/routes';
import {
  projectAutomationRoutes,
  projectAutomationContextRoutes,
} from '../modules/automations/project-routes';
import { integrationsRoutes } from '../modules/integrations/routes';
import { reportsRoutes } from '../modules/reports/routes';
import { timeTrackingRoutes } from '../modules/timetracking/routes';
import { importerRoutes } from '../modules/importers/routes';
import { roleRoutes } from '../modules/roles/routes';
import { componentRoutes } from '../modules/components/routes';
import { priorityRoutes } from '../modules/priorities/routes';
import { auditRoutes } from '../modules/audit/routes';
import { docRoutes } from '../modules/docs/routes';
import { formRoutes } from '../modules/forms/routes';
import { ssoRoutes } from '../modules/sso/routes';
import { developerRoutes } from '../modules/developer/routes';
import { trashRoutes } from '../modules/trash/routes';
import { billingRoutes } from '../modules/billing/routes';
import { chatRoutes } from '../modules/chat/routes';
import { mediaRoutes } from '../modules/media/routes';
import { presenceRoutes } from '../modules/presence/routes';
import { calendarRoutes, calendarCallbackRoutes } from '../modules/calendar/routes';
import { gitRoutes, gitWebhookRoutes } from '../modules/git/routes';
import { inboxRoutes } from '../modules/inbox/routes';
import { inboundEmailRoutes, inboundTokenRoutes } from '../modules/inbound/routes';

/**
 * Aggregated /v1 domain routes.
 * Grouped logically into cohesive operational domains.
 */
export const v1Routes = new Elysia()
  // Global v1 Rate Limiter
  .use(rateLimiterMiddleware())

  // ── Auth, Identity & RBAC ──
  .use(authRoutes)
  .use(inviteRoutes)
  .use(ssoRoutes)
  .use(roleRoutes)

  // ── Organizations, Workspaces & Projects ──
  .use(orgRoutes)
  .use(workspaceRoutes)
  .use(projectRoutes)

  // ── Boards, Columns & Cards ──
  .use(boardRoutes)
  .use(listRoutes)
  .use(cardPublicRoutes)
  .use(cardRoutes)
  .use(stageRoutes)
  .use(sprintRoutes)
  .use(phaseRoutes)
  .use(componentRoutes)
  .use(priorityRoutes)

  // ── Realtime, Presence & Communication ──
  .use(realtimeRoutes)
  .use(presenceRoutes)
  .use(chatRoutes)
  .use(notificationRoutes)
  .use(inboxRoutes)

  // ── Automations, Webhooks & Integrations ──
  .use(webhookRoutes)
  .use(automationRoutes)
  .use(projectAutomationRoutes)
  .use(projectAutomationContextRoutes)
  .use(integrationsRoutes)
  .use(gitRoutes)
  .use(gitWebhookRoutes)
  .use(calendarRoutes)
  .use(calendarCallbackRoutes)
  .use(inboundEmailRoutes)
  .use(inboundTokenRoutes)

  // ── Documents, Forms, Media & Search ──
  .use(docRoutes)
  .use(formRoutes)
  .use(mediaRoutes)
  .use(searchRoutes)
  .use(importerRoutes)

  // ── Operations, Governance & Platform ──
  .use(timeTrackingRoutes)
  .use(reportsRoutes)
  .use(auditRoutes)
  .use(billingRoutes)
  .use(developerRoutes)
  .use(trashRoutes)
  .use(superadminRoutes);
