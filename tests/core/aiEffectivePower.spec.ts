import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { estArmyPower, estCastlePower } from '../../src/core/systems/ai/shared';
import { computeThreatCache } from '../../src/core/systems/ai/threat';
import type { TraitId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function fixture(base = 90, growth = 3) {
  const state = buildTinyState();
  const officer = state.officers[OFF_BETA_LORD]!;
  officer.ldr = base;
  officer.statGrowth.ldr = growth;
  officer.traits = ['trait.gunshin' as TraitId];
  const command = {
    type: 'march' as const,
    clanId: CLAN_BETA,
    originCastleId: CASTLE_B1,
    leaderId: OFF_BETA_LORD,
    deputyIds: [],
    soldiers: 200,
    food: 100,
    targetNodeId: CASTLE_A2,
  };
  const authority = { kind: 'clan' as const, clanId: CLAN_BETA };
  expect(validateCommand(state, command, authority)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day, authority);
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
  expect(validateState(state)).toEqual([]);
  return { state, army: Object.values(state.armies)[0]!, castle: state.castles[CASTLE_B1]! };
}

describe('AI cheap-power ordinary effective leadership', () => {
  it.each([
    [90, 3],
    [BAL.abilityMax - 2, BAL.statGrowthCap],
    [BAL.abilityMax, BAL.statGrowthCap],
  ] as const)(
    'reads capped base%s+growth%s, not Gunshin or the combat damage formula',
    (base, growth) => {
      const { state, army, castle } = fixture(base, growth);
      const before = canonicalStringify(state);
      const ldr = Math.min(BAL.abilityMax, base + growth);
      expect(estArmyPower(state, army)).toBe(
        army.soldiers * (1 + ldr / BAL.aiPowerLdrDivisor) * (army.morale / 100),
      );
      expect(estCastlePower(state, castle)).toBe(
        castle.soldiers * (1 + ldr / BAL.aiPowerLdrDivisor) * (castle.morale / 100),
      );
      expect(estCastlePower(state, castle, 123)).toBe(
        123 * (1 + ldr / BAL.aiPowerLdrDivisor) * (castle.morale / 100),
      );
      expect(estCastlePower(state, castle, 0)).toBe(0);
      expect(canonicalStringify(state)).toBe(before);
      state.officers[OFF_BETA_LORD]!.traits = [];
      expect(estArmyPower(state, army)).toBe(
        army.soldiers * (1 + ldr / BAL.aiPowerLdrDivisor) * (army.morale / 100),
      );
    },
  );

  it('uses grown ordinary lord leadership independently of the army estimate', () => {
    const { state, castle } = fixture(90, 3);
    expect(estCastlePower(state, castle)).toBe(
      castle.soldiers * (1 + 93 / BAL.aiPowerLdrDivisor) * (castle.morale / 100),
    );
  });

  it('preserves no-lord and missing-officer zero-leadership fallback without writes', () => {
    const { state, army, castle } = fixture();
    castle.lordId = null;
    expect(validateState(state)).toEqual([]);
    expect(estCastlePower(state, castle)).toBe(castle.soldiers * (castle.morale / 100));
    // Deliberately incomplete read-only diagnostic input: not a valid campaign state.
    const missing = structuredClone(state);
    delete missing.officers[OFF_BETA_LORD];
    const before = canonicalStringify(missing);
    expect(estArmyPower(missing, army)).toBe(army.soldiers * (army.morale / 100));
    expect(estCastlePower(missing, { ...castle, lordId: OFF_BETA_LORD })).toBe(
      castle.soldiers * (castle.morale / 100),
    );
    expect(canonicalStringify(missing)).toBe(before);
  });

  it('feeds capped grown leadership from a legal queued army into the real border-threat calculation', () => {
    const { state, army, castle } = fixture(BAL.abilityMax - 2, BAL.statGrowthCap);
    const before = canonicalStringify(state);
    const cache = computeThreatCache(state, CLAN_ALPHA);
    const entry = cache.entries.find((item) => item.enemyClanId === CLAN_BETA)!;
    expect(entry).toBeDefined();
    const factor = 1 + BAL.abilityMax / BAL.aiPowerLdrDivisor;
    expect(entry.borderPowerEnemy).toBe(
      castle.soldiers * factor * (castle.morale / 100) +
        army.soldiers * factor * (army.morale / 100),
    );
    expect(canonicalStringify(state)).toBe(before);
    expect(validateState(state)).toEqual([]);
  });

  it('preserves native codec power and threat results, with no state or RNG mutation', () => {
    const { state, army, castle } = fixture();
    const decoded = decodeSave(encodeSave(state, 0));
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    const before = canonicalStringify(state);
    expect(estArmyPower(restored, restored.armies[army.id]!)).toBe(estArmyPower(state, army));
    expect(estCastlePower(restored, restored.castles[castle.id]!)).toBe(
      estCastlePower(state, castle),
    );
    expect(computeThreatCache(restored, CLAN_ALPHA)).toEqual(computeThreatCache(state, CLAN_ALPHA));
    expect(canonicalStringify(restored)).toBe(before);
    expect(canonicalStringify(state)).toBe(before);
    expect(validateState(restored)).toEqual([]);
  });
});
