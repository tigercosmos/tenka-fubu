/** CSS-pixel framing for explicit navigation; never changes camera state itself. */
export interface FocusViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FocusDomRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function visible(rect: FocusDomRect | undefined): rect is FocusDomRect {
  return (
    rect !== undefined &&
    [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

/** DOM bounds are global CSS coordinates; output is relative to the full map canvas. */
export function measuredFocusViewport(
  canvas: FocusDomRect,
  hud: {
    top?: FocusDomRect | undefined;
    left?: FocusDomRect | undefined;
    bottom?: FocusDomRect | undefined;
    right?: readonly FocusDomRect[] | undefined;
  },
): FocusViewport | null {
  if (!visible(canvas)) return null;
  const gap = 12;
  const intersects = (rect: FocusDomRect): boolean =>
    rect.left < canvas.left + canvas.width &&
    rect.left + rect.width > canvas.left &&
    rect.top < canvas.top + canvas.height &&
    rect.top + rect.height > canvas.top;
  const eligible = (rect: FocusDomRect | undefined): rect is FocusDomRect =>
    visible(rect) && intersects(rect);
  const x = eligible(hud.left)
    ? Math.max(0, hud.left.left + hud.left.width - canvas.left + gap)
    : 0;
  const y = eligible(hud.top) ? Math.max(0, hud.top.top + hud.top.height - canvas.top + gap) : 0;
  const bottom = eligible(hud.bottom)
    ? Math.min(canvas.height, hud.bottom.top - canvas.top - gap)
    : canvas.height;
  let right = canvas.width;
  for (const rect of hud.right ?? []) {
    if (eligible(rect)) right = Math.min(right, rect.left - canvas.left - gap);
  }
  return validFocusViewport(
    { x, y, width: right - x, height: bottom - y },
    canvas.width,
    canvas.height,
  );
}

export function validFocusViewport(
  rect: FocusViewport | null | undefined,
  width: number,
  height: number,
): FocusViewport | null {
  if (
    rect == null ||
    ![rect.x, rect.y, rect.width, rect.height, width, height].every(Number.isFinite) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x + rect.width > width ||
    rect.y + rect.height > height
  )
    return null;
  return { ...rect };
}

/** Divide by the final focus zoom, not the zoom at the beginning of the animation. */
export function hudFocusTarget(
  target: { x: number; y: number },
  canvas: { width: number; height: number },
  rect: FocusViewport | null,
  finalScale: number,
): { x: number; y: number } {
  const safe = validFocusViewport(rect, canvas.width, canvas.height);
  if (safe === null || !Number.isFinite(finalScale) || finalScale <= 0) return { ...target };
  return {
    x: target.x + (canvas.width / 2 - safe.x - safe.width / 2) / finalScale,
    y: target.y + (canvas.height / 2 - safe.y - safe.height / 2) / finalScale,
  };
}
