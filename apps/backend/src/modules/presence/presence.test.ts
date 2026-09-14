import { describe, it, expect } from 'bun:test';
import {
  isWithinWorkingHours,
  DEFAULT_WORKING_SCHEDULE,
  recordUserHeartbeat,
  recordUserDisconnect,
  isUserOnline,
} from './presenceService';

describe('Presence & Working Hours Logic', () => {
  it('correctly identifies standard active working hours', () => {
    // Wednesday 14:00 UTC (within 09:00 - 18:00)
    const midDay = new Date('2026-09-16T14:00:00Z');
    const result = isWithinWorkingHours(DEFAULT_WORKING_SCHEDULE, 'UTC', midDay);

    expect(result.isWithin).toBe(true);
    expect(result.isWorkDay).toBe(true);
    expect(result.currentDay).toBe('wednesday');
  });

  it('correctly identifies off-hours at night', () => {
    // Wednesday 23:30 UTC (outside 09:00 - 18:00)
    const lateNight = new Date('2026-09-16T23:30:00Z');
    const result = isWithinWorkingHours(DEFAULT_WORKING_SCHEDULE, 'UTC', lateNight);

    expect(result.isWithin).toBe(false);
    expect(result.isWorkDay).toBe(true);
  });

  it('correctly identifies weekend days when deactivated', () => {
    // Sunday 12:00 UTC (inactive in default schedule)
    const sunday = new Date('2026-09-20T12:00:00Z');
    const result = isWithinWorkingHours(DEFAULT_WORKING_SCHEDULE, 'UTC', sunday);

    expect(result.isWithin).toBe(false);
    expect(result.isWorkDay).toBe(false);
    expect(result.currentDay).toBe('sunday');
  });

  it('correctly evaluates cross-timezone working hours', () => {
    // 04:00 UTC on Wednesday is 09:30 AM in Asia/Kolkata (IST), which IS within working hours!
    const utcEarlyMorning = new Date('2026-09-16T04:00:00Z');
    const resultIST = isWithinWorkingHours(
      DEFAULT_WORKING_SCHEDULE,
      'Asia/Kolkata',
      utcEarlyMorning
    );

    expect(resultIST.isWithin).toBe(true);
    expect(resultIST.currentDay).toBe('wednesday');

    // But in America/New_York (EDT, UTC-4), 04:00 UTC is 12:00 AM midnight (off hours)
    const resultNY = isWithinWorkingHours(
      DEFAULT_WORKING_SCHEDULE,
      'America/New_York',
      utcEarlyMorning
    );
    expect(resultNY.isWithin).toBe(false);
  });

  it('tracks user online heartbeat in memory', async () => {
    const testUserId = 'test-user-presence-uuid-123';
    expect(await isUserOnline(testUserId)).toBe(false);

    await recordUserHeartbeat(testUserId);
    expect(await isUserOnline(testUserId)).toBe(true);

    await recordUserDisconnect(testUserId);
    expect(await isUserOnline(testUserId)).toBe(false);
  });
});
