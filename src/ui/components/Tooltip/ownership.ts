/** Shared ownership for DOM-triggered and map-triggered tooltip portals. */
let activeHide: (() => void) | null = null;

export function claimTooltip(hide: () => void): void {
  activeHide?.();
  activeHide = hide;
}

export function releaseTooltip(hide: () => void): void {
  if (activeHide === hide) activeHide = null;
}
