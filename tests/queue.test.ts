import { describe, expect, it } from 'vitest';
import { cursorAfterMove, cursorAfterRemove } from '../src/library/queue';

describe('automix queue position', () => {
  it('keeps pointing at the same next item when items are removed', () => {
    expect(cursorAfterRemove(3, 0)).toBe(2); // a played item removed
    expect(cursorAfterRemove(3, 3)).toBe(3); // the next item removed: the one after it is next
    expect(cursorAfterRemove(3, 5)).toBe(3);
    expect(cursorAfterRemove(0, 0)).toBe(0);
  });

  it('keeps pointing at the same next item when items are moved', () => {
    // queue a b c | d e  (cursor 3 → d is next)
    expect(cursorAfterMove(3, 0, 4)).toBe(2); // a moved after e: b c | d e a
    expect(cursorAfterMove(3, 4, 0)).toBe(4); // e moved to the top: e a b c | d
    expect(cursorAfterMove(3, 3, 4)).toBe(3); // d and e swapped: e is next now
    expect(cursorAfterMove(3, 0, 1)).toBe(3); // played items reordered
  });
});
