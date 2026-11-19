/**
 * Integration Hub demo data — one working example per hub tab.
 *
 * Seeding only the foundation (plans/roles) leaves `/admin/integrations` as five
 * empty tables, so a new user cannot tell what a good scope matrix, mapping or
 * trigger looks like. This module seeds a small, clearly-labelled example set
 * into the Acme demo organization:
 *
 *   Apps       connected Slack app (the existing provider grid is a mock)
 *   API Keys   cards/comments read+write, boards/projects read, per-module quotas
 *   Inbound    card-intake and comment-intake URLs with real working tokens
 *   Outbound   a complete CRM mapping (inactive: example.com cannot accept posts)
 *   Webhooks   a complete signed subscription (disabled for the same reason)
 *
 * Idempotent by name/label/URL. Dev-only: production requires the same explicit
 * BOARDLY_SEED_PRODUCTION=1 override as the rest of the demo organization.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString =
  process.env['DATABASE_URL'] || 'postgres://boardly:boardly_dev@localhost:5432/boardly';

const DEMO_ORG_SLUG = 'acme-corp';
const DEMO_OWNER_EMAIL = 'alex.vance@acme.corp';

const API_KEY_NAME = 'Demo · Website & docs sync';
const INBOUND_CARD_LABEL = 'Demo · Website form → new card';
const INBOUND_COMMENT_LABEL = 'Demo · Client feedback → card comment';
const OUTBOUND_NAME = 'Demo · New cards to your CRM (inactive)';
const WEBHOOK_URL = 'https://example.com/webhooks/boardly-demo';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

function publicUrl(token: string): string {
  const base = (process.env['API_URL'] || 'http://localhost:3001').replace(/\/$/, '');
  return `${base}/v1/public/inbound/${token}`;
}

type SecretBox = typeof import('../lib/secret-box');

/**
 * `lib/secret-box` pulls in `lib/env`, which fails fast when the auth secrets
 * are missing. The base seed only needs DATABASE_URL, so load the box lazily and
 * skip the sealed examples (with a clear message) instead of crashing a seed.
 */
async function loadSecretBox(): Promise<SecretBox | null> {
  if (
    !process.env['INTEGRATION_SECRET_KEY'] &&
    !process.env['CALENDAR_TOKEN_KEY'] &&
    !process.env['JWT_SECRET']
  ) {
    console.warn(
      '⚠️  Skipping inbound/outbound demo rows: set JWT_SECRET (or INTEGRATION_SECRET_KEY) first.'
    );
    return null;
  }
  try {
    return await import('../lib/secret-box');
  } catch (err) {
    console.warn('⚠️  Skipping sealed demo rows: secret store unavailable.', err);
    return null;
  }
}

export async function seedIntegrationExamples() {
  if (process.env['NODE_ENV'] === 'production' && process.env['BOARDLY_SEED_PRODUCTION'] !== '1') {
    console.log('⏭️  Skipping Integration Hub demos in production.');
    return;
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    await run(db);
  } catch (err) {
    // Demo data must never block the real seed (or dev boot): log and continue.
    console.warn('⚠️  Integration Hub demo seed skipped:', err);
  } finally {
    await client.end();
  }
}

