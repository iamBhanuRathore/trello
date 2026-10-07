import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * RedisService availability-lifecycle contract.
 *
 * Regression: `_isAvailable` was set on the pub client's ioredis `connect`
 * event — TCP up, not authenticated + READY, one client out of three, before
 * the other two even had sockets. And nothing ever cleared it on drop, so
 * after an outage the flag lied until restart (masked only because
 * isAvailable() also checks live status). Late recovery from a down-at-boot
 * Redis depended on that same premature handler.
 *
 * Contract: availability follows the DATA client (the one isAvailable()
 * gates on) — `ready` sets it, `close`/`end` clear it. No `connect` handler
 * may flip the flag.
 */
const SRC = join(import.meta.dir, 'client.ts');

describe('redis availability lifecycle', () => {
  it('marks available on data-client ready, clears on close/end, never on connect', async () => {
    const src = await readFile(SRC, 'utf-8');
    expect(src).toMatch(/dataClient\.on\('ready'/);
    expect(src).toMatch(/dataClient\.on\('close'/);
    expect(src).toMatch(/dataClient\.on\('end'/);
    // The premature single-client TCP-connect flip must not come back.
    expect(src).not.toMatch(/\.on\('connect', \(\) => \{\s*this\._isAvailable = true/);
  });
});
