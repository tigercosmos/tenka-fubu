import { Container, Graphics } from 'pixi.js';
import type { AweLevel } from '@core/state/enums';
import type { ScenePart } from '@ui/components/types';
import { clanColorNum, TOKENS, TOKENS_NUM } from '@ui/styles/tokens';

export type VisibleAweLevel = Exclude<AweLevel, 'none'>;

export const AWE_SHOCKWAVE_TIMING = {
  durationMs: TOKENS.duration.awe,
  secondRingDelayMs: 150,
  thirdRingDelayMs: 300,
  districtDelayMs: 300,
  districtDurationMs: 300,
  largeFlashDurationMs: 120,
  reducedDurationMs: 600,
} as const;

export const AWE_SHOCKWAVE_GEOMETRY = {
  startRadius: 8,
  mainStartWidth: 4,
  echoStartWidth: 2,
  endWidth: 1,
  affectedNodeRadius: 7,
} as const;

export interface AweAffectedNode {
  readonly pos: { readonly x: number; readonly y: number };
  readonly colorIndex: number;
}

export interface AweShockwaveProps {
  readonly pos: { readonly x: number; readonly y: number };
  /** Visual radius supplied by the event/view model; the UI must not recalculate it. */
  readonly impactRadius: number;
  readonly level: VisibleAweLevel;
  /** Milliseconds since this effect was triggered. */
  readonly elapsedMs: number;
  readonly affectedNodes: readonly AweAffectedNode[];
  readonly reduceMotion: boolean;
  /** Full-screen rectangle expressed in this effect container's local coordinate system. */
  readonly flashBounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface AweRingFrame {
  readonly radius: number;
  readonly width: number;
  readonly alpha: number;
}

export interface AweShockwaveFrame {
  readonly rings: readonly AweRingFrame[];
  readonly affectedNodeProgress: number | null;
  readonly screenFlashAlpha: number;
  readonly complete: boolean;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutQuad(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) * (1 - t);
}

function ringAt(
  elapsedMs: number,
  delayMs: number,
  impactRadius: number,
  startWidth: number,
  startAlpha: number,
): AweRingFrame | null {
  const localMs = elapsedMs - delayMs;
  const durationMs = AWE_SHOCKWAVE_TIMING.durationMs - delayMs;
  if (localMs < 0 || localMs >= durationMs) return null;
  const progress = clamp01(localMs / durationMs);
  const radiusProgress = easeOutQuad(progress);
  return {
    radius:
      AWE_SHOCKWAVE_GEOMETRY.startRadius +
      (Math.max(AWE_SHOCKWAVE_GEOMETRY.startRadius, impactRadius) -
        AWE_SHOCKWAVE_GEOMETRY.startRadius) *
        radiusProgress,
    width: startWidth + (AWE_SHOCKWAVE_GEOMETRY.endWidth - startWidth) * progress,
    alpha: startAlpha * (1 - progress),
  };
}

export function aweShockwaveFrame(props: AweShockwaveProps): AweShockwaveFrame {
  const elapsedMs = Math.max(0, props.elapsedMs);
  if (props.reduceMotion) {
    const active = elapsedMs < AWE_SHOCKWAVE_TIMING.reducedDurationMs;
    return {
      rings: active
        ? [
            {
              radius: AWE_SHOCKWAVE_GEOMETRY.startRadius,
              width: AWE_SHOCKWAVE_GEOMETRY.mainStartWidth,
              alpha: 0.9,
            },
          ]
        : [],
      affectedNodeProgress: active
        ? clamp01(elapsedMs / AWE_SHOCKWAVE_TIMING.reducedDurationMs)
        : null,
      screenFlashAlpha: 0,
      complete: !active,
    };
  }

  const rings = [ringAt(elapsedMs, 0, props.impactRadius, 4, 0.9)];
  rings.push(
    ringAt(
      elapsedMs,
      AWE_SHOCKWAVE_TIMING.secondRingDelayMs,
      props.impactRadius,
      AWE_SHOCKWAVE_GEOMETRY.echoStartWidth,
      0.6,
    ),
  );
  if (props.level === 'large') {
    rings.push(
      ringAt(
        elapsedMs,
        AWE_SHOCKWAVE_TIMING.thirdRingDelayMs,
        props.impactRadius,
        AWE_SHOCKWAVE_GEOMETRY.echoStartWidth,
        0.6,
      ),
    );
  }
  const districtLocalMs = elapsedMs - AWE_SHOCKWAVE_TIMING.districtDelayMs;
  const affectedNodeProgress =
    districtLocalMs >= 0 && districtLocalMs < AWE_SHOCKWAVE_TIMING.districtDurationMs
      ? clamp01(districtLocalMs / AWE_SHOCKWAVE_TIMING.districtDurationMs)
      : null;
  return {
    rings: rings.filter((ring): ring is AweRingFrame => ring !== null),
    affectedNodeProgress,
    screenFlashAlpha:
      props.level === 'large' && elapsedMs < AWE_SHOCKWAVE_TIMING.largeFlashDurationMs ? 0.04 : 0,
    complete: elapsedMs >= AWE_SHOCKWAVE_TIMING.durationMs,
  };
}

function interpolateColor(from: number, to: number, progress: number): number {
  const t = clamp01(progress);
  const channel = (shift: number): number =>
    Math.round(((from >> shift) & 0xff) + (((to >> shift) & 0xff) - ((from >> shift) & 0xff)) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export function drawAweShockwave(g: Graphics, props: AweShockwaveProps): void {
  g.clear();
  const frame = aweShockwaveFrame(props);
  for (const ring of frame.rings) {
    g.circle(0, 0, ring.radius).stroke({
      width: ring.width,
      color: TOKENS_NUM.accentGold,
      alpha: ring.alpha,
    });
  }
  if (frame.affectedNodeProgress !== null) {
    for (const node of props.affectedNodes) {
      g.circle(
        node.pos.x - props.pos.x,
        node.pos.y - props.pos.y,
        AWE_SHOCKWAVE_GEOMETRY.affectedNodeRadius,
      ).fill({
        color: interpolateColor(
          TOKENS_NUM.washi100,
          clanColorNum(node.colorIndex),
          frame.affectedNodeProgress,
        ),
      });
    }
  }
  if (frame.screenFlashAlpha > 0 && props.flashBounds !== undefined) {
    g.rect(
      props.flashBounds.x,
      props.flashBounds.y,
      props.flashBounds.width,
      props.flashBounds.height,
    ).fill({ color: TOKENS_NUM.washi100, alpha: frame.screenFlashAlpha });
  }
}

function sameProps(a: AweShockwaveProps, b: AweShockwaveProps): boolean {
  if (
    a.pos.x !== b.pos.x ||
    a.pos.y !== b.pos.y ||
    a.impactRadius !== b.impactRadius ||
    a.level !== b.level ||
    a.elapsedMs !== b.elapsedMs ||
    a.reduceMotion !== b.reduceMotion ||
    a.affectedNodes.length !== b.affectedNodes.length ||
    a.flashBounds?.x !== b.flashBounds?.x ||
    a.flashBounds?.y !== b.flashBounds?.y ||
    a.flashBounds?.width !== b.flashBounds?.width ||
    a.flashBounds?.height !== b.flashBounds?.height
  ) {
    return false;
  }
  return a.affectedNodes.every(
    (node, index) =>
      node.pos.x === b.affectedNodes[index]?.pos.x &&
      node.pos.y === b.affectedNodes[index]?.pos.y &&
      node.colorIndex === b.affectedNodes[index]?.colorIndex,
  );
}

export function createAweShockwave(): ScenePart<AweShockwaveProps> {
  const container = new Container();
  const graphics = new Graphics();
  container.label = 'aweShockwave';
  container.addChild(graphics);
  let last: AweShockwaveProps | null = null;

  return {
    container,
    update(props): void {
      if (last === null || last.pos.x !== props.pos.x || last.pos.y !== props.pos.y) {
        container.position.set(props.pos.x, props.pos.y);
      }
      if (last === null || !sameProps(last, props)) drawAweShockwave(graphics, props);
      last = props;
    },
    destroy(): void {
      if (!container.destroyed) container.destroy({ children: true });
    },
  };
}
