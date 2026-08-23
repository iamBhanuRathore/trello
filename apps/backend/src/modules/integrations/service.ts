import { db } from '../../db';
import { integrations } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const integrationsService = {
  async listIntegrations(organizationId: string) {
    const results = await db
      .select()
      .from(integrations)
      .where(eq(integrations.organizationId, organizationId));

    // Don't leak raw tokens in the list response
    return results.map((integration) => ({
      id: integration.id,
      organizationId: integration.organizationId,
      provider: integration.provider,
      metadata: integration.metadata,
      createdAt: integration.createdAt,
      isConnected: !!integration.accessToken,
    }));
  },

  async connectIntegration(organizationId: string, provider: 'slack' | 'github' | 'google_drive') {
    // Check if one already exists
    const existing = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.organizationId, organizationId),
          eq(integrations.provider, provider)
        )
      )
      .limit(1);

    const mockAccessToken = `mock_token_${uuidv4()}`;

    if (existing.length > 0) {
      const [updated] = await db
        .update(integrations)
        .set({ accessToken: mockAccessToken, updatedAt: new Date() })
        .where(eq(integrations.id, existing[0]?.id || ""))
        .returning();

      return updated;
    }

    const [newIntegration] = await db
      .insert(integrations)
      .values({
        organizationId,
        provider,
        accessToken: mockAccessToken,
        refreshToken: `mock_refresh_${uuidv4()}`,
        metadata: { connectedAt: new Date().toISOString() },
      })
      .returning();

    return newIntegration;
  },

  async disconnectIntegration(organizationId: string, id: string) {
    const [deleted] = await db
      .delete(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.organizationId, organizationId)
        )
      )
      .returning();

    if (!deleted) {
      throw new Error('Integration not found');
    }
    return deleted;
  }
};
