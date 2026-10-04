import { describe, it, expect } from 'bun:test';

/**
 * calendarService -> lib/api -> store/authStore, and authStore reads
 * localStorage at module-init. There is no DOM in this suite, so stub the
 * minimum surface BEFORE the dynamic import below.
 */
const ls = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => void ls.set(k, v),
  removeItem: (k: string) => void ls.delete(k),
  clear: () => ls.clear(),
  key: (i: number) => [...ls.keys()][i] ?? null,
  get length() {
    return ls.size;
  },
} as Storage;

const { describeCalendarError } = await import('./calendarService');

/**
 * Calendar failures rendered as "Request failed with status code 502".
 *
 * `describeCalendarError` read `err.response.data.message` directly, but backend
 * error bodies are `{ error, details? }` — `lib/errors.ts` `formatErrorResponse`
 * only adds `message` for validation failures. So for every real calendar error
 * the server's actual text was discarded and the user saw axios's generic status
 * line instead.
 *
 * These pin the plumbing: whatever the backend puts in `error` (or `message`)
 * must be what reaches the user, and the offline case must keep its own wording.
 */

const withBody = (data: unknown) => ({ response: { status: 502, data } });

describe('describeCalendarError', () => {
  it('surfaces the backend `error` field (the shape every real error uses)', () => {
    expect(
      describeCalendarError(
        withBody({
          error:
            'Your Google Calendar connection has expired. Reconnect Google Calendar and try again.',
          details: { code: 'GOOGLE_REAUTH_REQUIRED' },
        }),
        'Failed to create meeting'
      )
    ).toMatch(/connection has expired/i);
  });

  it('still honours `message` for validation-failure bodies', () => {
    expect(
      describeCalendarError(
        {
          response: {
            status: 422,
            data: { error: 'Validation failed', message: 'start: expected string' },
          },
        },
        'Failed'
      )
    ).toBe('start: expected string');
  });

  it('prefers the first field of a details array', () => {
    expect(
      describeCalendarError(
        {
          response: {
            status: 400,
            data: { error: 'Validation failed', details: [{ message: 'title is required' }] },
          },
        },
        'Failed'
      )
    ).toBe('title is required');
  });

  it('keeps the explicit offline wording — no response means the write never landed', () => {
    // Deliberately NOT the generic parser message: for calendar writes the user
    // needs to know the Google-side event was not touched, so they can retry
    // without assuming a half-applied change.
    expect(describeCalendarError(new Error('Network Error'), 'Failed to create meeting')).toMatch(
      /not saved/i
    );
    expect(describeCalendarError({}, 'Failed to create meeting')).toMatch(/not saved/i);
  });

  it('falls back rather than leaking an axios status line', () => {
    const msg = describeCalendarError(
      { response: { status: 500, data: {} }, message: 'Request failed with status code 500' },
      'Failed to create meeting'
    );
    expect(msg).toBe('Failed to create meeting');
    expect(msg).not.toMatch(/status code/);
  });
});
