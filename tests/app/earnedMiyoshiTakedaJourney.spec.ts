import { afterEach, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import {
  earnMiyoshiTakedaCheckpoint,
  MIYOSHI,
  TAKEDA,
  NAGAYOSHI,
} from '../helpers/earnedMiyoshiTakeda';
import { getTrust, hasPact } from '../../src/core/systems/diplomacyCommon';
import { resetBridgeForTests } from '../../src/app/bridge';
import { resetGameStoreForTests } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';

afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

it('generates a CPU-earned day300 Miyoshi Takeda checkpoint with all actual arrivals answered', async () => {
  const result = await earnMiyoshiTakedaCheckpoint();
  expect(result.initial.meta.playerClanId).toBe(MIYOSHI);
  expect(result.initial.meta.seed).toBe(42);
  expect(new Set(Object.values(result.initial.provinces).map((p) => p.region)).size).toBe(9);
  expect(result.submitted.slice(0, 2)).toEqual([
    { day: 0, command: { type: 'enactPolicy', clanId: MIYOSHI, policyId: 'pol.enkokinko' } },
    {
      day: 0,
      command: { type: 'startDiploWork', clanId: MIYOSHI, target: TAKEDA, executorId: NAGAYOSHI },
    },
  ]);
  expect(result.months.map((m) => m.workCost)).toEqual(Array(10).fill(16));
  for (const month of result.months) {
    expect(month.goldBeforeEconomy).toBe(month.goldBefore - 16);
    expect(month.trustAfter - month.trustBefore).toBeCloseTo((2 + 92 / 25) * 1.25 * 1.1, 12);
  }
  expect(result.dailyHashes.map((d) => d.day)).toEqual(
    Array.from({ length: 300 }, (_, i) => i + 1),
  );
  expect(result.submitted.filter((s) => s.command.type === 'respondPact')).toEqual([
    {
      day: 224,
      command: { type: 'respondPact', clanId: MIYOSHI, proposalId: 'prop.000048', accept: false },
    },
  ]);
  expect(result.state.diplomacy.pendingProposals).toEqual([]);
  expect(getTrust(result.state, MIYOSHI, TAKEDA)).toBe(78.10000000000001);
  expect(hasPact(result.state, MIYOSHI, TAKEDA, 'alliance')).toBe(false);
  expect(result.log.truncated).toBe(false);
  expect(
    result.log.entries.filter(
      (e) => e.command.type === 'proposePact' && e.command.clanId === MIYOSHI,
    ),
  ).toEqual([]);
  if (process.env.EARNED_MIYOSHI_TAKEDA_SAVE_PATH) {
    await writeFile(process.env.EARNED_MIYOSHI_TAKEDA_SAVE_PATH, result.raw);
    await writeFile(
      `${process.env.EARNED_MIYOSHI_TAKEDA_SAVE_PATH}.evidence.json`,
      JSON.stringify(result, null, 2),
    );
  }
}, 60_000);
