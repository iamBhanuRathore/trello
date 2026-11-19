import { eq, and, desc, ilike, or, inArray } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import type { Database } from '../../db/index';
import { apiKeys, apiKeyModules, marketplaceApps, installedApps } from '../../db/schema/index';
import { API_MODULES, getApiModule, isApiModuleId, scopeChip } from '@boardly/shared-types';

import { httpError } from '../../lib/errors';
export { httpError };

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

// ─── Developer API Keys ───────────────────────────────────────────────────────

export interface ModuleScopeInput {
  module: string;
  read?: boolean;
  write?: boolean;
  /** null/undefined = all catalogue fields. */
  fields?: string[] | null;
  /** Monthly quota for this module; null = unlimited. */
  hitLimit?: number | null;
}

export interface NormalizedModuleScope {
  module: string;
  read: boolean;
  write: boolean;
  fields: string[] | null;
  hitLimit: number | null;
}

/** Accept legacy `cards:read` chips and `*`. */
function scopesFromLegacy(scopes?: string[]): NormalizedModuleScope[] {
  if (!scopes || scopes.length === 0) return [];
  if (scopes.includes('*')) {
    return API_MODULES.map((m) => ({
      module: m.id,
      read: true,
      write: true,
      fields: null,
      hitLimit: null,
    }));
  }
  const byModule = new Map<string, NormalizedModuleScope>();
  for (const scope of scopes) {
    const [module, action] = scope.split(':');
    if (!module || !isApiModuleId(module)) continue;
    if (action !== 'read' && action !== 'write') continue;
    const entry =
      byModule.get(module) ??
      ({
        module,
        read: false,
        write: false,
        fields: null,
        hitLimit: null,
      } as NormalizedModuleScope);
    entry[action] = true;
    byModule.set(module, entry);
  }
  return [...byModule.values()];
}

function normalizeModuleScopes(input: ModuleScopeInput[]): NormalizedModuleScope[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw httpError(422, 'At least one module scope is required');
  }
  const seen = new Set<string>();
  return input.map((scope) => {
    if (!isApiModuleId(scope.module)) {
      throw httpError(422, `Unknown API module: ${scope.module}`);
    }
    if (seen.has(scope.module)) {
      throw httpError(422, `Duplicate module scope: ${scope.module}`);
    }
    seen.add(scope.module);
    if (!scope.read && !scope.write) {
      throw httpError(422, `Module ${scope.module} needs read and/or write permission`);
    }
    const moduleDef = getApiModule(scope.module)!;
    const validFields = new Set(moduleDef.fields.map((f) => f.id));
    let fields: string[] | null = null;
    if (Array.isArray(scope.fields)) {
      const unknown = scope.fields.filter((f) => !validFields.has(f));
      if (unknown.length > 0) {
        throw httpError(422, `Unknown fields for ${scope.module}: ${unknown.join(', ')}`);
      }
      fields = [...new Set(scope.fields)];
      // Required-on-create fields must survive field restriction or writes
      // could never succeed; lock them in server-side too.
      if (scope.write) {
        for (const f of moduleDef.fields) {
          if (f.requiredOnCreate && !fields.includes(f.id)) fields.push(f.id);
        }
      }
    }
    if (scope.hitLimit !== undefined && scope.hitLimit !== null) {
      if (!Number.isInteger(scope.hitLimit) || scope.hitLimit < 0) {
        throw httpError(422, 'Module hit limit must be a non-negative integer');
      }
    }
    return {
      module: scope.module,
      read: !!scope.read,
      write: !!scope.write,
      fields,
      hitLimit: scope.hitLimit ?? null,
    };
  });
}

export async function generateApiKey(
  db: Database,
  organizationId: string,
  input: {
    name: string;
    scopes?: string[];
    moduleScopes?: ModuleScopeInput[];
    hitLimit?: number | null;
    expiresInDays?: number;
  }
) {
  if (!input.name || input.name.trim().length === 0) {
    throw httpError(400, 'API key name is required');
  }
  // An empty-org JWT would otherwise mint a key row scoped to no tenant.
  if (!organizationId) {
    throw httpError(400, 'Cannot create an API key without an organization context');
  }
  if (
    input.hitLimit !== undefined &&
    input.hitLimit !== null &&
    (!Number.isInteger(input.hitLimit) || input.hitLimit < 0)
  ) {
    throw httpError(422, 'Global hit limit must be a non-negative integer');
  }

  const moduleScopes = input.moduleScopes
    ? normalizeModuleScopes(input.moduleScopes)
    : scopesFromLegacy(input.scopes ?? ['*']);
  if (moduleScopes.length === 0) {
    throw httpError(422, 'At least one module scope is required');
  }

  // Format: bk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  const secretRandom = randomBytes(24).toString('hex');
  const rawKey = `bk_live_${secretRandom}`;
  const keyPrefix = rawKey.substring(0, 12);
  const keyHash = hashKey(rawKey);

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const legacyScopes = moduleScopes.flatMap((s) => [
    ...(s.read ? [scopeChip(s.module, 'read')] : []),
    ...(s.write ? [scopeChip(s.module, 'write')] : []),
  ]);

  const created = await db.transaction(async (tx) => {
    const [key] = await tx
      .insert(apiKeys)
      .values({
        organizationId,
        name: input.name.trim(),
        keyPrefix,
        keyHash,
        scopes: legacyScopes,
        hitLimit: input.hitLimit ?? null,
        expiresAt,
      })
      .returning();

    await tx.insert(apiKeyModules).values(
      moduleScopes.map((s) => ({
        apiKeyId: key!.id,
        module: s.module,
        canRead: s.read,
        canWrite: s.write,
        fields: s.fields,
        hitLimit: s.hitLimit,
      }))
    );
    return key!;
  });

  return {
    ...created,
    moduleScopes,
    rawKey, // Only returned ONCE at creation
  };
}

