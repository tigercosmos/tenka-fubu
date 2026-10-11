import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  advanceBattleTick,
  type BattleCommand,
  type BattleTickEvent,
} from '../../src/core/systems/battle';
import { canonicalStringify } from '../../src/core/state/serialize';
import type { TacticId, TraitId } from '../../src/core/state/ids';
import { buildBattleTranscriptInitialState, MINI_DUEL_LAYOUT_ID } from '../golden/battleTranscript';

/** Controlled executing-stage fixtures built from the real tiny tactical setup, not historical data. */
function fixture(contact = false) {
  const { state, battleId } = buildBattleTranscriptInitialState(42, MINI_DUEL_LAYOUT_ID);
  const battle = state.battles[battleId]!;
  const actor = battle.units.find((unit) => unit.side === 'attacker')!;
  const target = battle.units.find((unit) => unit.side === 'defender')!;
  const own = battle.jins.find((jin) => jin.isHonjin && jin.col === 0)!;
  const enemy = battle.jins.find((jin) => jin.isHonjin && jin.col === 4)!;
  actor.jinId = own.id;
  target.jinId = contact ? own.id : enemy.id;
  // Isolate stages deliberately; this modified layout is not claimed as generated/full-state valid.
  battle.edges = [];
  battle.saihai = { attacker: 100, defender: 100 };
  return { state, battleId, battle, actor, target, own, enemy };
}
const tactic = (unitId: string, id: string, targetUnitId: string | null = null): BattleCommand => ({
  kind: 'tactic',
  unitId,
  tacticId: id as TacticId,
  targetUnitId,
});

