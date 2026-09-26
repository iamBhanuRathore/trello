import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import {
  connectRepository,
  listRepositories,
  disconnectRepository,
  listCardLinks,
  findRepositoriesForWebhook,
  handleGitHubWebhook,
  verifySignature,
  branchNameFor,
  type GitHubWebhookPayload,
} from './service';
import { decryptToken } from '../calendar/google';
import { getCard } from '../cards/service';

async function openSecret(sealed: string): Promise<string> {
  if (sealed.startsWith('enc:')) return decryptToken(sealed.slice(4));
  if (sealed.startsWith('plain:')) return sealed.slice(6);
  return sealed;
}

export const gitRoutes = new Elysia({ prefix: '/git', tags: ['Git'] })
  .use(authPlugin)
  .guard({ beforeHandle: requirePermission('integration.manage') }, (app) =>
    app
      // GET /v1/git/repos - Linked repositories
      .get('/repos', async ({ user, set }) => {
        try {
          return await listRepositories(db, user.organizationId);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })

      // POST /v1/git/repos - Connect a repository (returns webhook secret once)
      .post(
        '/repos',
        async ({ body, user, set }) => {
          try {
            return await connectRepository(db, user.organizationId, body);
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        {
          body: t.Object({
            owner: t.String(),
            repo: t.String(),
            projectId: t.Optional(t.String()),
            webhookSecret: t.Optional(t.String()),
          }),
        }
      )

      // DELETE /v1/git/repos/:id - Disconnect repository (+ links)
      .delete(
        '/repos/:id',
        async ({ params: { id }, user, set }) => {
          try {
            return await disconnectRepository(db, user.organizationId, id);
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        { params: t.Object({ id: t.String() }) }
      )

      // GET /v1/git/cards/:id/links - PRs/branches/commits for a card
      .get(
        '/cards/:id/links',
        async ({ params: { id }, user, set }) => {
          try {
            return await listCardLinks(db, user.organizationId, id);
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        { params: t.Object({ id: t.String() }) }
      )

      // GET /v1/git/cards/:id/branch - Suggested branch name (copy helper)
      .get(
        '/cards/:id/branch',
        async ({ params: { id }, user, set }) => {
          try {
            const card = await getCard(db, id, user.organizationId);
            return { branch: branchNameFor(card.key || `task-${id.slice(0, 8)}`, card.title) };
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        { params: t.Object({ id: t.String() }) }
      )
  );

/**
 * Public GitHub webhook receiver. GitHub signs with HMAC-SHA256
 * (X-Hub-Signature-256) — that signature IS the auth, so this stays
 * outside authPlugin (see PUBLIC_PATH_PREFIXES) and reads the raw body.
 */
export const gitWebhookRoutes = new Elysia({ prefix: '/git', tags: ['Git'] }).post(
  '/webhooks/github',
  async ({ headers, body, set }) => {
    try {
      const raw = typeof body === 'string' ? body : JSON.stringify(body);
      let payload: GitHubWebhookPayload;
      try {
        payload = (typeof body === 'string' ? JSON.parse(body) : body) as GitHubWebhookPayload;
      } catch {
        set.status = 400;
        return { error: 'Invalid JSON payload' };
      }
      const fullName: string = payload?.repository?.full_name || '';
      const [owner, repo] = fullName.split('/');
      const candidates = owner && repo ? await findRepositoriesForWebhook(db, owner, repo) : [];
      if (candidates.length === 0) {
        set.status = 404;
        return { error: 'No linked repository for ' + (fullName || 'unknown') };
      }
      const signature =
        (headers as Record<string, string | undefined>)['x-hub-signature-256'] ||
        (headers as Record<string, string | undefined>)['X-Hub-Signature-256'] ||
        null;
      // The same repo may be linked by multiple orgs with different secrets —
      // accept if ANY candidate secret verifies.
      let verified = false;
      for (const candidate of candidates) {
        const secret = await openSecret(candidate.webhookSecret);
        if (verifySignature(secret, raw, signature)) {
          verified = true;
          break;
        }
      }
      if (!verified) {
        set.status = 401;
        return { error: 'Invalid webhook signature' };
      }
      const event =
        (headers as Record<string, string | undefined>)['x-github-event'] ||
        (headers as Record<string, string | undefined>)['X-GitHub-Event'] ||
        'unknown';
      const delivery =
        (headers as Record<string, string | undefined>)['x-github-delivery'] ||
        (headers as Record<string, string | undefined>)['X-GitHub-Delivery'] ||
        'n/a';
      return await handleGitHubWebhook(db, event, delivery, payload);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  },
  {
    query: t.Object({ repoId: t.Optional(t.String()) }),
    // Parse as text so the HMAC runs over the exact raw bytes GitHub signed.
    // NOTE: Elysia's body-parsing hook is `parse`, not `type` — `type: 'text'`
    // was silently ignored, the JSON parser re-serialized the body, and any
    // payload whose whitespace differed from JS JSON.stringify failed HMAC.
    parse: 'text',
  }
);
