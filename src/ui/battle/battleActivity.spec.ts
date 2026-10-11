import { describe, expect, it } from 'vitest';
import type { BattleUnitActivity } from '@app/battleBridge';
import { formatBattleActivity } from './battleActivity';

function activity(overrides: Partial<BattleUnitActivity> = {}): BattleUnitActivity {
  return {
    unitId: 'bu.test',
    active: true,
    depleted: false,
    routed: false,
    exited: false,
    contactEnemyUnitIds: [],
    moveTargetJinId: null,
    moving: false,
    movementBlockedReason: null,
    moveCost: null,
    destinationAtCapacity: false,
    ...overrides,
  };
}
describe('battle activity presentation', () => {
  it('separates terminal lifecycle states with exited then depleted then routed priority', () => {
    expect(
      formatBattleActivity(activity({ exited: true, depleted: true, routed: true })).map(
        (x) => x.kind,
      ),
    ).toEqual(['exited']);
    expect(
      formatBattleActivity(activity({ depleted: true, routed: true })).map((x) => x.kind),
    ).toEqual(['depleted']);
    expect(formatBattleActivity(activity({ routed: true })).map((x) => x.kind)).toEqual(['routed']);
    expect(formatBattleActivity(null)).toEqual([]);
  });
  it('shows independent contact and movement, not destination capacity as a movement block', () => {
    const input = activity({
      contactEnemyUnitIds: ['enemy'],
      moveTargetJinId: 'next',
      moving: true,
      moveCost: 2,
      destinationAtCapacity: true,
    });
    const before = structuredClone(input);
    expect(formatBattleActivity(input).map((x) => x.kind)).toEqual(['contact', 'moving']);
    expect(formatBattleActivity(input)[0]?.description).toContain('不代表已造成傷害');
    expect(input).toEqual(before);
  });
  it('does not mistake a retained target for movement under an immobile tactic or invalid edge', () => {
    expect(
      formatBattleActivity(
        activity({
          moveTargetJinId: 'next',
          movementBlockedReason: 'immobile',
          contactEnemyUnitIds: ['enemy'],
        }),
      ).map((x) => x.kind),
    ).toEqual(['contact', 'immobile']);
    expect(
      formatBattleActivity(
        activity({ moveTargetJinId: 'missing', movementBlockedReason: 'missingEdge' }),
      ).map((x) => x.kind),
    ).toEqual(['missingEdge']);
    expect(formatBattleActivity(activity()).map((x) => x.kind)).toEqual(['idle']);
  });
});
