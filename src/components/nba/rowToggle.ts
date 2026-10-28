import type { KeyboardEvent, MouseEvent } from "react";

/**
 * Whole-row expansion for the props table and the opponent game groups.
 *
 * A click anywhere on the row toggles it, except where it lands on something that has its own job: a button (other than the
 * row's own chevron, which carries `data-row-toggle`), a link, a field, a label, or text the viewer is selecting. Enter and
 * Space toggle when the row itself has focus; a key pressed on a control inside the row is that control's, not the row's.
 */
const OWN_CONTROLS = 'button, a[href], input, select, textarea, label, summary, [role="button"], [role="link"], [role="checkbox"], [contenteditable="true"], [data-row-toggle-ignore]';

function isSelectingText(row: HTMLElement): boolean {
  const selection = typeof window === "undefined" ? null : window.getSelection();
  return selection !== null && !selection.isCollapsed && selection.anchorNode !== null && row.contains(selection.anchorNode);
}

export function shouldToggleFromClick(event: MouseEvent<HTMLElement>): boolean {
  const row = event.currentTarget;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const control = target.closest(OWN_CONTROLS);
  if (control !== null && row.contains(control) && control !== row && !control.hasAttribute("data-row-toggle")) return false;
  return !isSelectingText(row);
}

/** Handlers for a focusable `<tr>`; spread them on the row together with `tabIndex={0}`. */
export function rowToggleHandlers(onToggle: () => void): { onClick: (event: MouseEvent<HTMLElement>) => void; onKeyDown: (event: KeyboardEvent<HTMLElement>) => void } {
  return {
    onClick: (event) => {
      if (shouldToggleFromClick(event)) onToggle();
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget || event.repeat) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle();
      }
    },
  };
}

export const ROW_FOCUS = "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500";
