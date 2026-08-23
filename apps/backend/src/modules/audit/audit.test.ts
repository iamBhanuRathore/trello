import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { recordAuditLog, getAuditLogs } from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Audit Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = `audit_${Date.now()}@example.com`;
    const slug = `audit-org-${Date.now()}`;

    const { user, organization } = await signUp(db, {
      name: 'Audit Admin',
      email,
      password: 'pass',
      orgName: 'Audit Org',
      orgSlug: slug,
    });
    orgId = organization.id;
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, orgId));
    await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, orgId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await client.end();
  });

  it('should record an audit log event', async () => {
    const entry = await recordAuditLog(db, {
      organizationId: orgId,
      actorId: userId,
      action: 'board.deleted',
      target: 'Project Board Alpha',
      targetId: '00000000-0000-0000-0000-000000000001',
      metadata: { reason: 'Sprint completed' },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(entry?.id).toBeDefined();
    expect(entry?.action).toBe('board.deleted');
    expect(entry?.target).toBe('Project Board Alpha');
  });

  it('should record a second event and query logs with filters', async () => {
    await recordAuditLog(db, {
      organizationId: orgId,
      actorId: userId,
      action: 'role.updated',
      target: 'Admin Role',
      metadata: { updatedPermissions: ['card.create', 'card.delete'] },
    });

    const result = await getAuditLogs(db, orgId, {
      action: 'board.deleted',
    });

    expect(result.totalCount).toBe(1);
    expect(result.logs.length).toBe(1);
    expect(result.logs[0]!.action).toBe('board.deleted');
    expect(result.logs[0]!.actor?.name).toBe('Audit Admin');
  });

  it('should query all organization audit logs without filter', async () => {
    const result = await getAuditLogs(db, orgId);
    expect(result.totalCount).toBe(2);
    expect(result.logs.length).toBe(2);
  });
});
