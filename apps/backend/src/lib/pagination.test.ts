import { describe, it, expect } from 'bun:test';
import { clampLimit, clampOffset, DEFAULT_LIMIT, MAX_LIMIT, MAX_OFFSET } from './pagination';

describe('pagination clamps', () => {
  it('bounds page size to 50/200', () => {
    expect(DEFAULT_LIMIT).toBe(50);
    expect(MAX_LIMIT).toBe(200);
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit('abc')).toBe(50);
    expect(clampLimit(-5)).toBe(50);
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(10_000)).toBe(200);
    expect(clampLimit('25')).toBe(25);
  });

  it('caps offsets against deep-pagination scans', () => {
    expect(clampOffset(undefined)).toBe(0);
    expect(clampOffset('abc')).toBe(0);
    expect(clampOffset(-5)).toBe(0);
    expect(clampOffset(100)).toBe(100);
    expect(clampOffset(10_000_000)).toBe(MAX_OFFSET);
    expect(MAX_OFFSET).toBe(10_000);
  });
});
