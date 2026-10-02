import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';
import {
  presenceTopic,
  resolveUserOrgId,
  batchGetUsersPresenceScoped,
  setUserPresenceOverride,
} from './presenceService';

/**
 * Cross-tenant regression tests for the presence feed (P0).
 *
 * Before the fix every WebSocket subscribed to one global `org:presence` topic
 * and every presence change broadcast to it, so any tenant's status/heartbeat
 * fanned out to all tenants. `GET /v1/presence/users?ids=` also resolved any
 * user id regardless of organization — a presence/name oracle.
 */

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

interface Tenant {
  orgId: string;
  userId: string;
  email: string;
  boardId: string;
}

let tenantA: Tenant;
let tenantB: Tenant;

async function makeTenant(prefix: string): Promise<Tenant> {
  const email = uniqueTestEmail(prefix);
  const { user, organization } = await signUp(db, {
    name: `${prefix} owner`,
    email,
    password: 'pass',
    orgName: `${prefix} Org`,
    orgSlug: uniqueTestSlug(prefix),
  });
  const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
  const proj = await createProject(db, {
    organizationId: organization.id,
    workspaceId: ws!.id,
    name: 'Project',
  });
  const board = await createBoard(db, {
    organizationId: organization.id,
    projectId: proj!.id,
    name: 'Board',
  });
  return { orgId: organization.id, userId: user.id, email, boardId: board!.id };
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
  tenantA = await makeTenant('presence-a');
  tenantB = await makeTenant('presence-b');
});

afterAll(async () => {
  for (const t of [tenantA, tenantB]) {
    await db.delete(schema.boards).where(eq(schema.boards.id, t.boardId));
    await db.delete(schema.projects).where(eq(schema.projects.organizationId, t.orgId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, t.orgId));
    await deleteTestOrg(db, t.orgId);
    await deleteTestUser(db, t.email);
  }
  await client.end();
});

describe('Presence — tenant scoping', () => {
  it('no source file publishes to or subscribes to the bare global org:presence topic', async () => {
    // Source-level guard: the pre-fix code broadcast to and subscribed to the
    // literal 'org:presence', which fanned every tenant's presence to all
    // tenants. This fails against that code and passes now that the topic is
    // always built with an org id.
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const roots = [
      join(import.meta.dir, '..', 'presence'),
      join(import.meta.dir, '..', 'realtime'),
    ];
    const offenders: string[] = [];

    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          const src = await readFile(full, 'utf-8');
          // Match the bare string as a broadcast target or subscribe argument.
          if (
            /broadcast\(\s*['"`]org:presence['"`]/.test(src) ||
            /subscribe\(\s*['"`]org:presence['"`]\s*\)/.test(src)
          ) {
            offenders.push(full);
          }
        }
      }
    }

    for (const root of roots) await walk(root);
    expect(offenders).toEqual([]);
  });

  it('presence topics are namespaced per organization, never global', () => {
    expect(presenceTopic(tenantA.orgId)).toBe(`org:presence:${tenantA.orgId}`);
    expect(presenceTopic(tenantB.orgId)).toBe(`org:presence:${tenantB.orgId}`);
    expect(presenceTopic(tenantA.orgId)).not.toBe(presenceTopic(tenantB.orgId));
    // The pre-fix global topic must not be produced anywhere.
    expect(presenceTopic(tenantA.orgId)).not.toBe('org:presence');
  });

  it('resolves each user to their own active organization', async () => {
    expect(await resolveUserOrgId(db, tenantA.userId)).toBe(tenantA.orgId);
    expect(await resolveUserOrgId(db, tenantB.userId)).toBe(tenantB.orgId);
  });

  it('presence updates broadcast only to the acting user own org topic', async () => {
    const seen: Array<{ topic: string; event: string; payload: unknown }> = [];
    const { eventBus } = await import('../../lib/event-bus');
    const listener = ({ topic, event, payload }: (typeof seen)[number]) =>
      seen.push({ topic, event, payload });
    eventBus.on('broadcast', listener);

    try {
      await setUserPresenceOverride(db, tenantA.userId, { status: 'busy' });
    } finally {
      eventBus.off('broadcast', listener);
    }

    const presenceEvents = seen.filter((e) => e.event === 'presence:updated');
    expect(presenceEvents.length).toBeGreaterThan(0);
    for (const e of presenceEvents) {
      expect(e.topic).toBe(presenceTopic(tenantA.orgId));
      expect(e.topic).not.toContain(tenantB.orgId);
      expect((e.payload as { organizationId?: string }).organizationId).toBe(tenantA.orgId);
    }

    // Clean up the override so the row does not leak into other suites.
    await db
      .delete(schema.userPresenceOverrides)
      .where(eq(schema.userPresenceOverrides.userId, tenantA.userId));
  });

  it('batch presence drops ids belonging to another organization', async () => {
    const result = (await batchGetUsersPresenceScoped(
      db,
      [tenantA.userId, tenantB.userId],
      tenantA.orgId
    )) as Array<{ userId: string }>;

    const returned = result.map((p) => p.userId);
    expect(returned).toContain(tenantA.userId);
    expect(returned).not.toContain(tenantB.userId);
  });

  it('batch presence returns nothing when every id is foreign', async () => {
    const result = await batchGetUsersPresenceScoped(db, [tenantB.userId], tenantA.orgId);
    expect(result).toHaveLength(0);
  });

  it('an unknown user id is ignored rather than resolved', async () => {
    const result = await batchGetUsersPresenceScoped(
      db,
      ['00000000-0000-0000-0000-000000000000'],
      tenantA.orgId
    );
    expect(result).toHaveLength(0);
  });
});
