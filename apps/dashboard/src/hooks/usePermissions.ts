import { useMemo } from 'react';
import type { PermissionKey } from '@boardly/shared-types';
import { useAuthStore } from '../store/authStore';

/**
 * Permission gate for the dashboard. The backend is the source of truth:
 * GET /auth/me returns the server-expanded `permissions` list and this hook
 * is a pure Set lookup — no role logic lives on the client.
 *
 * - can(...keys) is ANY-of (mirrors backend aliases, e.g. card.move∨card.update).
 * - canAll(...keys) is ALL-of (multi-endpoint controls).
 * - Missing/failed permissions fail CLOSED (disabled); the backend still decides.
 */
export function usePermissions() {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const isLoading = useAuthStore((s) => s.isLoading);

  const granted = useMemo(
    () => (Array.isArray(permissions) ? new Set<string>(permissions) : new Set<string>()),
    [permissions]
  );

  const value = useMemo(
    () => ({
      permissions: granted,
      isLoading,
      can: (...keys: PermissionKey[]): boolean => keys.some((k) => granted.has(k)),
      canAll: (...keys: PermissionKey[]): boolean => keys.every((k) => granted.has(k)),
    }),
    [granted, isLoading]
  );

  return value;
}

/** Human-readable reason for a disabled control (touch-safe, no tooltip needed). */
export function permissionReason(key: PermissionKey): string {
  return `Requires permission: ${key}`;
}
