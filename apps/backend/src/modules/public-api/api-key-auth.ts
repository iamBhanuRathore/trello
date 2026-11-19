import Elysia, { type HTTPHeaders } from 'elysia';
import { db } from '../../db/index';
import { verifyApiKeyWithScopes } from '../developer/service';
import { consumeGlobalHit, consumeModuleHit, quotaHeaders } from './quota';
import type { ModuleScope } from './serializers';
import type { ApiModuleId } from '@boardly/shared-types';
import { isApiModuleId } from '@boardly/shared-types';

export interface PublicApiContext {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  moduleScopes: ModuleScope[];
}

function extractRawKey(request?: Request): string | null {
  if (!request) return null;
  const bearer = request.headers.get('authorization');
  if (bearer?.toLowerCase().startsWith('bearer ')) {
    const raw = bearer.slice(7).trim();
    if (raw) return raw;
  }
  const headerKey = request.headers.get('x-api-key')?.trim();
  return headerKey || null;
}

/**
 * Public API key authentication. Mounted on every /v1/public route (except the
 * inbound receiver, which uses its own token capability).
 */
export const apiKeyAuth = new Elysia({ name: 'public-api-key-auth' }).derive(
  { as: 'scoped' },
  async ({ request, set }) => {
    const raw = extractRawKey(request);
    if (!raw) {
      set.status = 401;
      throw Object.assign(new Error('Unauthorized — missing API key'), { status: 401 });
    }
    const verified = await verifyApiKeyWithScopes(db, raw);
    if (!verified) {
      set.status = 401;
      throw Object.assign(new Error('Unauthorized — invalid, revoked, or expired API key'), {
        status: 401,
      });
    }
    const { key, moduleScopes } = verified;
    const ctx: PublicApiContext = {
      id: key.id,
      organizationId: key.organizationId,
      name: key.name,
      keyPrefix: key.keyPrefix,
      moduleScopes,
    };
    return { apiKey: ctx };
  }
);

interface ScopeHookCtx {
  apiKey?: PublicApiContext;
  set: { status?: number | string; headers?: HTTPHeaders };
}

/**
 * beforeHandle guard: checks the module scope then consumes the monthly quota.
 * Global and per-module counters are atomic UPDATEs (see quota.ts).
 */
export function requireApiScope(moduleId: ApiModuleId, action: 'read' | 'write') {
  return async ({ apiKey, set }: ScopeHookCtx) => {
    if (!apiKey) {
      set.status = 401;
      return { error: 'Unauthorized — missing API key' };
    }
    const scope = apiKey.moduleScopes.find((s) => s.module === moduleId);
    if (!scope || (action === 'read' ? !scope.read : !scope.write)) {
      set.status = 403;
      return {
        error: `Forbidden — key lacks ${moduleId}:${action}`,
        details: { code: 'SCOPE_DENIED', module: moduleId, action },
      };
    }

    const globalQuota = await consumeGlobalHit(db, apiKey.id);
    if (!globalQuota.allowed) {
      set.status = 429;
      quotaHeaders(set, globalQuota);
      if (set.headers)
        set.headers['Retry-After'] = String(
          Math.max(1, Math.floor(globalQuota.resetAt - Date.now() / 1000))
        );
      return { error: 'Monthly API quota exceeded', retryAt: globalQuota.resetAt };
    }

    // No per-module limit means no per-module counter to enforce; skipping the
    // write also keeps legacy keys (no api_key_modules row) working.
    if (scope.hitLimit == null) {
      quotaHeaders(set, globalQuota);
      return undefined;
    }

    const moduleQuota = await consumeModuleHit(db, apiKey.id, moduleId);
    if (!moduleQuota.allowed) {
      set.status = 429;
      quotaHeaders(set, moduleQuota);
      if (set.headers)
        set.headers['Retry-After'] = String(
          Math.max(1, Math.floor(moduleQuota.resetAt - Date.now() / 1000))
        );
      return { error: `Monthly quota exceeded for ${moduleId}`, retryAt: moduleQuota.resetAt };
    }

    quotaHeaders(set, moduleQuota);
    return undefined;
  };
}

export function assertKnownModule(moduleId: string): ApiModuleId {
  if (!isApiModuleId(moduleId)) {
    throw Object.assign(new Error(`Unknown module: ${moduleId}`), { status: 422 });
  }
  return moduleId;
}
