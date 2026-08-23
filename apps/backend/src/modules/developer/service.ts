import { eq, and, desc } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import type { Database } from '../../db/index';
import {
  apiKeys,
  marketplaceApps,
  installedApps,
} from '../../db/schema/index';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

// ─── Developer API Keys ───────────────────────────────────────────────────────

export async function generateApiKey(
  db: Database,
  organizationId: string,
  input: {
    name: string;
    scopes?: string[];
    expiresInDays?: number;
  }
) {
  if (!input.name || input.name.trim().length === 0) {
    throw httpError(400, 'API key name is required');
  }

  // Format: bk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  const secretRandom = randomBytes(24).toString('hex');
  const rawKey = `bk_live_${secretRandom}`;
  const keyPrefix = rawKey.substring(0, 12);
  const keyHash = hashKey(rawKey);

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [created] = await db
    .insert(apiKeys)
    .values({
      organizationId,
      name: input.name.trim(),
      keyPrefix,
      keyHash,
      scopes: input.scopes || ['*'],
      expiresAt,
    })
    .returning();

  return {
    ...created!,
    rawKey, // Only returned ONCE at creation
  };
}

export async function listApiKeys(db: Database, organizationId: string) {
  return await db
    .select({
      id: apiKeys.id,
      organizationId: apiKeys.organizationId,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(db: Database, organizationId: string, keyId: string) {
  const [deleted] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)))
    .returning();

  if (!deleted) {
    throw httpError(404, 'API Key not found or unauthorized');
  }

  return { success: true, id: keyId };
}

export async function verifyApiKey(db: Database, rawKey: string) {
  const keyHash = hashKey(rawKey);
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!key) return null;

  if (key.expiresAt && key.expiresAt < new Date()) {
    return null; // Expired
  }

  // Update last used timestamp asynchronously
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id));

  return key;
}

// ─── Marketplace & Power-Ups ──────────────────────────────────────────────────

export const SEED_MARKETPLACE_APPS = [
  {
    name: 'GitHub Sync & PR Tracker',
    slug: 'github-sync',
    description: 'Link pull requests, branches, and commits directly to board cards. Automate column moves on PR merge.',
    developerName: 'Boardly Labs',
    category: 'developer',
    isVerified: true,
    capabilities: { cardBadges: true, cardButtons: true, webhooks: true },
    configSchema: [
      { key: 'repo', label: 'GitHub Repository', type: 'text', required: true },
      { key: 'autoMoveOnMerge', label: 'Move to Done on Merge', type: 'boolean', default: true },
    ],
  },
  {
    name: 'Slack Alerts & Digest',
    slug: 'slack-alerts',
    description: 'Post real-time card activity, mentions, and daily sprint progress digests to designated Slack channels.',
    developerName: 'Boardly Labs',
    category: 'communication',
    isVerified: true,
    capabilities: { notifications: true, webhooks: true },
    configSchema: [
      { key: 'webhookUrl', label: 'Incoming Webhook URL', type: 'text', required: true },
      { key: 'notifyOnOverdue', label: 'Alert on Overdue Tasks', type: 'boolean', default: true },
    ],
  },
  {
    name: 'Custom Fields Pro',
    slug: 'custom-fields-pro',
    description: 'Extend cards with dropdowns, formulas, currency, and multi-select tags tailored to your workflow.',
    developerName: 'Workflow Studio',
    category: 'utility',
    isVerified: true,
    capabilities: { customFields: true, cardBadges: true },
    configSchema: [],
  },
  {
    name: 'Time Tracker Pro',
    slug: 'time-tracker-pro',
    description: 'Live stopwatch timer on cards with client billing rate calculation and invoice preparation.',
    developerName: 'Chronos Tools',
    category: 'analytics',
    isVerified: true,
    capabilities: { cardButtons: true, reports: true },
    configSchema: [
      { key: 'defaultHourlyRate', label: 'Default Hourly Rate ($)', type: 'number', default: 100 },
    ],
  },
  {
    name: 'Jira Dual-Sync Connector',
    slug: 'jira-sync',
    description: 'Two-way synchronization between Boardly boards and Jira Software epics and issues.',
    developerName: 'Enterprise Bridges',
    category: 'automation',
    isVerified: true,
    capabilities: { webhooks: true, sync: true },
    configSchema: [
      { key: 'jiraDomain', label: 'Atlassian Jira Domain', type: 'text', required: true },
      { key: 'projectKey', label: 'Jira Project Key', type: 'text', required: true },
    ],
  },
];

