// Swipe rules for reminder rows: right = done, left = snooze. Pure so the
// thresholds are tested without a touch screen.

export type SwipeAction = 'complete' | 'snooze';

/** Distance a row must travel before releasing triggers the action. */
export function swipeThreshold(width: number): number {
  return Math.min(96, Math.max(56, width * 0.28));
}

/** Movement needed before a touch counts as a horizontal swipe, not a scroll or tap. */
export const SWIPE_SLOP = 10;

/** Is this movement a horizontal swipe? Mostly-vertical moves are left to scrolling. */
export function isHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_SLOP && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/**
 * Where the row is drawn for a finger offset: free up to the threshold, then
 * rubber-banded. Directions that have no action don't move at all.
 */
export function swipeOffset(dx: number, width: number, can: { complete: boolean; snooze: boolean }): number {
  if ((dx > 0 && !can.complete) || (dx < 0 && !can.snooze)) return 0;
  const t = swipeThreshold(width);
  const abs = Math.abs(dx);
  const eased = abs <= t ? abs : t + (abs - t) * 0.35;
  return Math.sign(dx) * Math.min(eased, width * 0.6);
}

/** What releasing at this offset does. */
export function swipeAction(offset: number, width: number): SwipeAction | null {
  const t = swipeThreshold(width);
  if (offset >= t) return 'complete';
  if (offset <= -t) return 'snooze';
  return null;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
