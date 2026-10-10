/**
 * Bulk-wipe target guard (mirrors scripts/db.sh `db_is_local` /
 * `require_writable_target`).
 *
 * `DROP SCHEMA public CASCADE` is unrecoverable, so a non-local host is refused
 * unless ALLOW_REMOTE_DB=1 — the same explicit opt-in db.sh requires. Pure
 * functions of their inputs so reset-guard.test.ts covers them without a database.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  const afterScheme = url.includes('://') ? url.split('://', 2)[1]! : url;
  const hostPort = afterScheme.split('/')[0]!;
  const host = (hostPort.split('@').pop() ?? '').split(':')[0] ?? '';
  return (
    host === '' ||
    host === 'localhost' ||
    host.startsWith('127.') ||
    host === '::1' ||
    host === '[::1]' ||
    host === 'host.docker.internal' ||
    host === 'postgres'
  );
}

export function assertWipeAllowed(url: string, allowRemote: string | undefined): void {
  if (!isLocalDatabaseUrl(url) && allowRemote !== '1') {
    throw new Error(
      `Refusing to wipe non-local database (${url.replace(/:\/\/.*@/, '://***@')}). ` +
        `Set ALLOW_REMOTE_DB=1 to confirm a remote wipe.`
    );
  }
}
