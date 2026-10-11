/** Keep occupancy independent of the revised geography paint stroke.
 * The existing two-pixel halo occupied this envelope; thinner paint cannot
 * admit an earlier district that then evicts an already visible road label.
 */
export function geographicDeclutterEnvelope(
  anchor: { x: number; y: number },
  gap: number,
  width: number,
  height: number,
  haloWidth: number,
) {
  const padding = Math.max(0, 2 - haloWidth);
  return {
    x: anchor.x - (width + padding) / 2,
    y: anchor.y + gap,
    width: width + padding,
    height: height + padding,
  };
}
