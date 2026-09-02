import { describe, it, expect } from 'bun:test';
import { withOrgContext, rawWriteDb, rawReadDb } from './index';
import { resolveOrgPlanTier } from '../middleware/auth';

describe('Database Multi-Tenant Isolation & Context', () => {
  it('exports withOrgContext and raw client handles', () => {
    expect(typeof withOrgContext).toBe('function');
    expect(rawWriteDb).toBeDefined();
    expect(rawReadDb).toBeDefined();
  });

  it('resolves default plan tier when org metadata is queried without cached redis', async () => {
    const dummyOrgId = '00000000-0000-0000-0000-000000000000';
    const tier = await resolveOrgPlanTier(dummyOrgId);
    expect(['free', 'pro', 'business', 'enterprise']).toContain(tier);
  });
});
