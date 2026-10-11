import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import type { GameState } from '../../src/core/state/gameState';
import { advanceBattleTick } from '../../src/core/systems/battle';
import { stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import { buildBattleTranscriptInitialState, type BattleTranscriptFile } from './battleTranscript';

const proofRoot = new URL('../../docs/validation/2026-10-12/golden-provenance/', import.meta.url);
interface TacticalProof {
  sourceArchiveSha256: string;
  initial: { old: GameState };
  ticks: Array<{
    tick: number;
    oldState: GameState;
    oldResult: ReturnType<typeof advanceBattleTick>;
  }>;
}
function upgrade(recorded: GameState): GameState {
  const expected = structuredClone(recorded);
  expect(expected.meta.saveVersion).toBe(3);
  expected.meta.saveVersion = 4;
  expect(Object.keys(expected.clans).sort()).toEqual(['clan.alpha', 'clan.beta']);
  for (const clan of Object.values(expected.clans)) {
    expect(Object.hasOwn(clan, 'rewardGoldSpentThisMonth')).toBe(false);
    clan.rewardGoldSpentThisMonth = 0;
  }
  for (const combat of Object.values(expected.fieldCombats)) {
    for (const side of [combat.sideA, combat.sideB]) {
      expect(side.participation).toBeUndefined();
      side.participation = {
        complete: true,
        participants: side.armyIds.map((id) => {
          const army = expected.armies[id]!;
          return {
            armyId: army.id,
            clanId: army.clanId,
            leaderId: army.leaderId,
            deputyIds: [...army.deputyIds],
          };
        }),
      };
    }
  }
  const battle = Object.values(expected.battles)[0]!;
  if (battle.result) {
    expect(battle.tick).toBe(30);
    expect(battle.result.winnerSide).toBe('attacker');
    expect(battle.result.aweLevel).toBe('large');
    const commander = expected.officers['off.alpha-lord' as keyof GameState['officers']]!;
    expect(commander.merit).toBe(0);
    const award = Math.round(
      (BAL.meritBattleWin + BAL.meritBattleAweBonus) * BAL.meritCommanderMult,
    );
    expect(award).toBe(90);
    commander.merit = award;
    commander.statExp.ldr = award;
    commander.statExp.val = award;
  }
  return expected;
}

it('preserves all30 tactical states and results except explicit schema, original roster and victory/awe merit', () => {
  const proof = JSON.parse(
    gunzipSync(readFileSync(new URL('tactical/full-state-proof.json.gz', proofRoot))).toString(
      'utf8',
    ),
  ) as TacticalProof;
  expect(
    createHash('sha256')
      .update(readFileSync(new URL('goldens/historical-source.tar.gz', proofRoot)))
      .digest('hex'),
  ).toBe(proof.sourceArchiveSha256);
  const old = JSON.parse(
    readFileSync(new URL('tactical/frozen-v3.tfbattle.json', proofRoot), 'utf8'),
  ) as BattleTranscriptFile;
  const current = JSON.parse(
    readFileSync(
      new URL('./battle-cases/m5-battle-subloop-v1.tfbattle.json', import.meta.url),
      'utf8',
    ),
  ) as BattleTranscriptFile;
  expect(current.entries).toEqual(old.entries);
  expect(current.finalTick).toBe(old.finalTick);
  expect(current.finalTick).toBe(30);
  expect({ ...current.initial, stateHash: old.initial.stateHash }).toEqual(old.initial);
  expect(stateHash(proof.initial.old)).toBe(old.initial.stateHash);
  const { state, battleId } = buildBattleTranscriptInitialState(
    current.seed,
    current.initial.layoutId,
  );
  expect(state).toEqual(upgrade(proof.initial.old));
  expect(stateHash(state)).toBe(current.initial.stateHash);
  for (const recorded of proof.ticks) {
    const orders = old.entries
      .filter((e) => e.tick === recorded.tick)
      .map((e) => structuredClone(e.order));
    const result = advanceBattleTick(state, battleId, orders);
    expect(result).toEqual(recorded.oldResult);
    expect(state).toEqual(upgrade(recorded.oldState));
    expect(validateState(state)).toEqual([]);
    const frozenCheckpoint = old.checkpoints.find((c) => c.tick === recorded.tick);
    if (frozenCheckpoint) expect(stateHash(recorded.oldState)).toBe(frozenCheckpoint.hash);
    const currentCheckpoint = current.checkpoints.find((c) => c.tick === recorded.tick);
    if (currentCheckpoint) expect(stateHash(state)).toBe(currentCheckpoint.hash);
  }
  expect(proof.ticks).toHaveLength(30);
  expect(stateHash(proof.ticks[29]!.oldState)).toBe(old.finalHash);
  expect(stateHash(state)).toBe(current.finalHash);
});
