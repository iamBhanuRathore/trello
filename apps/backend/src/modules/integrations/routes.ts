import { Elysia, t } from 'elysia';
import { integrationsService } from './service';
import { authPlugin, requirePermission } from '../../middleware/auth';

export const integrationsRoutes = new Elysia({ prefix: '/integrations' })
  .use(authPlugin)
  .guard({ beforeHandle: requirePermission('integration.manage') }, (app) =>
    app
      // List integrations
      .get(
        '/',
        async ({ user }) => {
          const integrations = await integrationsService.listIntegrations(user!.organizationId!);
          return integrations;
        },
        {
          detail: {
            tags: ['Integrations'],
            summary: 'List integrations for the organization',
          }
        }
      )

      // Connect integration
      .post(
        '/connect',
        async ({ user, body }) => {
          const result = await integrationsService.connectIntegration(
            user!.organizationId!,
            body.provider
          );
          return { success: true, integration: result };
        },
        {
          body: t.Object({
            provider: t.Union([
              t.Literal('slack'),
              t.Literal('github'),
              t.Literal('google_drive')
            ])
          }),
          detail: {
            tags: ['Integrations'],
            summary: 'Mock connect an integration',
          }
        }
      )

      // Disconnect integration
      .delete(
        '/:id',
        async ({ user, params }) => {
          await integrationsService.disconnectIntegration(user!.organizationId!, params.id);
          return { success: true };
        },
        {
          params: t.Object({
            id: t.String({ format: 'uuid' })
          }),
          detail: {
            tags: ['Integrations'],
            summary: 'Disconnect an integration',
          }
        }
      )
  );
