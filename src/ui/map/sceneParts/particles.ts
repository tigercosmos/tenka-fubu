import { Container, Graphics } from 'pixi.js';

/** 12 §3.3.7: one shared map-wide pool may never hold more than 128 particles. */
export const PARTICLE_POOL_LIMIT = 128;

export interface LineParticleRequest {
  readonly pos: { readonly x: number; readonly y: number };
  /** World pixels per second. */
  readonly velocity: { readonly x: number; readonly y: number };
  readonly length: number;
  readonly width: number;
  readonly color: number;
  readonly lifetimeMs: number;
}

export interface ParticleSnapshot {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly length: number;
  readonly width: number;
  readonly color: number;
  readonly alpha: number;
}

export interface ParticlePool {
  readonly container: Container;
  readonly capacity: number;
  readonly activeCount: number;
  readonly destroyed: boolean;
  spawn(requests: readonly LineParticleRequest[], atMs: number): number;
  advanceTo(timeMs: number): void;
  snapshot(): readonly ParticleSnapshot[];
  clear(): void;
  destroy(): void;
}

interface ParticleSlot {
  active: boolean;
  bornAtMs: number;
  originX: number;
  originY: number;
  velocityX: number;
  velocityY: number;
  length: number;
  width: number;
  color: number;
  lifetimeMs: number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampCapacity(capacity: number): number {
  return Math.min(PARTICLE_POOL_LIMIT, Math.max(0, Math.floor(finite(capacity))));
}

function emptySlot(): ParticleSlot {
  return {
    active: false,
    bornAtMs: 0,
    originX: 0,
    originY: 0,
    velocityX: 0,
    velocityY: 0,
    length: 0,
    width: 0,
    color: 0,
    lifetimeMs: 0,
  };
}

function frameFor(slot: ParticleSlot, timeMs: number): ParticleSnapshot | null {
  const ageMs = Math.max(0, timeMs - slot.bornAtMs);
  if (!slot.active || ageMs >= slot.lifetimeMs) return null;
  const ageSeconds = ageMs / 1_000;
  return {
    x: slot.originX + slot.velocityX * ageSeconds,
    y: slot.originY + slot.velocityY * ageSeconds,
    velocityX: slot.velocityX,
    velocityY: slot.velocityY,
    length: slot.length,
    width: slot.width,
    color: slot.color,
    alpha: 1 - ageMs / slot.lifetimeMs,
  };
}

class BoundedParticlePool implements ParticlePool {
  readonly container = new Container();
  readonly capacity: number;
  private readonly graphics = new Graphics();
  private readonly slots: ParticleSlot[];
  private timeMs = 0;
  private isDestroyed = false;

  constructor(capacity: number) {
    this.capacity = clampCapacity(capacity);
    this.slots = Array.from({ length: this.capacity }, emptySlot);
    this.container.label = 'particlePool';
    this.container.addChild(this.graphics);
  }

  get activeCount(): number {
    return this.slots.reduce((count, slot) => count + (slot.active ? 1 : 0), 0);
  }

  get destroyed(): boolean {
    return this.isDestroyed;
  }

  spawn(requests: readonly LineParticleRequest[], atMs: number): number {
    if (this.isDestroyed) return 0;
    const bornAtMs = Math.max(0, finite(atMs, this.timeMs));
    if (bornAtMs > this.timeMs) this.advanceTo(bornAtMs);
    let spawned = 0;
    for (const request of requests) {
      const lifetimeMs = Math.max(0, finite(request.lifetimeMs));
      if (lifetimeMs === 0 || bornAtMs + lifetimeMs <= this.timeMs) continue;
      const slot = this.slots.find((candidate) => !candidate.active);
      if (slot === undefined) break;
      slot.active = true;
      slot.bornAtMs = bornAtMs;
      slot.originX = finite(request.pos.x);
      slot.originY = finite(request.pos.y);
      slot.velocityX = finite(request.velocity.x);
      slot.velocityY = finite(request.velocity.y);
      slot.length = Math.max(0, finite(request.length));
      slot.width = Math.max(0, finite(request.width));
      slot.color = request.color;
      slot.lifetimeMs = lifetimeMs;
      spawned += 1;
    }
    this.redraw();
    return spawned;
  }

  advanceTo(timeMs: number): void {
    if (this.isDestroyed) return;
    this.timeMs = Math.max(this.timeMs, Math.max(0, finite(timeMs, this.timeMs)));
    for (const slot of this.slots) {
      if (slot.active && this.timeMs - slot.bornAtMs >= slot.lifetimeMs) slot.active = false;
    }
    this.redraw();
  }

  snapshot(): readonly ParticleSnapshot[] {
    if (this.isDestroyed) return [];
    return this.slots.flatMap((slot) => {
      const frame = frameFor(slot, this.timeMs);
      return frame === null ? [] : [frame];
    });
  }

  clear(): void {
    if (this.isDestroyed) return;
    for (const slot of this.slots) slot.active = false;
    this.graphics.clear();
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.clear();
    this.isDestroyed = true;
    this.container.destroy({ children: true });
  }

  private redraw(): void {
    this.graphics.clear();
    for (const particle of this.snapshot()) {
      const magnitude = Math.hypot(particle.velocityX, particle.velocityY);
      const unitX = magnitude === 0 ? 1 : particle.velocityX / magnitude;
      const unitY = magnitude === 0 ? 0 : particle.velocityY / magnitude;
      this.graphics
        .moveTo(particle.x, particle.y)
        .lineTo(particle.x - unitX * particle.length, particle.y - unitY * particle.length)
        .stroke({ width: particle.width, color: particle.color, alpha: particle.alpha });
    }
  }
}

/** Creates a fixed-slot pool. Requested capacities above 128 are clamped, never expanded. */
export function createParticlePool(capacity = PARTICLE_POOL_LIMIT): ParticlePool {
  return new BoundedParticlePool(capacity);
}

let sharedPool: ParticlePool | null = null;

/** Lazy singleton intended to be mounted once on the map effects layer and shared by all emitters. */
export function getSharedParticlePool(): ParticlePool {
  if (sharedPool === null || sharedPool.destroyed) sharedPool = createParticlePool();
  return sharedPool;
}
