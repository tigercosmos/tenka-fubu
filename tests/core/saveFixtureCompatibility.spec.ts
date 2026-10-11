import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { decodeSave, encodeSave, type SaveFile } from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import provenance from '../fixtures/saves/provenance.json';

const fixturePath = (file: string) =>
  fileURLToPath(new URL(`../fixtures/saves/${file}`, import.meta.url));
function decode(raw: string): SaveFile {
  const result = decodeSave(raw);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result.saveFile;
}
function restoredQueue(save: SaveFile): CommandQueue {
  const queue = new CommandQueue(save.state.meta.lastAppliedCmdSeq + 1);
  for (const command of save.pendingCommands)
    queue.enqueue(structuredClone(command), save.state.time.day);
  return queue;
}
function continueDays(save: SaveFile, days: number): number {
  const queue = restoredQueue(save);
  let playerApplications = 0;
  for (let day = 0; day < days; day++) {
    enqueuePendingAiOrders(save.state, queue);
    const tick = advanceDay(save.state, queue.drain());
    playerApplications += tick.appliedCommands.filter(
      (entry) =>
        entry.command.type === 'setConscriptPolicy' &&
        entry.command.clanId === save.state.meta.playerClanId &&
        entry.command.castleId === 'castle.a1' &&
        entry.command.policy === 'high',
    ).length;
    expect(validateState(save.state), `continuation day ${save.state.time.day}`).toEqual([]);
  }
  expect(queue.snapshotPlayerCommands()).toEqual([]);
  return playerApplications;
}

describe('frozen authentic save compatibility (plan16 T16-9 /17 SV5)', () => {
  it.each(provenance.fixtures)(
    'preserves the frozen v$version artifact and migration payload',
    (fixture) => {
      const raw = readFileSync(fixturePath(fixture.file), 'utf8');
      expect(createHash('sha256').update(raw).digest('hex')).toBe(fixture.artifactSha256);
      const original = JSON.parse(raw) as {
        version: number;
        timestamp: number;
        pendingCommands: unknown[];
        state: {
          armies: unknown;
          officers: unknown;
          clans: Record<string, Record<string, unknown>>;
          rng: unknown;
          transports: unknown;
        };
      };
      expect(original.version).toBe(fixture.version);
      expect(original.timestamp).toBe(provenance.timestamp);
      const result = decodeSave(raw);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.code);
      const migrated = result.saveFile;
      expect(result.migrated).toBe(fixture.version < SAVE_FORMAT_VERSION);
      expect(migrated.version).toBe(SAVE_FORMAT_VERSION);
      expect(migrated.state.meta.saveVersion).toBe(SAVE_FORMAT_VERSION);
      expect(migrated.state.armies).toEqual(original.state.armies);
      expect(migrated.state.officers).toEqual(original.state.officers);
      expect(migrated.state.clans).toEqual(
        Object.fromEntries(
          Object.entries(original.state.clans).map(([id, clan]) => [
            id,
            { ...clan, rewardGoldSpentThisMonth: null },
          ]),
        ),
      );
      expect(migrated.state.rng).toEqual(original.state.rng);
      expect(migrated.state.transports).toEqual(original.state.transports);
      expect(migrated.pendingCommands).toEqual(original.pendingCommands);
      expect(migrated.state.events.pendingChoiceBinding).toBeNull();
      expect(migrated.state.events.hookSignals).toEqual([]);
      expect(validateState(migrated.state)).toEqual([]);
    },
  );

  it.each(provenance.fixtures)(
    'continues v$version for thirty days deterministically, applying its saved player order once',
    (fixture) => {
      const raw = readFileSync(fixturePath(fixture.file), 'utf8');
      const straight = decode(raw);
      const independent = decode(raw);
      const interrupted = decode(raw);
      const startDay = straight.state.time.day;
      expect(straight.pendingCommands).toHaveLength(1);
      expect(continueDays(straight, 30)).toBe(1);
      expect(continueDays(independent, 30)).toBe(1);
      expect(continueDays(interrupted, 15)).toBe(1);
      const resumed = decode(encodeSave(interrupted.state, provenance.timestamp + 1));
      expect(continueDays(resumed, 15)).toBe(0);
      expect(straight.state.time.day).toBe(startDay + 30);
      expect(straight.state).toEqual(independent.state);
      expect(straight.state).toEqual(resumed.state);
      expect(stateHash(straight.state)).toBe(stateHash(independent.state));
      expect(stateHash(straight.state)).toBe(stateHash(resumed.state));
    },
  );
});
