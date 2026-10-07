import { describe, expect, test } from 'bun:test';
import { seatCost, formatCost, savingsVsMonthly } from './pricing-calc';

describe('pricing calculator', () => {
  test('free is always $0', () => {
    expect(seatCost('free', 50, false)).toBe(0);
    expect(formatCost('free', 50, true)).toBe('$0');
  });

  test('enterprise is custom', () => {
    expect(seatCost('enterprise', 500, false)).toBeNull();
    expect(formatCost('enterprise', 500, true)).toBe('Custom');
  });

  test('pro monthly math', () => {
    expect(seatCost('pro', 10, false)).toBe(100);
    expect(formatCost('pro', 10, false)).toBe('$100/mo');
  });

  test('annual applies 20% discount', () => {
    expect(seatCost('pro', 10, true)).toBe(960);
    expect(savingsVsMonthly('pro', 10)).toBe(240);
  });

  test('seats clamp to 1..1000', () => {
    expect(seatCost('business', 0, false)).toBe(20);
    expect(seatCost('business', 5000, false)).toBe(20000);
  });
});
