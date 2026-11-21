/**
 * Automix queue position (pure, tested): items before `cursor` have been played and stay in the
 * list (shown dimmed), so the queue never seems to vanish. Edits keep the cursor on the same item.
 */

/** cursor after removing the item at `index` */
export function cursorAfterRemove(cursor: number, index: number): number {
  return index < cursor ? cursor - 1 : cursor;
}

/** cursor after moving an item from `from` to `to` */
export function cursorAfterMove(cursor: number, from: number, to: number): number {
  if (from < cursor && to >= cursor) return cursor - 1; // a played item moved into the upcoming part
  if (from >= cursor && to < cursor) return cursor + 1; // an upcoming item moved into the played part
  return cursor;
}
