import { Container, Graphics } from 'pixi.js';
import type { SiegeMode } from '@core/state/enums';
import { TOKENS_NUM } from '@ui/styles/tokens';

export interface SiegeMarkerProps {
  pos: { x: number; y: number };
  mode: SiegeMode;
  elapsedMs?: number;
  reducedMotion?: boolean;
}

export const SIEGE_MARKER_GEOMETRY = { radius: 24, arcDegrees: 70, width: 3 } as const;

export function siegeRotation(mode: SiegeMode, elapsedMs: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  const period = mode === 'assault' ? 4_000 : 8_000;
  return ((elapsedMs % period) / period) * Math.PI * 2;
}

export function drawSiegeMarker(g: Graphics, props: SiegeMarkerProps): void {
  g.clear();
  const rotation = siegeRotation(props.mode, props.elapsedMs ?? 0, props.reducedMotion);
  const sweep = (SIEGE_MARKER_GEOMETRY.arcDegrees * Math.PI) / 180;
  for (let index = 0; index < 3; index += 1) {
    const start = rotation + (index * Math.PI * 2) / 3;
    if (props.mode === 'assault') {
      g.arc(0, 0, SIEGE_MARKER_GEOMETRY.radius, start, start + sweep).stroke({
        width: SIEGE_MARKER_GEOMETRY.width,
        color: TOKENS_NUM.accentVermilionBright,
      });
    } else {
      const mid = start + sweep * 0.45;
      g.arc(0, 0, SIEGE_MARKER_GEOMETRY.radius, start, mid).stroke({
        width: SIEGE_MARKER_GEOMETRY.width,
        color: TOKENS_NUM.accentVermilionBright,
      });
      g.arc(0, 0, SIEGE_MARKER_GEOMETRY.radius, mid + sweep * 0.18, start + sweep).stroke({
        width: SIEGE_MARKER_GEOMETRY.width,
        color: TOKENS_NUM.accentVermilionBright,
      });
    }
  }
}

export function createSiegeMarker(): {
  container: Container;
  update: (props: SiegeMarkerProps) => void;
} {
  const container = new Container();
  const graphics = new Graphics();
  container.addChild(graphics);
  return {
    container,
    update(props) {
      container.position.set(props.pos.x, props.pos.y);
      drawSiegeMarker(graphics, props);
    },
  };
}