export async function seedMarketplaceApps(db: Database) {
  for (const app of SEED_MARKETPLACE_APPS) {
    const [existing] = await db
      .select()
      .from(marketplaceApps)
      .where(eq(marketplaceApps.slug, app.slug))
      .limit(1);

    if (!existing) {
      await db.insert(marketplaceApps).values({
        name: app.name,
        slug: app.slug,
        description: app.description,
        developerName: app.developerName,
        category: app.category,
        isVerified: app.isVerified,
        capabilities: app.capabilities,
        configSchema: app.configSchema,
      });
    }
  }
}

export async function listMarketplaceApps(
  db: Database,
  organizationId: string,
  query?: { category?: string; search?: string }
) {
  // Ensure apps are seeded
  await seedMarketplaceApps(db);

  let apps = await db.select().from(marketplaceApps);

  if (query?.category && query.category !== 'all') {
    apps = apps.filter((a) => a.category.toLowerCase() === query.category!.toLowerCase());
  }

  if (query?.search && query.search.trim()) {
    const q = query.search.trim().toLowerCase();
    apps = apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.developerName.toLowerCase().includes(q)
    );
  }

  // Query installed apps for this org
  const installed = await db
    .select()
    .from(installedApps)
    .where(eq(installedApps.organizationId, organizationId));

  const installedMap = new Map(installed.map((i) => [i.appId, i]));

  return apps.map((app) => {
    const installRecord = installedMap.get(app.id);
    return {
      ...app,
      isInstalled: !!installRecord,
      installedApp: installRecord || null,
    };
  });
}

export async function getMarketplaceApp(db: Database, organizationId: string, appId: string) {
  const [app] = await db
    .select()
    .from(marketplaceApps)
    .where(eq(marketplaceApps.id, appId))
    .limit(1);

  if (!app) {
    throw httpError(404, 'Marketplace App not found');
  }

  const [installed] = await db
    .select()
    .from(installedApps)
    .where(and(eq(installedApps.appId, appId), eq(installedApps.organizationId, organizationId)))
    .limit(1);

  return {
    ...app,
    isInstalled: !!installed,
    installedApp: installed || null,
  };
}

export async function installMarketplaceApp(
  db: Database,
  organizationId: string,
  input: {
    appId: string;
    boardId?: string;
    config?: Record<string, any>;
  }
) {
  const [app] = await db
    .select()
    .from(marketplaceApps)
    .where(eq(marketplaceApps.id, input.appId))
    .limit(1);

  if (!app) {
    throw httpError(404, 'App not found in marketplace');
  }

  const [existing] = await db
    .select()
    .from(installedApps)
    .where(and(eq(installedApps.appId, input.appId), eq(installedApps.organizationId, organizationId)))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [installed] = await db
    .insert(installedApps)
    .values({
      organizationId,
      appId: input.appId,
      boardId: input.boardId || null,
      config: input.config || {},
      isEnabled: true,
    })
    .returning();

  return installed!;
}

export async function updateInstalledApp(
  db: Database,
  organizationId: string,
  installedId: string,
  input: {
    config?: Record<string, any>;
    isEnabled?: boolean;
  }
) {
  const [updated] = await db
    .update(installedApps)
    .set({
      config: input.config,
      isEnabled: input.isEnabled,
      updatedAt: new Date(),
    })
    .where(and(eq(installedApps.id, installedId), eq(installedApps.organizationId, organizationId)))
    .returning();

  if (!updated) {
    throw httpError(404, 'Installed app not found');
  }

  return updated;
}

export async function uninstallMarketplaceApp(
  db: Database,
  organizationId: string,
  installedId: string
) {
  const [deleted] = await db
    .delete(installedApps)
    .where(and(eq(installedApps.id, installedId), eq(installedApps.organizationId, organizationId)))
    .returning();

  if (!deleted) {
    throw httpError(404, 'Installed app not found');
  }

  return { success: true, id: installedId };
}
