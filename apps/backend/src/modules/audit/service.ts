import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { auditLog, users } from '../../db/schema/index';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export async function recordAuditLog(
  db: Database,
  input: {
    organizationId: string;
    actorId?: string | null;
    action: string;
    target?: string | null;
    targetId?: string | null;
    metadata?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
) {
  const [entry] = await db
    .insert(auditLog)
    .values({
      organizationId: input.organizationId,
      actorId: input.actorId || null,
      action: input.action,
      target: input.target || null,
      targetId: input.targetId || null,
      metadata: input.metadata || {},
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
    })
    .returning();

  return entry;
}

export async function getAuditLogs(
  db: Database,
  organizationId: string,
  filters?: {
    actorId?: string;
    action?: string;
    target?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
) {
  const conditions = [eq(auditLog.organizationId, organizationId)];

  if (filters?.actorId) {
    conditions.push(eq(auditLog.actorId, filters.actorId));
  }
  if (filters?.action) {
    conditions.push(eq(auditLog.action, filters.action));
  }
  if (filters?.target) {
    conditions.push(eq(auditLog.target, filters.target));
  }
  if (filters?.startDate) {
    conditions.push(gte(auditLog.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLog.createdAt, end));
  }

  const whereClause = and(...conditions);
  const limit = Math.min(filters?.limit || 50, 200);
  const offset = filters?.offset || 0;

  const [countRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(whereClause);

  const logs = await db
    .select({
      id: auditLog.id,
      organizationId: auditLog.organizationId,
      actorId: auditLog.actorId,
      action: auditLog.action,
      target: auditLog.target,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      ipAddress: auditLog.ipAddress,
      userAgent: auditLog.userAgent,
      createdAt: auditLog.createdAt,
      actor: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    logs,
    totalCount: countRes?.count || 0,
    limit,
    offset,
  };
}
