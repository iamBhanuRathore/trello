import { describe, it, expect } from 'bun:test';
import { isLocalUploadsAllowed } from './storage';

describe('local upload gate (fail-closed)', () => {
  it('S3 path is unaffected', () => {
    expect(isLocalUploadsAllowed({ s3: true, nodeEnv: 'production', allowFlag: false })).toBe(true);
  });

  it('dev/test stay open without the flag', () => {
    expect(isLocalUploadsAllowed({ s3: false, nodeEnv: 'development', allowFlag: false })).toBe(
      true
    );
    expect(isLocalUploadsAllowed({ s3: false, nodeEnv: 'test', allowFlag: false })).toBe(true);
  });

  it('production refuses without ALLOW_LOCAL_UPLOADS=1', () => {
    expect(isLocalUploadsAllowed({ s3: false, nodeEnv: 'production', allowFlag: false })).toBe(
      false
    );
    expect(isLocalUploadsAllowed({ s3: false, nodeEnv: 'production', allowFlag: true })).toBe(true);
  });
});