describe('authoritative transient battle tick events', () => {
  it('emits no invented progress on a tick with no executing outcomes', () => {
    const f = fixture();
    const result = advanceBattleTick(f.state, f.battleId);
    expect(result.tick).toBe(1);
    expect(result.events).toEqual([]);
  });
  it('records actual accepted buff even without instant troop/morale changes; invalid tactics emit nothing', () => {
    const f = fixture();
    const result = advanceBattleTick(f.state, f.battleId, [tactic(f.actor.id, 'tac.charge')]);
    expect(result.events).toEqual([
      {
        type: 'tactic.accepted',
        sequence: 1,
        unitId: f.actor.id,
        tacticId: 'tac.charge',
        targetUnitId: null,
        damageDealt: 0,
        troopsHealed: 0,
        moraleGained: 0,
      },
    ]);
    expect(f.actor.activeTactics.some((active) => active.tacticId === 'tac.charge')).toBe(true);
    const invalid = advanceBattleTick(f.state, f.battleId, [
      tactic(f.actor.id, 'tac.charge'),
      tactic(f.actor.id, 'tac.unknown'),
      tactic('missing', 'tac.charge'),
    ]);
    expect(invalid.events).toEqual([]);
  });
  it('uses actual tactic return values and exact troop/morale deltas, not a tick-loss proxy', () => {
    const f = fixture(true);
    f.state.officers[f.actor.generalId]!.traits.push(
      'trait.gunshin' as TraitId,
      'trait.iryou' as TraitId,
    );
    f.actor.troops -= 200;
    f.actor.morale = 60;
    const before = f.actor.troops;
    const result = advanceBattleTick(f.state, f.battleId, [
      tactic(f.actor.id, 'tac.heal'),
      tactic(f.actor.id, 'tac.inspire'),
      tactic(f.actor.id, 'tac.volley', f.target.id),
    ]);
    const accepted = result.events.filter(
      (event): event is Extract<BattleTickEvent, { type: 'tactic.accepted' }> =>
        event.type === 'tactic.accepted' && event.unitId === f.actor.id,
    );
    expect(accepted.map((event) => event.tacticId)).toEqual([
      'tac.heal',
      'tac.inspire',
      'tac.volley',
    ]);
    expect(accepted[0]).toMatchObject({
      troopsHealed: Math.min(200, Math.floor(f.actor.battleInitialTroops * BAL.tacHealRatio)),
    });
    expect(accepted[1]).toMatchObject({ moraleGained: 15 });
    expect(accepted[2]!.damageDealt).toBeGreaterThan(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'unit.changed',
        unitId: f.actor.id,
        source: 'tactic',
        troopsBefore: before,
        troopsAfter: before + accepted[0]!.troopsHealed,
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'unit.changed',
        unitId: f.actor.id,
        source: 'tactic',
        moraleBefore: 60,
        moraleAfter: 75,
      }),
    );
    const volleyDelta = result.events.find(
      (event) =>
        event.type === 'unit.changed' && event.source === 'tactic' && event.unitId === f.target.id,
    )!;
    expect(volleyDelta.type).toBe('unit.changed');
    if (volleyDelta.type === 'unit.changed')
      expect(volleyDelta.troopsBefore - volleyDelta.troopsAfter).toBe(accepted[2]!.damageDealt);
    expect(
      result.events.some((event) => event.type === 'unit.changed' && event.source === 'combat'),
    ).toBe(true);
    for (const event of result.events.filter((event) => event.type === 'unit.changed'))
      expect('attackerId' in event).toBe(false);
  });
  it('records command acceptance and only completed actual movement, not in-progress/blocked arrival', () => {
    const f = fixture(),
      middle = f.battle.jins.find((jin) => !jin.isHonjin)!;
    f.battle.edges = [{ a: f.own.id, b: middle.id, moveCost: 2 }];
    const first = advanceBattleTick(f.state, f.battleId, [
      { kind: 'move', unitId: f.actor.id, targetJinId: middle.id },
      { kind: 'move', unitId: f.target.id, targetJinId: 'missing' },
    ]);
    expect(first.events.filter((event) => event.type === 'move.accepted')).toHaveLength(1);
    expect(first.events.some((event) => event.type === 'unit.arrived')).toBe(false);
    const second = advanceBattleTick(f.state, f.battleId);
    expect(second.events).toContainEqual(
      expect.objectContaining({
        type: 'unit.arrived',
        unitId: f.actor.id,
        fromJinId: f.own.id,
        toJinId: middle.id,
        reason: 'move',
      }),
    );
    expect(f.actor.jinId).toBe(middle.id);
  });
  it('does not report arrival when two same-side occupants block the completed move', () => {
    const f = fixture(),
      middle = f.battle.jins.find((jin) => !jin.isHonjin)!;
    f.battle.edges = [{ a: f.own.id, b: middle.id, moveCost: 1 }];
    // Controlled stage-only blockers; shared army reference is not a full gameplay fixture.
    f.battle.units.push(
      ...Array.from({ length: BAL.jinStackLimit }, (_, i) => ({
        ...structuredClone(f.actor),
        id: `bu.blocker.${i}`,
        jinId: middle.id,
      })),
    );
    const result = advanceBattleTick(f.state, f.battleId, [
      { kind: 'move', unitId: f.actor.id, targetJinId: middle.id },
    ]);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'move.accepted',
        unitId: f.actor.id,
        targetJinId: middle.id,
      }),
    );
    expect(
      result.events.some((event) => event.type === 'unit.arrived' && event.unitId === f.actor.id),
    ).toBe(false);
    expect(f.actor.jinId).toBe(f.own.id);
    expect(f.actor.moveTargetJinId).toBeNull();
    expect(f.actor.moveProgress).toBe(0);
  });
  it('reports routing, exit, and one final authoritative winner', () => {
    const f = fixture();
    f.target.morale = BAL.moraleBreakThreshold;
    const result = advanceBattleTick(f.state, f.battleId);
    expect(result.events.map((event) => event.type)).toEqual([
      'unit.routed',
      'unit.exited',
      'battle.resolved',
    ]);
    expect(result.events.at(-1)).toMatchObject({
      winnerSide: 'attacker',
      attackerLosses: f.battle.result!.attackerLosses,
      defenderLosses: f.battle.result!.defenderLosses,
      aweLevel: f.battle.result!.aweLevel,
    });
    expect(() => advanceBattleTick(f.state, f.battleId)).toThrow();
    expect(result.events.filter((event) => event.type === 'battle.resolved')).toHaveLength(1);
  });
  it('records retreat arrival and exact pursuit loss without inventing pursuer attribution', () => {
    const f = fixture(),
      middle = f.battle.jins.find((jin) => !jin.isHonjin)!;
    f.actor.routed = true;
    f.actor.jinId = middle.id;
    f.target.jinId = f.own.id;
    // Hold prevents the canonical NPC movement decision from leaving the pursuit destination.
    f.target.activeTactics = [
      { tacticId: 'tac.hold' as TacticId, remainingTicks: 2, targetUnitId: null },
    ];
    f.battle.edges = [{ a: middle.id, b: f.own.id, moveCost: 1 }];
    const before = f.actor.troops;
    const result = advanceBattleTick(f.state, f.battleId);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'unit.arrived',
        unitId: f.actor.id,
        reason: 'retreat',
        fromJinId: middle.id,
        toJinId: f.own.id,
      }),
    );
    const pursuit = result.events.find(
      (event) => event.type === 'unit.changed' && event.source === 'pursuit',
    );
    expect(pursuit).toMatchObject({
      unitId: f.actor.id,
      troopsBefore: before,
      troopsAfter: f.actor.troops,
    });
    expect(f.actor.troops).toBeLessThan(before);
  });
  it('records exact flag loss separately from ownership capture/reset, including fire arrows', () => {
    const f = fixture(),
      middle = f.battle.jins.find((jin) => !jin.isHonjin)!;
    f.actor.jinId = middle.id;
    middle.owner = 'neutral';
    middle.flagPower = 1;
    const result = advanceBattleTick(f.state, f.battleId);
    const loss = result.events.find((event) => event.type === 'flag.damaged');
    expect(loss).toMatchObject({
      jinId: middle.id,
      source: 'occupation',
      flagPowerBefore: 1,
      amount: f.actor.troops * BAL.flagCaptureRate,
      flagPowerAfter: 1 - f.actor.troops * BAL.flagCaptureRate,
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'jin.captured',
        jinId: middle.id,
        ownerBefore: 'neutral',
        ownerAfter: 'attacker',
        flagPower: middle.flagPowerMax * BAL.flagResetRatio,
      }),
    );
    const fire = fixture(true);
    fire.state.officers[fire.actor.generalId]!.traits.push('trait.hizeme' as TraitId);
    fire.own.owner = 'defender';
    fire.own.flagPower = 1;
    const fired = advanceBattleTick(fire.state, fire.battleId, [
      tactic(fire.actor.id, 'tac.fire-arrow', fire.target.id),
    ]);
    expect(fired.events).toContainEqual(
      expect.objectContaining({
        type: 'flag.damaged',
        source: 'fireArrow',
        amount: BAL.tacFireFlagDamage,
        flagPowerBefore: 1,
        flagPowerAfter: 1 - BAL.tacFireFlagDamage,
      }),
    );
    expect(fired.events.some((event) => event.type === 'jin.captured')).toBe(true);
  });
  it('reports only actual delegation changes and legal attack assignments in pipeline order', () => {
    const f = fixture(true);
    const result = advanceBattleTick(f.state, f.battleId, [
      { kind: 'toggleDelegate', unitId: f.actor.id, enabled: false },
      { kind: 'attack', unitId: f.actor.id, targetUnitId: f.target.id },
      { kind: 'attack', unitId: f.actor.id, targetUnitId: 'missing' },
    ]);
    expect(result.events[0]).toMatchObject({
      type: 'attack.accepted',
      unitId: f.actor.id,
      targetUnitId: f.target.id,
    });
    expect(result.events.some((event) => event.type === 'delegation.changed')).toBe(false);
    const changed = advanceBattleTick(f.state, f.battleId, [
      { kind: 'toggleDelegate', unitId: f.actor.id, enabled: true },
    ]);
    expect(changed.events[0]).toMatchObject({
      type: 'delegation.changed',
      unitId: f.actor.id,
      enabled: true,
    });
  });
  it('is replay-deterministic, sequential, detached, and absent from state/save/deferred events', () => {
    const left = fixture(true),
      right = structuredClone(left.state);
    const orders = [tactic(left.actor.id, 'tac.charge')];
    const result = advanceBattleTick(left.state, left.battleId, orders);
    const replay = advanceBattleTick(right, left.battleId, orders);
    expect(replay).toEqual(result);
    expect(canonicalStringify(right)).toBe(canonicalStringify(left.state));
    expect(right.rng).toEqual(left.state.rng);
    expect(result.events.map((event) => event.sequence)).toEqual(
      result.events.map((_, i) => i + 1),
    );
    const saved = canonicalStringify(left.state),
      detached = result.events as unknown as { type: string }[];
    detached[0]!.type = 'tampered';
    expect(canonicalStringify(left.state)).toBe(saved);
    expect('events' in left.battle).toBe(false);
    expect(left.state.meta.deferredEvents).toEqual([]);
    expect(
      result.events.every((event) =>
        Object.values(event).every((value) => value === null || typeof value !== 'object'),
      ),
    ).toBe(true);
  });
});
