import { describe, expect, it } from 'vitest';
import { TOKENS_NUM } from '@ui/styles/tokens';
import {
  BATTLE_SPARK_GEOMETRY,
  BATTLE_SPARK_TIMING,
  createBattleSpark,
  drawBattleSparkIcon,
  makeBattleSparkParticles,
} from '@ui/map/sceneParts/battleSpark';
import { createParticlePool } from '@ui/map/sceneParts/particles';
import { makeRec } from './recordingGraphics';

describe('BattleSpark geometry（12 §3.3.7）', () => {
  it('建立 8 條 4–8px、1.5px 寬、30–60px/s 且金／朱紅各半的粒子', () => {
    const particles = makeBattleSparkParticles({ x: 10, y: 20 }, () => 0.5);
    expect(particles).toHaveLength(BATTLE_SPARK_GEOMETRY.particleCount);
    expect(particles.every((particle) => particle.length === 6)).toBe(true);
    expect(particles.every((particle) => particle.width === 1.5)).toBe(true);
    expect(particles.every((particle) => particle.lifetimeMs === 400)).toBe(true);
    expect(
      particles.every((particle) => Math.hypot(particle.velocity.x, particle.velocity.y) === 45),
    ).toBe(true);
    expect(particles.filter((particle) => particle.color === TOKENS_NUM.accentGold)).toHaveLength(
      4,
    );
    expect(
      particles.filter((particle) => particle.color === TOKENS_NUM.accentVermilionBright),
    ).toHaveLength(4);
  });

  it('交戰點上方畫 16×16 ink900 交叉雙刀與 washi halo', () => {
    const { rec, g } = makeRec();
    drawBattleSparkIcon(g);
    expect(rec.calls[0]?.[0]).toBe('clear');
    const strokes = rec.argsOf('stroke').map((args) => args[0]);
    expect(strokes).toEqual([
      { width: 5, color: TOKENS_NUM.washi100 },
      { width: 2, color: TOKENS_NUM.ink900 },
    ]);
    const points = [...rec.argsOf('moveTo'), ...rec.argsOf('lineTo')].flat() as number[];
    expect(Math.max(...points.filter((_, index) => index % 2 === 0))).toBe(8);
    expect(Math.min(...points.filter((_, index) => index % 2 === 0))).toBe(-8);
  });
});

describe('createBattleSpark timing and cleanup', () => {
  it('建立時立即迸發，之後每 900ms 再迸發；粒子在 400ms 線性消失', () => {
    const pool = createParticlePool();
    const part = createBattleSpark({ particlePool: pool, random: () => 0.5 });

    part.update({ pos: { x: 10, y: 20 }, timeMs: 100, reduceMotion: false });
    expect(pool.activeCount).toBe(8);
    pool.advanceTo(499);
    expect(pool.activeCount).toBe(8);
    expect(pool.snapshot()[0]?.alpha).toBeCloseTo(0.0025, 10);
    part.update({ pos: { x: 10, y: 20 }, timeMs: 500, reduceMotion: false });
    expect(pool.activeCount).toBe(0);
    part.update({ pos: { x: 10, y: 20 }, timeMs: 999, reduceMotion: false });
    expect(pool.activeCount).toBe(0);
    part.update({ pos: { x: 10, y: 20 }, timeMs: 1_000, reduceMotion: false });
    expect(pool.activeCount).toBe(8);

    part.destroy();
    pool.destroy();
  });

  it('reduce-motion 恆顯雙刀圖示但完全不要求粒子', () => {
    const pool = createParticlePool();
    const part = createBattleSpark({ particlePool: pool, random: () => 0.5 });
    part.update({ pos: { x: 7, y: 9 }, timeMs: 0, reduceMotion: true });
    part.update({ pos: { x: 7, y: 9 }, timeMs: 1_800, reduceMotion: true });

    expect(part.container.children).toHaveLength(1);
    expect(part.container.position.x).toBe(7);
    expect(part.container.position.y).toBe(9);
    expect(pool.activeCount).toBe(0);
    part.destroy();
    pool.destroy();
  });

  it('尊重共用池剩餘容量，銷毀後不再排入新粒子', () => {
    const pool = createParticlePool(4);
    const part = createBattleSpark({ particlePool: pool, random: () => 0.5 });
    part.update({ pos: { x: 0, y: 0 }, timeMs: 0, reduceMotion: false });
    expect(pool.activeCount).toBe(4);

    part.destroy();
    expect(part.container.destroyed).toBe(true);
    pool.advanceTo(BATTLE_SPARK_TIMING.intervalMs);
    expect(pool.activeCount).toBe(0);
    part.update({ pos: { x: 0, y: 0 }, timeMs: 1_800, reduceMotion: false });
    expect(pool.activeCount).toBe(0);
    expect(() => part.destroy()).not.toThrow();
    pool.destroy();
  });
});
