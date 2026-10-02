import type { ReactNode } from 'react';
import type { PermissionKey } from '@boardly/shared-types';
import { usePermissions } from '../../hooks/usePermissions';

interface CanProps {
  /** Single key or ANY-of list. */
  permission: PermissionKey | PermissionKey[];
  children: ReactNode;
  /** While /me is unresolved render disabled-equivalent (never flash-hide). */
  fallback?: ReactNode;
}

/** Hide entirely — for destructive actions (*.delete/archive, member.remove). */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { can, isLoading } = usePermissions();
  if (isLoading) return <>{fallback}</>;
  const keys = Array.isArray(permission) ? permission : [permission];
  return can(...keys) ? <>{children}</> : <>{fallback}</>;
}

interface CanAllProps {
  permissions: PermissionKey[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Hide unless ALL keys are granted — for multi-endpoint controls. */
export function CanAll({ permissions, children, fallback = null }: CanAllProps) {
  const { canAll, isLoading } = usePermissions();
  if (isLoading) return <>{fallback}</>;
  return canAll(...permissions) ? <>{children}</> : <>{fallback}</>;
}