async function run(db: PostgresJsDatabase<typeof schema>) {
  const [org] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, DEMO_ORG_SLUG))
    .limit(1);

  if (!org) {
    console.log('⏭️  Integration Hub demos skipped: Acme organization not present.');
    return;
  }

  const [owner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_OWNER_EMAIL))
    .limit(1);
  const createdBy = owner?.id ?? null;

  const [list] = await db
    .select({ id: schema.lists.id, name: schema.lists.name })
    .from(schema.lists)
    .innerJoin(schema.boards, eq(schema.boards.id, schema.lists.boardId))
    .where(and(eq(schema.boards.organizationId, org.id), isNull(schema.boards.deletedAt)))
    .orderBy(schema.lists.position)
    .limit(1);

  const [card] = await db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(and(eq(schema.cards.organizationId, org.id), isNull(schema.cards.deletedAt)))
    .limit(1);

  const secrets = await loadSecretBox();

  console.log('\n🔌  Seeding Integration Hub demos (one example per tab)...');

  // ── Apps: connected Slack (the provider grid is a mock connector) ──────────
  const [existingApp] = await db
    .select({ id: schema.integrations.id })
    .from(schema.integrations)
    .where(
      and(eq(schema.integrations.organizationId, org.id), eq(schema.integrations.provider, 'slack'))
    )
    .limit(1);

  if (!existingApp) {
    await db.insert(schema.integrations).values({
      organizationId: org.id,
      provider: 'slack',
      accessToken: `mock_token_demo_${randomBytes(8).toString('hex')}`,
      metadata: { connectedAt: new Date().toISOString(), seededDemo: true },
    });
  }

  // ── API Keys: different scopes/quotas per module ───────────────────────────
  const [existingKey] = await db
    .select({ id: schema.apiKeys.id })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.organizationId, org.id), eq(schema.apiKeys.name, API_KEY_NAME)))
    .limit(1);

  if (!existingKey) {
    const rawKey = `bk_live_${randomBytes(24).toString('hex')}`;
    await db.transaction(async (tx) => {
      const [key] = await tx
        .insert(schema.apiKeys)
        .values({
          organizationId: org.id,
          name: API_KEY_NAME,
          keyPrefix: rawKey.substring(0, 12),
          keyHash: sha256Hex(rawKey),
          scopes: [
            'cards:read',
            'cards:write',
            'boards:read',
            'projects:read',
            'comments:read',
            'comments:write',
          ],
          hitLimit: 5000,
        })
        .returning({ id: schema.apiKeys.id });

      await tx.insert(schema.apiKeyModules).values([
        {
          apiKeyId: key!.id,
          module: 'cards',
          canRead: true,
          canWrite: true,
          fields: null,
          hitLimit: 2000,
        },
        {
          apiKeyId: key!.id,
          module: 'comments',
          canRead: true,
          canWrite: true,
          fields: null,
          hitLimit: 1000,
        },
        {
          apiKeyId: key!.id,
          module: 'boards',
          canRead: true,
          canWrite: false,
          fields: null,
          hitLimit: null,
        },
        {
          apiKeyId: key!.id,
          module: 'projects',
          canRead: true,
          canWrite: false,
          fields: null,
          hitLimit: null,
        },
      ]);
    });
    console.log(`   • API key "${API_KEY_NAME}" — secret shown once: ${rawKey}`);
    console.log('     Try: curl -H "Authorization: Bearer <key>" $API_URL/v1/public/whoami');
  } else {
    console.log(`   • API key "${API_KEY_NAME}" already exists (secret was shown at creation).`);
  }

  // ── Inbound: two live token URLs ──────────────────────────────────────────
  if (secrets && list) {
    const [existingInbound] = await db
      .select({ id: schema.inboundWebhookEndpoints.id })
      .from(schema.inboundWebhookEndpoints)
      .where(
        and(
          eq(schema.inboundWebhookEndpoints.organizationId, org.id),
          eq(schema.inboundWebhookEndpoints.label, INBOUND_CARD_LABEL)
        )
      )
      .limit(1);

    if (!existingInbound) {
      const token = secrets.randomToken('binw_');
      await db.insert(schema.inboundWebhookEndpoints).values({
        organizationId: org.id,
        label: INBOUND_CARD_LABEL,
        targetModule: 'cards',
        defaultRefId: list.id,
        tokenHash: sha256Hex(token),
        tokenCiphertext: secrets.encryptSecret(token),
        tokenPrefix: secrets.tokenPrefix(token),
        createdBy,
      });
      console.log(`   • Inbound card URL (default list "${list.name}"): ${publicUrl(token)}`);
      console.log(
        '     Try: curl -X POST <url> -H "Content-Type: application/json" -d \'{"title":"Hello from the demo"}\''
      );
    } else {
      console.log(`   • Inbound "${INBOUND_CARD_LABEL}" already exists.`);
    }
  }

  if (secrets && card) {
    const [existingCommentInbound] = await db
      .select({ id: schema.inboundWebhookEndpoints.id })
      .from(schema.inboundWebhookEndpoints)
      .where(
        and(
          eq(schema.inboundWebhookEndpoints.organizationId, org.id),
          eq(schema.inboundWebhookEndpoints.label, INBOUND_COMMENT_LABEL)
        )
      )
      .limit(1);

    if (!existingCommentInbound) {
      const token = secrets.randomToken('binw_');
      await db.insert(schema.inboundWebhookEndpoints).values({
        organizationId: org.id,
        label: INBOUND_COMMENT_LABEL,
        targetModule: 'comments',
        defaultRefId: card.id,
        tokenHash: sha256Hex(token),
        tokenCiphertext: secrets.encryptSecret(token),
        tokenPrefix: secrets.tokenPrefix(token),
        createdBy,
      });
      console.log(`   • Inbound comment URL (default card ${card.id}): ${publicUrl(token)}`);
    } else {
      console.log(`   • Inbound "${INBOUND_COMMENT_LABEL}" already exists.`);
    }
  }

  // ── Outbound: full mapping example, inactive (example.com cannot deliver) ──
  const [existingOutbound] = await db
    .select({ id: schema.outboundIntegrations.id })
    .from(schema.outboundIntegrations)
    .where(
      and(
        eq(schema.outboundIntegrations.organizationId, org.id),
        eq(schema.outboundIntegrations.name, OUTBOUND_NAME)
      )
    )
    .limit(1);

  if (!existingOutbound && secrets) {
    const authConfig = {
      url: 'https://api.example.com/oauth/token',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"client_id":"demo","client_secret":"demo"}',
      tokenPath: 'access_token',
      ttlSeconds: 3600,
    };
    const dataConfig = {
      url: 'https://api.example.com/v1/leads',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer {{auth_token}}',
      },
      bodyTemplate: '{}',
    };
    await db.insert(schema.outboundIntegrations).values({
      organizationId: org.id,
      name: OUTBOUND_NAME,
      sourceModule: 'cards',
      triggerEvents: ['card.created'],
      authEnabled: true,
      authConfig: { enc: secrets.encryptSecret(JSON.stringify(authConfig)) },
      dataConfig: { enc: secrets.encryptSecret(JSON.stringify(dataConfig)) },
      fieldMappings: [
        { targetPath: 'name', mode: 'crm_field', source: 'title' },
        { targetPath: 'notes', mode: 'crm_field', source: 'description' },
        { targetPath: 'source', mode: 'static', value: 'boardly' },
        {
          targetPath: 'created_at',
          mode: 'crm_field',
          source: 'createdAt',
          dateFormat: 'iso8601',
        },
        { targetPath: 'access_token', mode: 'auth_token', token: '{{auth_token}}' },
      ],
      successCheck: { path: 'ok', equals: 'true' },
      isActive: false,
    });
    console.log(`   • Outbound "${OUTBOUND_NAME}" — edit the URL, then enable it.`);
  }

  // ── Event webhooks: complete subscription, disabled ────────────────────────
  const [existingWebhook] = await db
    .select({ id: schema.webhooks.id })
    .from(schema.webhooks)
    .where(and(eq(schema.webhooks.organizationId, org.id), eq(schema.webhooks.url, WEBHOOK_URL)))
    .limit(1);

  if (!existingWebhook) {
    await db.insert(schema.webhooks).values({
      organizationId: org.id,
      url: WEBHOOK_URL,
      events: ['card.created', 'card.moved'],
      secret: randomBytes(32).toString('hex'),
      isEnabled: false,
    });
    console.log(`   • Event webhook "${WEBHOOK_URL}" — edit the URL, then enable it.`);
  }

  console.log(
    '   Inactive outbound/webhook rows are safe placeholders: activate after pointing them at your endpoint.\n'
  );
}

// Direct execution: bun run src/db/seedIntegrationExamples.ts
if (import.meta.main) {
  await seedIntegrationExamples();
  process.exit(0);
}
