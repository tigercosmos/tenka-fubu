import { Container, Graphics } from 'pixi.js';
import type { ScenePart } from '@ui/components/types';
import { TOKENS_NUM } from '@ui/styles/tokens';
import { getSharedParticlePool, type LineParticleRequest, type ParticlePool } from './particles';

export const BATTLE_SPARK_TIMING = {
  intervalMs: 900,
  lifetimeMs: 400,
} as const;

export const BATTLE_SPARK_GEOMETRY = {
  particleCount: 8,
  particleLengthMin: 4,
  particleLengthMax: 8,
  particleWidth: 1.5,
  particleSpeedMin: 30,
  particleSpeedMax: 60,
  iconSize: 16,
  iconOffsetY: -16,
} as const;

export interface BattleSparkProps {
  readonly pos: { readonly x: number; readonly y: number };
  /** Shared, monotonic scene clock in milliseconds. */
  readonly timeMs: number;
  readonly reduceMotion: boolean;
}

export type RandomSource = () => number;

export interface BattleSparkPart extends ScenePart<BattleSparkProps> {
  readonly particlePool: ParticlePool;
}

function randomUnit(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}

function between(min: number, max: number, random: RandomSource): number {
  return min + (max - min) * randomUnit(random);
}

export function makeBattleSparkParticles(
  pos: BattleSparkProps['pos'],
  random: RandomSource,
): LineParticleRequest[] {
  return Array.from({ length: BATTLE_SPARK_GEOMETRY.particleCount }, (_, index) => {
    const angle = randomUnit(random) * Math.PI * 2;
    const speed = between(
      BATTLE_SPARK_GEOMETRY.particleSpeedMin,
      BATTLE_SPARK_GEOMETRY.particleSpeedMax,
      random,
    );
    return {
      pos,
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      length: between(
        BATTLE_SPARK_GEOMETRY.particleLengthMin,
        BATTLE_SPARK_GEOMETRY.particleLengthMax,
        random,
      ),
      width: BATTLE_SPARK_GEOMETRY.particleWidth,
      color: index % 2 === 0 ? TOKENS_NUM.accentGold : TOKENS_NUM.accentVermilionBright,
      lifetimeMs: BATTLE_SPARK_TIMING.lifetimeMs,
    };
  });
}

/** Static 16x16 crossed-sword icon, centered 16 world pixels above the engagement point. */
export function drawBattleSparkIcon(g: Graphics): void {
  const half = BATTLE_SPARK_GEOMETRY.iconSize / 2;
  const centerY = BATTLE_SPARK_GEOMETRY.iconOffsetY;
  const drawCross = (width: number, color: number): void => {
    g.moveTo(-half, centerY - half)
      .lineTo(half, centerY + half)
      .moveTo(half, centerY - half)
      .lineTo(-half, centerY + half)
      .stroke({ width, color });
  };
  g.clear();
  drawCross(5, TOKENS_NUM.washi100);
  drawCross(2, TOKENS_NUM.ink900);
}

export function createBattleSpark(
  options: {
    readonly particlePool?: ParticlePool;
    readonly random?: RandomSource;
  } = {},
): BattleSparkPart {
  const particlePool = options.particlePool ?? getSharedParticlePool();
  const random = options.random ?? Math.random;
  const container = new Container();
  const icon = new Graphics();
  container.label = 'battleSpark';
  container.addChild(icon);
  drawBattleSparkIcon(icon);

  let nextBurstAtMs: number | null = null;
  let lastTimeMs: number | null = null;
  let destroyed = false;

  return {
    container,
    particlePool,
    update(props): void {
      if (destroyed) return;
      const timeMs = Math.max(0, Number.isFinite(props.timeMs) ? props.timeMs : 0);
      container.position.set(props.pos.x, props.pos.y);
      if (lastTimeMs !== null && timeMs < lastTimeMs) nextBurstAtMs = null;
      lastTimeMs = timeMs;

      if (props.reduceMotion) {
        nextBurstAtMs = null;
        particlePool.advanceTo(timeMs);
        return;
      }

      if (nextBurstAtMs === null) nextBurstAtMs = timeMs;
      while (nextBurstAtMs <= timeMs) {
        particlePool.advanceTo(nextBurstAtMs);
        particlePool.spawn(makeBattleSparkParticles(props.pos, random), nextBurstAtMs);
        nextBurstAtMs += BATTLE_SPARK_TIMING.intervalMs;
      }
      particlePool.advanceTo(timeMs);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      container.destroy({ children: true });
    },
  };
}