export async function listApiKeys(db: Database, organizationId: string) {
  const keys = await db
    .select({
      id: apiKeys.id,
      organizationId: apiKeys.organizationId,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      hitLimit: apiKeys.hitLimit,
      hits: apiKeys.hits,
      hitsPeriodStart: apiKeys.hitsPeriodStart,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));

  if (keys.length === 0) return [];
  const modules = await db
    .select()
    .from(apiKeyModules)
    .where(
      inArray(
        apiKeyModules.apiKeyId,
        keys.map((k) => k.id)
      )
    );

  const byKey = new Map<string, NormalizedModuleScope[]>();
  for (const m of modules) {
    const list = byKey.get(m.apiKeyId) ?? [];
    list.push({
      module: m.module,
      read: m.canRead,
      write: m.canWrite,
      fields: (m.fields as string[] | null) ?? null,
      hitLimit: m.hitLimit ?? null,
    });
    byKey.set(m.apiKeyId, list);
  }
  return keys.map((k) => ({ ...k, moduleScopes: byKey.get(k.id) ?? [] }));
}

/** Soft revoke: the key stays visible (auditable) but auth is rejected. */
export async function revokeApiKey(db: Database, organizationId: string, keyId: string) {
  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)))
    .returning({ id: apiKeys.id, revokedAt: apiKeys.revokedAt });

  if (!updated) {
    throw httpError(404, 'API Key not found or unauthorized');
  }

  return { success: true, id: keyId, revokedAt: updated.revokedAt };
}

/** Hard delete — removes the key and its module scopes (FK cascade). */
export async function deleteApiKey(db: Database, organizationId: string, keyId: string) {
  const [deleted] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)))
    .returning({ id: apiKeys.id });

  if (!deleted) {
    throw httpError(404, 'API Key not found or unauthorized');
  }

  return { success: true, id: keyId };
}

export async function verifyApiKey(db: Database, rawKey: string) {
  const keyHash = hashKey(rawKey);
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

  if (!key) return null;

  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) {
    return null; // Expired
  }

  // Update last used timestamp asynchronously
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

  return key;
}

/** Verify + resolve module scopes for the public API auth middleware. */
export async function verifyApiKeyWithScopes(db: Database, rawKey: string) {
  const key = await verifyApiKey(db, rawKey);
  if (!key) return null;

  const modules = await db.select().from(apiKeyModules).where(eq(apiKeyModules.apiKeyId, key.id));

  // Defensive fallback for a key that never got its module rows (created by an
  // older build, or a database where the 0044 backfill did not run). Reads the
  // legacy chips instead of silently denying every request.
  const moduleScopes: Array<{
    module: string;
    read: boolean;
    write: boolean;
    fields: string[] | null;
    hitLimit: number | null;
    hits: number;
  }> =
    modules.length > 0
      ? modules.map((m) => ({
          module: m.module,
          read: m.canRead,
          write: m.canWrite,
          fields: (m.fields as string[] | null) ?? null,
          hitLimit: m.hitLimit ?? null,
          hits: m.hits,
        }))
      : scopesFromLegacy(key.scopes as string[]).map((s) => ({ ...s, hits: 0 }));

  return { key, moduleScopes };
}

// ─── Marketplace & Power-Ups ──────────────────────────────────────────────────

export const SEED_MARKETPLACE_APPS = [
  {
    name: 'GitHub Sync & PR Tracker',
    slug: 'github-sync',
    description:
      'Link pull requests, branches, and commits directly to board cards. Automate column moves on PR merge.',
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
    description:
      'Post real-time card activity, mentions, and daily sprint progress digests to designated Slack channels.',
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
    description:
      'Extend cards with dropdowns, formulas, currency, and multi-select tags tailored to your workflow.',
    developerName: 'Workflow Studio',
    category: 'utility',
    isVerified: true,
    capabilities: { customFields: true, cardBadges: true },
    configSchema: [],
  },
  {
    name: 'Time Tracker Pro',
    slug: 'time-tracker-pro',
    description:
      'Live stopwatch timer on cards with client billing rate calculation and invoice preparation.',
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
    description:
      'Two-way synchronization between Boardly boards and Jira Software epics and issues.',
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

  // Filters pushed to SQL (catalog is small today, but this keeps the
  // endpoint O(matches) instead of O(catalog) as it grows).
  const conditions = [];
  if (query?.category && query.category !== 'all') {
    conditions.push(eq(marketplaceApps.category, query.category));
  }
  if (query?.search && query.search.trim()) {
    const q = `%${query.search.trim().replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(
      or(
        ilike(marketplaceApps.name, q),
        ilike(marketplaceApps.description, q),
        ilike(marketplaceApps.developerName, q)
      )
    );
  }
  const apps =
    conditions.length > 0
      ? await db
          .select()
          .from(marketplaceApps)
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : await db.select().from(marketplaceApps);

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
    .where(
      and(eq(installedApps.appId, input.appId), eq(installedApps.organizationId, organizationId))
    )
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
