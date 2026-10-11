import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect } from 'vitest';
import type { GameState } from '../../src/core/state/gameState';
import type { advanceBattleTick } from '../../src/core/systems/battle';
import { stateHash } from '../../src/core/state/serialize';

interface B8Proof {
  sourceArchiveSha256: string;
  historical: {
    initial: GameState;
    ticks: Array<{ state: GameState; hash: string; result: ReturnType<typeof advanceBattleTick> }>;
  };
}
const proofRoot = new URL('../../docs/validation/2026-10-12/golden-provenance/', import.meta.url);
const proof = JSON.parse(
  gunzipSync(readFileSync(new URL('b8/full-state-proof.json.gz', proofRoot))).toString('utf8'),
) as B8Proof;

/** Exact historical state plus five explicitly introduced persistent fields. */
export function expectB8MigrationState(
  state: GameState,
  tick: number,
  result?: ReturnType<typeof advanceBattleTick>,
): void {
  if (tick === 0)
    expect(
      createHash('sha256')
        .update(readFileSync(new URL('goldens/historical-source.tar.gz', proofRoot)))
        .digest('hex'),
    ).toBe(proof.sourceArchiveSha256);
  const recorded = tick === 0 ? proof.historical.initial : proof.historical.ticks[tick - 1]!.state;
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
  expect(state).toEqual(expected);
  if (tick > 0) {
    const original = proof.historical.ticks[tick - 1]!;
    expect(stateHash(original.state)).toBe(original.hash);
    expect(result).toEqual(original.result);
  }
}
