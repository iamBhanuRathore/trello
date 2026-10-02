import { createHash } from 'crypto';
import { httpError } from '../../lib/errors';
export { httpError };

export const ALLOWED_ORG_ROLES = [
  'org_owner',
  'org_admin',
  'billing_manager',
  'workspace_admin',
  'member',
  'viewer',
] as const;

export type AllowedOrgRole = (typeof ALLOWED_ORG_ROLES)[number];

/** Invite bearer tokens are sha256-hashed at rest (same convention as refresh tokens). */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
