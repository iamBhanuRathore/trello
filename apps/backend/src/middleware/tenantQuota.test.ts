import { describe, it, expect } from 'bun:test';
import { acquireLocalSlot, releaseLocalSlot } from './tenantQuota';

let n = 0;
const freshClass = () => `test-${Date.now()}-${n++}`;

describe('quota in-memory fallback semaphore (Redis down)', () => {
  it('enforces the cap locally instead of failing open', () => {
    const cls = freshClass();
    expect(acquireLocalSlot(cls, 'org-a', 1, 't1')).toBe(true);
    expect(acquireLocalSlot(cls, 'org-a', 1, 't2')).toBe(false);
    // Other orgs are unaffected.
    expect(acquireLocalSlot(cls, 'org-b', 1, 't3')).toBe(true);
  });

  it('release frees the slot', () => {
    const cls = freshClass();
    expect(acquireLocalSlot(cls, 'org-a', 1, 't1')).toBe(true);
    releaseLocalSlot(cls, 'org-a', 't1');
    expect(acquireLocalSlot(cls, 'org-a', 1, 't2')).toBe(true);
    releaseLocalSlot(cls, 'org-a', 't2');
  });

  it('never hard-fails: unknown releases are no-ops', () => {
    const cls = freshClass();
    releaseLocalSlot(cls, 'org-a', 'nope');
    expect(acquireLocalSlot(cls, 'org-a', 2, 't1')).toBe(true);
    releaseLocalSlot(cls, 'org-a', 't1');
  });
});
