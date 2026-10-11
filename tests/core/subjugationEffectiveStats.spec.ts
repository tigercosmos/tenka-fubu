import { expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import type { Command } from '../../src/core/commands/types';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { RoadEdgeId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_B1X,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

function tick(state: ReturnType<typeof buildTinyState>, command?: Command) {
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  if (command) {
    expect(validateCommand(state, command)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day);
  }
  const result = advanceDay(state, queue.drain());
  expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(validateState(state)).toEqual([]);
  return result;
}

it.each([
  [79, 0],
  [79, 1],
  [80, 0],
])('subjugates through a real queued march with leadership %s + %s', (base, growth) => {
  const state = buildTinyState();
  // Controlled valid corridor and pre-existing officer ability metadata. Neither
  // armies nor conquered ownership are injected; the normal tick creates both.
  const road = 'road.effective-subjugation' as RoadEdgeId;
  state.roads[road] = { id: road, a: CASTLE_A1, b: DIST_B1X, type: 'land', grade: 1, baseDays: 1 };
  const officer = state.officers[OFF_ALPHA_LORD]!;
  officer.ldr = base;
  officer.statGrowth.ldr = growth;
  officer.traits = [];
  expect(validateState(state)).toEqual([]);
  const district = state.districts[DIST_B1X]!;
  const effective = Math.min(BAL.abilityMax, base + growth);
  const required = Math.max(
    BAL.subjugateDaysMin,
    Math.min(
      BAL.subjugateDaysMax,
      BAL.subjugateDaysBase +
        Math.floor(district.kokudaka / BAL.subjugateKokuPerExtraDay) -
        (effective >= BAL.subjugateLdrBonusThreshold ? 1 : 0),
    ),
  );
  const decoded = decodeSave(encodeSave(state, 42));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  const restored = decoded.saveFile.state;
  const march: Command = {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 100,
    food: 100,
    targetNodeId: DIST_B1X,
  };
  expect(tick(restored, march).events).toEqual(tick(state, march).events);
  for (let day = 0; day < 8 && district.subjugation === null; day++) {
    expect(tick(restored).events).toEqual(tick(state).events);
  }
  expect(district.subjugation).not.toBeNull();
  expect(district.subjugation!.daysRequired).toBe(required);
  expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_BETA);
  expect(encodeSave(restored, 42)).toBe(encodeSave(state, 42));
  let conquered = false;
  for (let day = 0; day < required + 2 && district.ownerClanId !== CLAN_ALPHA; day++) {
    const result = tick(state);
    expect(tick(restored).events).toEqual(result.events);
    conquered ||= result.events.some(
      (event) => event.type === 'district.subjugated' && event.districtId === DIST_B1X,
    );
    expect(encodeSave(restored, 42)).toBe(encodeSave(state, 42));
    expect(restored.rng).toEqual(state.rng);
  }
  expect(conquered).toBe(true);
  expect(district.ownerClanId).toBe(CLAN_ALPHA);
  expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_BETA);
  expect(officer.ldr).toBe(base);
  expect(officer.statGrowth.ldr).toBe(growth);
});
