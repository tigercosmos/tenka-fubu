import { describe, expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems';
import { validateState } from '../../src/core/state/invariants';
import type { CommandEnvelope } from '../../src/core/commands/types';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import type { ArmyId, DistrictId } from '../../src/core/state/ids';
import { buildMiniState, CASTLE_B2, CLAN_ALPHA } from '../fixtures/mini';
import recordedCommands from '../replay/cases/m4-military-siege-fall.tfulog.json';

describe('cooperative district subjugation full-tick lifecycle', () => {
  it('resumes an explicit non-auto-return route after a same-clan army completes the district', () => {
    // Actual checked-in command trajectory: two formations, a physical mid-edge
    // retarget, and explicit auto-return=false; no injected army or capture.
    const log = recordedCommands as CommandLogFile;
    const state = buildMiniState({ seed: log.seed });
    const armyId = 'army.000001' as ArmyId;
    const districtId = 'dist.b2x' as DistrictId;
    let seq = state.meta.lastAppliedCmdSeq + 1;
    for (let day = 1; day <= 12; day += 1) {
      const queue: CommandEnvelope[] = log.entries
        .filter((entry) => entry.day === day)
        .map((entry) => ({
          seq: seq++,
          issuedDay: state.time.day,
          command: structuredClone(entry.command),
        }));
      const result = advanceDay(state, queue);
      expect(validateState(state), `day ${day}`).toEqual([]);
      expect(result.appliedCommands, `day ${day}`).toHaveLength(queue.length);
      if (day === 7) {
        expect(state.districts[districtId]!.ownerClanId).toBe(CLAN_ALPHA);
        expect(state.districts[districtId]!.subjugation).toBeNull();
        expect(state.armies[armyId]).toMatchObject({
          posNodeId: districtId,
          status: 'subjugating',
          autoReturn: false,
          targetNodeId: CASTLE_B2,
        });
      }
      if (day === 8) {
        expect(state.armies[armyId]).toMatchObject({
          status: 'marching',
          mission: 'conquer',
          autoReturn: false,
          targetNodeId: CASTLE_B2,
        });
        expect(result.events.some((event) => event.type === 'army.returned')).toBe(false);
      }
    }
    expect(state.armies[armyId]!.status).toBe('sieging');
    const siege = Object.values(state.sieges).find((item) => item.castleId === CASTLE_B2)!;
    expect(siege.attackerArmyIds).toContain(armyId);
    expect(siege.attackerArmyIds).toHaveLength(2);
    expect(siege.mode).toBe('encircle');
  });
});
