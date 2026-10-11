import { Container, Graphics } from 'pixi.js';
import type { SiegeMode } from '@core/state/enums';
import { TOKENS_NUM } from '@ui/styles/tokens';

export interface SiegeMarkerProps {
  pos: { x: number; y: number };
  mode: SiegeMode;
  elapsedMs?: number;
  reducedMotion?: boolean;
}

export const SIEGE_MARKER_GEOMETRY = {
  radius: 24,
  arcDegrees: 70,
  width: 1.6,
  groundY: 4,
  groundAspect: 0.36,
  arcSteps: 18,
} as const;

function groundArc(g: Graphics, start: number, end: number): void {
  const { radius, groundY, groundAspect, arcSteps, width } = SIEGE_MARKER_GEOMETRY;
  g.moveTo(Math.cos(start) * radius, groundY + Math.sin(start) * radius * groundAspect);
  for (let step = 1; step <= arcSteps; step += 1) {
    const angle = start + ((end - start) * step) / arcSteps;
    g.lineTo(Math.cos(angle) * radius, groundY + Math.sin(angle) * radius * groundAspect);
  }
  g.stroke({ width, color: TOKENS_NUM.accentVermilionBright, alpha: 0.8 });
}

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
      groundArc(g, start, start + sweep);
    } else {
      const mid = start + sweep * 0.45;
      groundArc(g, start, mid);
      groundArc(g, mid + sweep * 0.18, start + sweep);
    }
  }
}

export function createSiegeMarker(): {
  container: Container;
  update: (props: SiegeMarkerProps) => void;
} {
  const container = new Container();
  container.label = 'siegeGround';
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
