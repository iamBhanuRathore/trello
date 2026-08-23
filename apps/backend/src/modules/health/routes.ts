import Elysia from 'elysia';
import { db } from '../../db/index';
import { sql } from 'drizzle-orm';

export const healthRoutes = new Elysia({ tags: ['Health'] }).get(
  '/health',
  async () => {
    // Check DB connectivity
    let dbStatus = 'ok';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: dbStatus,
      },
    };
  },
  {
    detail: {
      summary: 'Health check',
      description: 'Returns system health status and DB connectivity',
    },
  }
);
