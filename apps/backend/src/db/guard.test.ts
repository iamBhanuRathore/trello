import { describe, it, expect } from 'bun:test';
import { isLocalDatabaseUrl, assertWipeAllowed } from './guard';

describe('bulk-wipe guard (fail-closed on prod-pattern URLs)', () => {
  it('allows local targets', () => {
    for (const url of [
      'postgresql://boardly:boardly_dev@localhost:5432/boardly_dev',
      'postgresql://boardly:boardly_test@localhost:5433/boardly_test',
      'postgresql://boardly@127.0.0.1:5432/boardly_dev',
      'postgresql://boardly@postgres:5432/boardly_dev',
    ]) {
      expect(isLocalDatabaseUrl(url)).toBe(true);
      expect(() => assertWipeAllowed(url, undefined)).not.toThrow();
    }
  });

  it('refuses remote targets without explicit opt-in', () => {
    const remote = 'postgresql://boardly:secret@prod-neon-123.aws.neon.tech/boardly';
    expect(isLocalDatabaseUrl(remote)).toBe(false);
    expect(() => assertWipeAllowed(remote, undefined)).toThrow(/Refusing to wipe/);
    expect(() => assertWipeAllowed(remote, '0')).toThrow(/Refusing to wipe/);
  });

  it('allows remote only with ALLOW_REMOTE_DB=1', () => {
    const remote = 'postgresql://boardly:secret@prod-neon-123.aws.neon.tech/boardly';
    expect(() => assertWipeAllowed(remote, '1')).not.toThrow();
  });
});
