import { describe, expect, it } from 'vitest';
import type { BattleState, BattleUnit } from '@core/state/gameState';
import {
  projectBattleView,
  placeBattleUnitsGlobally,
  UI_BATTLE_GEOMETRY as G,
  type BattleView,
} from './battleViewModel';

function assertGlobalFit(view: BattleView): void {
  const parts = [...view.nodes, ...view.units];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!,
      box = part.hitBox;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height);
    expect(box.width).toBeGreaterThanOrEqual(32);
    expect(box.height).toBeGreaterThanOrEqual(32);
    expect(box.x).toBeLessThanOrEqual(part.glyphBox.x);
    expect(box.y).toBeLessThanOrEqual(part.glyphBox.y);
    expect(box.x + box.width).toBeGreaterThanOrEqual(part.glyphBox.x + part.glyphBox.width);
    expect(box.y + box.height).toBeGreaterThanOrEqual(part.glyphBox.y + part.glyphBox.height);
    for (let j = i + 1; j < parts.length; j++) {
      const other = parts[j]!.hitBox;
      expect(
        box.x < other.x + other.width &&
          other.x < box.x + box.width &&
          box.y < other.y + other.height &&
          other.y < box.y + box.height,
      ).toBe(false);
    }
  }
}

/** Synthetic presentation grid, not an invariant-validated gameplay/historical battle. */
function denseFixture(count: number, moving = false): BattleState {
  const battle = fixture();
  battle.jins = Array.from({ length: 15 }, (_, i) => ({
    ...battle.jins[0]!,
    id: `jin.${i}`,
    col: i % 5,
    row: Math.floor(i / 5),
  }));
  battle.edges = [{ a: 'jin.6', b: 'jin.7', moveCost: 2 }];
  battle.units = Array.from({ length: count }, (_, i) => ({
    ...battle.units[0]!,
    id: `bu.${i.toString().padStart(2, '0')}`,
    side: i % 2 ? 'defender' : 'attacker',
    jinId: i < count / 2 ? 'jin.6' : 'jin.7',
    moveTargetJinId: moving ? (i < count / 2 ? 'jin.7' : 'jin.6') : null,
    moveProgress: moving ? 1 : 0,
    routed: i === 0,
  }));
  return battle;
}

/** Synthetic tactical-only fixture: tests presentation, not battle setup or historical facts. */
function fixture(): BattleState {
  const unit = (id: string, overrides: Partial<BattleUnit> = {}): BattleUnit => ({
    id,
    armyId: 'army.test' as BattleUnit['armyId'],
    side: 'attacker',
    generalId: 'off.test' as BattleUnit['generalId'],
    troops: 3000,
    battleInitialTroops: 3000,
    morale: 80,
    jinId: 'jin.a',
    moveTargetJinId: null,
    moveProgress: 0,
    attackTargetUnitId: null,
    activeTactics: [],
    tacticCooldowns: {},
    delegated: false,
    routed: false,
    exited: false,
    strategyStatus: 'engaged',
    ...overrides,
  });
  return {
    id: 'battle.test' as BattleState['id'],
    fieldCombatId: 'fc.test',
    nodeId: 'castle.test' as BattleState['nodeId'],
    terrain: 'plain',
    attackerClanId: 'clan.a' as BattleState['attackerClanId'],
    defenderClanId: 'clan.b' as BattleState['defenderClanId'],
    tick: 0,
    saihai: { attacker: 10, defender: 10 },
    honjinFallenTick: null,
    result: null,
    jins: [
      {
        id: 'jin.b',
        col: 4,
        row: 2,
        owner: 'defender',
        isHonjin: true,
        flagPower: 100,
        flagPowerMax: 100,
        defenseBonus: 0.2,
      },
      {
        id: 'jin.a',
        col: 0,
        row: 0,
        owner: 'attacker',
        isHonjin: false,
        flagPower: 40,
        flagPowerMax: 100,
        defenseBonus: 0.1,
      },
    ],
    edges: [{ a: 'jin.b', b: 'jin.a', moveCost: 2 }],
    units: [unit('bu.b', { side: 'defender', jinId: 'jin.b' }), unit('bu.a')],
  };
}

