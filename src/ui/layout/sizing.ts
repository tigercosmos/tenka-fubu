/** Public numeric UI dimensions are logical pixels at a 16px baseline, never world coordinates. */
export function logicalPxToRem(pixels: number): string {
  return `${pixels / 16}rem`;
}

export function scaledUiPixels(pixels: number, uiScale: number): number {
  return pixels * uiScale;
}

/** Canvas buffers stay logical-size; pointer coordinates must account for actual CSS layout scaling. */
export function canvasLogicalPoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  logicalSize: number,
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) * logicalSize) / (rect.width > 0 ? rect.width : logicalSize),
    y: ((clientY - rect.top) * logicalSize) / (rect.height > 0 ? rect.height : logicalSize),
  };
}
