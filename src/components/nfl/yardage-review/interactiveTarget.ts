/**
 * True when a click/keydown originated on a native interactive child (button,
 * link, form control) rather than the row background -- used so a whole-row
 * expand toggle never fires from a click meant for a child control.
 * Deliberately excludes `[role="button"]` -- the row itself carries that role
 * for its own click/keyboard handling, and matching it here would make every
 * click on the row look like a click on an "interactive child".
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input, select, textarea") != null;
}
