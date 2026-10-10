import { describe, it, expect } from 'bun:test';
import { envSchema } from './env';

const base = {
  JWT_SECRET: 'a'.repeat(48),
  REFRESH_TOKEN_SECRET: 'b'.repeat(48),
};

describe('env boot validation (fail-closed secrets)', () => {
  it('refuses boot without JWT secrets', () => {
    const r = envSchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths.join(',')).toContain('JWT_SECRET');
    }
  });

  it('refuses placeholder secrets in production', () => {
    const r = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      JWT_SECRET: 'replace-me-with-at-least-32-chars-of-random-data',
    });
    expect(r.success).toBe(false);
  });

  it('accepts real secrets and coerces empty inbound secrets to undefined', () => {
    const r = envSchema.safeParse({
      ...base,
      INBOUND_WEBHOOK_SECRET: '',
      INBOUND_TOKEN_SECRET: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.INBOUND_WEBHOOK_SECRET).toBeUndefined();
      expect(r.data.INBOUND_TOKEN_SECRET).toBeUndefined();
      expect(r.data.INBOUND_DOMAIN).toBe('reply.boardly.app');
    }
  });
});