describe('pure tactical projection', () => {
  it.each([0.8, 1, 1.5])(
    'reserves all nodes and neighboring 8/12-unit groups globally at scale %s',
    (scale) => {
      for (const [width, height] of [
        [678, 444],
        [920, 444],
        [1280, 804],
      ]) {
        for (const count of [8, 12]) {
          for (const moving of [false, true]) {
            const battle = denseFixture(count, moving),
              original = JSON.stringify(battle);
            const view = projectBattleView(battle, width!, height!, scale, 'bu.00');
            assertGlobalFit(view);
            expect(view.units).toHaveLength(count);
            expect(view.units[0]).toMatchObject({ routed: true, selected: true });
            if (moving) {
              const from = view.nodes.find((n) => n.id === 'jin.6')!,
                to = view.nodes.find((n) => n.id === 'jin.7')!;
              for (const unit of view.units) {
                expect(unit.anchorX).toBeCloseTo((from.x + to.x) / 2);
                expect(unit.anchorY).toBeCloseTo(from.y);
              }
            }
            expect(
              projectBattleView(
                {
                  ...battle,
                  units: [...battle.units].reverse(),
                  jins: [...battle.jins].reverse(),
                  edges: [...battle.edges].reverse(),
                },
                width!,
                height!,
                scale,
                'bu.00',
              ),
            ).toEqual(view);
            expect(JSON.stringify(battle)).toBe(original);
          }
        }
      }
    },
  );
  it('has a complete distinct-slot fallback rather than stranding late units after local placement', () => {
    // Deliberately above the runtime12-participant cap, to stress the bounded fallback grid.
    const battle = denseFixture(27);
    const view = projectBattleView(battle, 678, 444, 1.5, null);
    expect(view.units).toHaveLength(27);
    assertGlobalFit(view);
    // Deliberate three-slot algorithm fixture: first local box consumes two grid slots.
    // Greedy uses the third slot for unit2, strands unit3, then complete reset must use all slots.
    const preferred = view.units.slice(0, 3).map((unit) => ({
      ...unit,
      x: 40,
      y: 20,
      glyphBox: { x: 20, y: 0, width: 40, height: 40 },
      hitBox: { x: 20, y: 0, width: 40, height: 40 },
    }));
    const slots = [0, 44, 88].map((x) => ({
      x: x + 20,
      y: 20,
      glyphBox: { x, y: 0, width: 40, height: 40 },
      hitBox: { x, y: 0, width: 40, height: 40 },
    }));
    const placed = placeBattleUnitsGlobally(preferred, [], slots);
    expect(placed.map((unit) => unit.hitBox.x).sort((a, b) => a - b)).toEqual([0, 44, 88]);
    expect(placed.map((unit) => unit.anchorX)).toEqual(preferred.map((unit) => unit.anchorX));
  });
  it('retains capacity for all12 participants at every supported scale step and sampled aspect range', () => {
    const dimensions = [
      [678, 444],
      [1920, 444],
      [678, 1000],
      ...Array.from({ length: 12 }, (_, i) => [
        678 + (i * (1920 - 678)) / 11,
        444 + (i * (1000 - 444)) / 11,
      ]),
    ];
    for (let step = 0; step <= 14; step++) {
      const scale = 0.8 + step * 0.05;
      for (const [width, height] of dimensions) {
        const view = projectBattleView(denseFixture(12, true), width!, height!, scale, null);
        expect(view.units).toHaveLength(12);
        assertGlobalFit(view);
      }
    }
  });
  it('retains only authored edges, exact ownership/state, sorted IDs and detached coordinates', () => {
    const battle = fixture(),
      original = JSON.stringify(battle);
    const view = projectBattleView(battle, 800, 500, 1, 'bu.a');
    expect(view.nodes.map((n) => n.id)).toEqual(['jin.a', 'jin.b']);
    expect(view.units.map((u) => u.id)).toEqual(['bu.a', 'bu.b']);
    expect(view.edges).toHaveLength(1);
    expect(view.edges[0]).toEqual({
      a: 'jin.b',
      b: 'jin.a',
      from: { x: 740, y: 448 },
      to: { x: 60, y: 112 },
      moveCost: 2,
    });
    expect(view.nodes[1]).toMatchObject({ isHonjin: true, owner: 'defender', defenseBonus: 0.2 });
    expect(view.units[0]).toMatchObject({ selected: true, troops: 3000, morale: 80 });
    expect(JSON.stringify(battle)).toBe(original);
    battle.jins[0]!.flagPower = 5;
    expect(view.nodes[1]!.flagPower).toBe(100);
  });
  it.each([-1, 0, 1, 2, 3])(
    'uses clamped authoritative movement progress %i on either edge direction',
    (progress) => {
      const battle = fixture();
      battle.units = [
        { ...battle.units[0]!, jinId: 'jin.b', moveTargetJinId: 'jin.a', moveProgress: progress },
      ];
      const view = projectBattleView(battle, 800, 500, 1, null);
      const fraction = Math.max(0, Math.min(1, progress / 2));
      expect(view.units[0]!.x).toBeCloseTo(740 + (60 - 740) * fraction);
      expect(view.units[0]!.anchorX).toBeCloseTo(740 + (60 - 740) * fraction);
      expect(view.units[0]!.anchorY).toBeCloseTo(448 + (112 - 448) * fraction);
      expect(view.units[0]!.y).toBeCloseTo(448 + (112 - 448) * fraction - G.unitOffsetY);
    },
  );
  it('does not invent edges/positions, hides exited/zero troops and keeps routed survivors distinguished', () => {
    const battle = fixture();
    battle.units = [
      { ...battle.units[0]!, id: 'bu.exited', exited: true },
      { ...battle.units[0]!, id: 'bu.dead', troops: 0 },
      { ...battle.units[0]!, id: 'bu.missing', jinId: 'missing' },
      {
        ...battle.units[1]!,
        id: 'bu.routed',
        routed: true,
        moveTargetJinId: 'jin.b',
        moveProgress: 1,
      },
    ];
    battle.edges = [{ a: 'jin.a', b: 'missing', moveCost: 1 }];
    const view = projectBattleView(battle, 800, 500, 1, null);
    expect(view.edges).toEqual([]);
    expect(view.units).toHaveLength(1);
    expect(view.units[0]).toMatchObject({ id: 'bu.routed', routed: true, x: 60, y: 50 });
  });
  it.each([0.8, 1, 1.5])(
    'fits a synthetic narrow center and deterministic dense stacks at scale %s',
    (scale) => {
      const battle = fixture();
      battle.units = Array.from({ length: 6 }, (_, i) => ({
        ...battle.units[1]!,
        id: `bu.${5 - i}`,
        troops: 10000 + i,
      }));
      const view = projectBattleView(battle, 380, 444, scale, null);
      const reordered = {
        ...battle,
        units: [...battle.units].reverse(),
        jins: [...battle.jins].reverse(),
      };
      expect(projectBattleView(reordered, 380, 444, scale, null)).toEqual(view);
      for (const part of [...view.units, ...view.nodes]) {
        for (const box of [part.glyphBox, part.hitBox]) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(380);
          expect(box.y + box.height).toBeLessThanOrEqual(444);
        }
        expect(part.hitBox.width).toBeGreaterThanOrEqual(32);
        expect(part.hitBox.height).toBeGreaterThanOrEqual(32);
      }
    },
  );
  it.each([0.8, 1, 1.5])(
    'keeps complete three-row glyph bands disjoint at supported 678x444 scale %s',
    (scale) => {
      const battle = fixture();
      battle.jins = Array.from({ length: 3 }, (_, row) => ({
        ...battle.jins[0]!,
        id: `jin.${row}`,
        col: 2,
        row,
      }));
      battle.units = battle.jins.flatMap((jin, row) =>
        Array.from({ length: 4 }, (_, i) => ({
          ...battle.units[0]!,
          id: `bu.${row}.${i}`,
          jinId: jin.id,
        })),
      );
      const view = projectBattleView(battle, 678, 444, scale, null);
      const parts = [...view.nodes, ...view.units];
      const overlaps = (a: (typeof parts)[number]['hitBox'], b: typeof a) =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      for (let i = 0; i < parts.length; i++) {
        const box = parts[i]!.hitBox;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(678);
        expect(box.y + box.height).toBeLessThanOrEqual(444);
        for (let j = i + 1; j < parts.length; j++)
          expect(overlaps(box, parts[j]!.hitBox)).toBe(false);
      }
      expect(view.uiScale).toBe(scale);
      expect(view.glyphScale).toBeCloseTo(Math.min(scale, 444 / 476));
    },
  );
  it('handles an unmeasured host without nonfinite positions', () => {
    const view = projectBattleView(fixture(), Number.NaN, -1, Number.NaN, null);
    expect(view).toMatchObject({ width: 0, height: 0, uiScale: 1 });
    expect(view.units.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y))).toBe(true);
  });
});
