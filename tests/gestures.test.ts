import { describe, expect, it } from 'vitest';
import { isHorizontal, swipeAction, swipeOffset, swipeThreshold } from '../src/lib/gestures';

const BOTH = { complete: true, snooze: true };

describe('swipe gestures', () => {
  it('scales the threshold with the row but keeps it reachable', () => {
    expect(swipeThreshold(390)).toBeCloseTo(96);
    expect(swipeThreshold(320)).toBeCloseTo(89.6);
    expect(swipeThreshold(100)).toBe(56);
  });

  it('only treats clearly sideways movement as a swipe', () => {
    expect(isHorizontal(30, 5)).toBe(true);
    expect(isHorizontal(8, 0)).toBe(false); // still a tap
    expect(isHorizontal(30, 25)).toBe(false); // diagonal — let the page scroll
    expect(isHorizontal(-40, 10)).toBe(true);
  });

  it('follows the finger up to the threshold, then rubber-bands', () => {
    expect(swipeOffset(50, 390, BOTH)).toBe(50);
    expect(swipeOffset(196, 390, BOTH)).toBeCloseTo(96 + 100 * 0.35);
    expect(swipeOffset(-50, 390, BOTH)).toBe(-50);
    expect(swipeOffset(2000, 390, BOTH)).toBeCloseTo(390 * 0.6);
  });

  it('does not move in a direction that has no action', () => {
    expect(swipeOffset(120, 390, { complete: false, snooze: true })).toBe(0);
    expect(swipeOffset(-120, 390, { complete: true, snooze: false })).toBe(0);
  });

  it('right past the threshold is done, left is snooze, short swipes do nothing', () => {
    expect(swipeAction(100, 390)).toBe('complete');
    expect(swipeAction(-100, 390)).toBe('snooze');
    expect(swipeAction(60, 390)).toBeNull();
    expect(swipeAction(0, 390)).toBeNull();
  });
});
