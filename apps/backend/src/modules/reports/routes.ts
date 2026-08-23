import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import {
  getProjectSummaryReport,
  getSprintBurndown,
  getProjectVelocity,
  getBoardSummaryReport,
  getCumulativeFlowDiagram,
  getLeadAndCycleTime,
  getWorkspacePortfolioHealth,
} from './service';

export const reportsRoutes = new Elysia({ prefix: '/reports' })
  .use(authPlugin)

  .get(
    '/projects/:projectId/summary',
    async ({ params: { projectId }, user }) => {
      return getProjectSummaryReport(db, projectId, user.organizationId);
    },
    {
      params: t.Object({ projectId: t.String() }),
    }
  )

  .get(
    '/projects/:projectId/velocity',
    async ({ params: { projectId }, user }) => {
      return getProjectVelocity(db, projectId, user.organizationId);
    },
    {
      params: t.Object({ projectId: t.String() }),
    }
  )

  .get(
    '/projects/:projectId/cfd',
    async ({ params: { projectId }, query, user }) => {
      const days = query?.days ? Number(query.days) : 14;
      return getCumulativeFlowDiagram(db, projectId, user.organizationId, days);
    },
    {
      params: t.Object({ projectId: t.String() }),
      query: t.Optional(t.Object({ days: t.Optional(t.String()) })),
    }
  )

  .get(
    '/projects/:projectId/cycle-time',
    async ({ params: { projectId }, user }) => {
      return getLeadAndCycleTime(db, projectId, user.organizationId);
    },
    {
      params: t.Object({ projectId: t.String() }),
    }
  )

  .get(
    '/workspaces/:workspaceId/portfolio',
    async ({ params: { workspaceId }, user }) => {
      return getWorkspacePortfolioHealth(db, workspaceId, user.organizationId);
    },
    {
      params: t.Object({ workspaceId: t.String() }),
    }
  )

  .get(
    '/sprints/:sprintId/burndown',
    async ({ params: { sprintId }, user }) => {
      return getSprintBurndown(db, sprintId, user.organizationId);
    },
    {
      params: t.Object({ sprintId: t.String() }),
    }
  )

  .get(
    '/boards/:boardId/summary',
    async ({ params: { boardId }, user }) => {
      return getBoardSummaryReport(db, boardId, user.organizationId);
    },
    {
      params: t.Object({ boardId: t.String() }),
    }
  );
