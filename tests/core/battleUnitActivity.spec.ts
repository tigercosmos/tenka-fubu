import { describe, expect, it } from 'vitest';
import { queryBattleUnitActivity } from '../../src/core/systems/battle';
import { canonicalStringify } from '../../src/core/state/serialize';
import type { TacticId } from '../../src/core/state/ids';
import { buildBattleTranscriptInitialState, MINI_DUEL_LAYOUT_ID } from '../golden/battleTranscript';

/** Synthetic positional cases based on the real tiny battle; not full gameplay-state fixtures. */
function fixture() {
  const { state, battleId } = buildBattleTranscriptInitialState(42, MINI_DUEL_LAYOUT_ID);
  const battle = state.battles[battleId]!;
  const actor = battle.units.find((unit) => unit.side === 'attacker')!;
  const enemy = battle.units.find((unit) => unit.side === 'defender')!;
  actor.jinId = 'a';
  enemy.jinId = 'b';
  battle.edges = [{ a: 'a', b: 'b', moveCost: 3 }];
  return { state, battle, actor, enemy };
}

describe('read-only authoritative battle unit activity', () => {
  it('returns null for missing units and does not mutate canonical state or RNG', () => {
    const f = fixture();
    const before = canonicalStringify(f.state);
    expect(queryBattleUnitActivity(f.battle, 'missing')).toBeNull();
    expect(queryBattleUnitActivity(f.battle, f.actor.id)).toMatchObject({
      active: true,
      depleted: false,
      routed: false,
      exited: false,
      moving: false,
      movementBlockedReason: null,
      moveCost: null,
      destinationAtCapacity: false,
      contactEnemyUnitIds: [f.enemy.id],
    });
    expect(canonicalStringify(f.state)).toBe(before);
  });

  it('uses same-node or actual bidirectional edges for sorted active enemy contact, not attack targets', () => {
    const f = fixture();
    f.actor.attackTargetUnitId = 'nonexistent';
    const same = { ...structuredClone(f.enemy), id: 'enemy.a', jinId: 'a' };
    const distant = { ...structuredClone(f.enemy), id: 'enemy.distant', jinId: 'c' };
    f.battle.units.push(same, distant);
    f.battle.edges = [{ a: 'b', b: 'a', moveCost: 3 }];
    expect(queryBattleUnitActivity(f.battle, f.actor.id)!.contactEnemyUnitIds).toEqual(
      [same.id, f.enemy.id].sort(),
    );
    f.enemy.routed = true;
    same.exited = true;
    distant.jinId = 'a';
    distant.troops = 0;
    expect(queryBattleUnitActivity(f.battle, f.actor.id)!.contactEnemyUnitIds).toEqual([]);
  });

  it('allows simultaneous movement and contact without claiming damage or capacity blockage', () => {
    const f = fixture();
    f.actor.moveTargetJinId = 'b';
    f.battle.units.push(
      { ...structuredClone(f.actor), id: 'friend.a', jinId: 'b' },
      { ...structuredClone(f.actor), id: 'friend.b', jinId: 'b' },
    );
    expect(queryBattleUnitActivity(f.battle, f.actor.id)).toMatchObject({
      moving: true,
      movementBlockedReason: null,
      moveCost: 3,
      destinationAtCapacity: true,
      contactEnemyUnitIds: [f.enemy.id],
    });
    f.battle.units.find((unit) => unit.id === 'friend.a')!.routed = true;
    expect(queryBattleUnitActivity(f.battle, f.actor.id)!.destinationAtCapacity).toBe(false);
  });

  it('matches immobile-before-missing-edge gates and keeps contact independent', () => {
    const f = fixture();
    f.actor.moveTargetJinId = 'missing';
    expect(queryBattleUnitActivity(f.battle, f.actor.id)).toMatchObject({
      moving: false,
      movementBlockedReason: 'missingEdge',
      moveCost: null,
    });
    f.actor.activeTactics.push({
      tacticId: 'tac.hold' as TacticId,
      remainingTicks: 0,
      targetUnitId: null,
    });
    expect(queryBattleUnitActivity(f.battle, f.actor.id)).toMatchObject({
      moving: false,
      movementBlockedReason: 'immobile',
      contactEnemyUnitIds: [f.enemy.id],
    });
    f.actor.moveTargetJinId = 'b';
    expect(queryBattleUnitActivity(f.battle, f.actor.id)!.moveCost).toBe(3);
    f.actor.moveTargetJinId = null;
    expect(queryBattleUnitActivity(f.battle, f.actor.id)!.movementBlockedReason).toBeNull();
  });

  it.each(['depleted', 'routed', 'exited'] as const)(
    'reports %s lifecycle independently and blocks existing intent only',
    (kind) => {
      const f = fixture();
      if (kind === 'depleted') f.actor.troops = 0;
      else f.actor[kind] = true;
      f.actor.moveTargetJinId = 'b';
      expect(queryBattleUnitActivity(f.battle, f.actor.id)).toMatchObject({
        [kind]: true,
        active: false,
        moving: false,
        movementBlockedReason: 'inactive',
        contactEnemyUnitIds: [],
      });
      f.actor.moveTargetJinId = null;
      expect(queryBattleUnitActivity(f.battle, f.actor.id)!.movementBlockedReason).toBeNull();
    },
  );

  it('returns detached fresh facts after in-place authoritative changes', () => {
    const f = fixture();
    const first = queryBattleUnitActivity(f.battle, f.actor.id)!;
    (first.contactEnemyUnitIds as string[]).push('detached');
    f.enemy.jinId = 'far';
    f.actor.moveTargetJinId = 'b';
    const next = queryBattleUnitActivity(f.battle, f.actor.id)!;
    expect(next.contactEnemyUnitIds).toEqual([]);
    expect(next.moving).toBe(true);
    expect(first.moving).toBe(false);
    expect(f.battle.units.some((unit) => unit.id === 'detached')).toBe(false);
  });
});
