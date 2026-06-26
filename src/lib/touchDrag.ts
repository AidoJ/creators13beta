/**
 * Shared touch-drag presentation layer.
 *
 * HTML5 drag-and-drop doesn't fire on iOS Safari / iPad, so PlayerHand and
 * BoardHexPiece roll their own pointer-event drag. The MECHANICS work, but
 * the user sees nothing under their finger — no ghost, no drop-target
 * highlight. This module fixes the rendering:
 *
 *  - `startTouchDragGhost(source, x, y)` clones the dragged element and
 *    positions it `fixed` under the finger.
 *  - `updateTouchDragGhost(x, y)` repositions the ghost AND scans for a
 *    `[data-legal-drop="true"]` element under the pointer, toggling
 *    `data-touch-over` on the current target (so CSS can light it up).
 *  - `endTouchDragGhost()` removes the ghost + clears any hover state.
 */

let ghostEl: HTMLElement | null = null;
let ghostOffsetX = 0;
let ghostOffsetY = 0;
let currentHover: HTMLElement | null = null;

export function startTouchDragGhost(
  source: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  endTouchDragGhost();
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = "0";
  clone.style.pointerEvents = "none";
  clone.style.opacity = "0.85";
  clone.style.transform = "scale(1.05)";
  clone.style.transformOrigin = "center center";
  clone.style.transition = "none";
  clone.style.zIndex = "9999";
  clone.style.filter = "drop-shadow(0 8px 18px rgba(0,0,0,0.45))";
  clone.setAttribute("aria-hidden", "true");
  // Strip any IDs to avoid duplicates in the DOM.
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  document.body.appendChild(clone);
  ghostEl = clone;
  ghostOffsetX = clientX - rect.left;
  ghostOffsetY = clientY - rect.top;
  updateTouchDragGhost(clientX, clientY);
}

export function updateTouchDragGhost(clientX: number, clientY: number): void {
  if (ghostEl) {
    ghostEl.style.left = `${clientX - ghostOffsetX}px`;
    ghostEl.style.top = `${clientY - ghostOffsetY}px`;
  }
  // Hide the ghost briefly so elementFromPoint sees what's UNDER the finger.
  const prevVis = ghostEl?.style.visibility;
  if (ghostEl) ghostEl.style.visibility = "hidden";
  const under = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (ghostEl) ghostEl.style.visibility = prevVis ?? "";
  const target = under?.closest('[data-legal-drop="true"]') as HTMLElement | null;
  if (target !== currentHover) {
    currentHover?.removeAttribute("data-touch-over");
    target?.setAttribute("data-touch-over", "true");
    currentHover = target;
  }
}

export function endTouchDragGhost(): void {
  ghostEl?.remove();
  ghostEl = null;
  currentHover?.removeAttribute("data-touch-over");
  currentHover = null;
}
