/**
 * Shared registry for admin panels that have unsaved local edits.
 *
 * A panel calls `registerDirtyGetter(fn)` from a useEffect; `fn` returns a
 * non-empty message when the panel has unsaved changes, otherwise null.
 *
 * The Admin shell calls `getDirtyMessage()` before switching tabs or
 * unloading the page, and confirms with the user before discarding.
 */

type DirtyGetter = () => string | null;

const getters = new Set<DirtyGetter>();

export function registerDirtyGetter(fn: DirtyGetter): () => void {
  getters.add(fn);
  return () => {
    getters.delete(fn);
  };
}

/** First non-null message wins. Returns null when nothing is dirty. */
export function getDirtyMessage(): string | null {
  for (const g of getters) {
    try {
      const m = g();
      if (m) return m;
    } catch {
      // Ignore — a broken getter shouldn't block navigation.
    }
  }
  return null;
}

/**
 * Confirm before performing `action` if any panel is dirty. Returns true if
 * the action should proceed (nothing dirty, or user confirmed).
 */
export function confirmDiscardIfDirty(): boolean {
  const msg = getDirtyMessage();
  if (!msg) return true;
  return window.confirm(`${msg}\n\nDiscard changes and continue?`);
}
