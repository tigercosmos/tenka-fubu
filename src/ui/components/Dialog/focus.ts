const lastOwnedFocus = new WeakMap<HTMLElement, HTMLElement>();
const preferredFocus = new WeakMap<HTMLElement, HTMLElement>();

function safeFocusTarget(el: HTMLElement): boolean {
  if (
    !el.isConnected ||
    el.matches(':disabled') ||
    el.closest('[hidden],[inert],[aria-hidden="true"]')
  )
    return false;
  for (let node: HTMLElement | null = el; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    )
      return false;
  }
  return true;
}
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button,[href],input,select,textarea,[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => safeFocusTarget(el) && !(el.hasAttribute('tabindex') && el.tabIndex < 0));
}
function topDialog(exclude?: HTMLElement): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-ui-dialog]'))
    .filter((node) => node !== exclude)
    .at(-1);
}
export function acquireFocus(
  root: HTMLElement,
  preferred?: HTMLElement | null,
  rememberPreferred = true,
): void {
  if (rememberPreferred) {
    if (preferred && root.contains(preferred)) preferredFocus.set(root, preferred);
    else preferredFocus.delete(root);
  }
  if (topDialog() !== root || !safeFocusTarget(root)) return;
  const target =
    preferred && root.contains(preferred) && safeFocusTarget(preferred)
      ? preferred
      : (focusables(root)[0] ?? root);
  target.focus();
}
export function recordOwnedFocus(root: HTMLElement, target: EventTarget): void {
  // React portal events may bubble through a lower owner, but its DOM does not own them.
  if (target instanceof HTMLElement && root.contains(target) && document.activeElement === target)
    lastOwnedFocus.set(root, target);
}
export function restoreFocus(closing: HTMLElement | null, previous: HTMLElement | null): void {
  const owner = topDialog(closing ?? undefined);
  if (owner) {
    const active = document.activeElement;
    // A lower dialog closing must not override focus already owned by the remaining top dialog.
    if (active instanceof HTMLElement && owner.contains(active) && safeFocusTarget(active)) return;
    const priorTarget =
      previous && owner.contains(previous) && safeFocusTarget(previous) ? previous : null;
    const ownedTarget = lastOwnedFocus.get(owner);
    const preferredTarget = preferredFocus.get(owner);
    acquireFocus(
      owner,
      priorTarget ??
        (ownedTarget && safeFocusTarget(ownedTarget) ? ownedTarget : null) ??
        (preferredTarget && safeFocusTarget(preferredTarget) ? preferredTarget : null),
      false,
    );
  } else if (previous && safeFocusTarget(previous)) previous.focus();
}
/** Reacquire the current modal owner after an external inert shield is removed. No clocks or stores. */
export function recoverDialogFocus(previous: HTMLElement | null): void {
  restoreFocus(null, previous);
}
