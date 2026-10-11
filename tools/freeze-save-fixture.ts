import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Emit an authentic envelope using the selected source tree's own public codec.
// Usage: tsx tools/freeze-save-fixture.ts /absolute/archived/revision
// stdout only: the caller explicitly freezes/reviews the artifact, never tests.
interface MiniExports {
  buildMiniState(options: { seed: number }): unknown;
  CLAN_ALPHA: string;
  CLAN_BETA: string;
  CASTLE_A1: string;
  CASTLE_A2: string;
  CASTLE_B1: string;
  OFF_BETA_LORD: string;
}
interface CommandExports {
  validateCommand(state: unknown, command: unknown, authority?: unknown): { ok: boolean };
}
interface ApplyExports {
  applyCommand(state: unknown, command: unknown, emit: () => void, authority?: unknown): void;
}
interface CodecExports {
  encodeSave(state: unknown, timestamp: number, pending: unknown[]): string;
  decodeSave(raw: string): { ok: boolean };
}

export async function generateSaveFixture(sourceRoot: string): Promise<string> {
  const load = (relative: string) => import(pathToFileURL(path.join(sourceRoot, relative)).href);
  const mini = (await load('tests/fixtures/mini/index.ts')) as MiniExports;
  const commands = (await load('src/core/commands/validate.ts')) as CommandExports;
  const apply = (await load('src/core/commands/apply.ts')) as ApplyExports;
  const codec = (await load('src/core/save/serialize.ts')) as CodecExports;
  const state = mini.buildMiniState({ seed: 42 });
  const march = {
    type: 'march',
    clanId: mini.CLAN_BETA,
    originCastleId: mini.CASTLE_B1,
    leaderId: mini.OFF_BETA_LORD,
    deputyIds: [],
    soldiers: 100,
    food: 100,
    targetNodeId: mini.CASTLE_A2,
  };
  const authority = { kind: 'clan', clanId: mini.CLAN_BETA };
  if (!commands.validateCommand(state, march, authority).ok)
    throw new Error('Historical source rejected its fixture march');
  apply.applyCommand(state, march, () => undefined, authority);
  const pending = {
    type: 'setConscriptPolicy',
    clanId: mini.CLAN_ALPHA,
    castleId: mini.CASTLE_A1,
    policy: 'high',
  };
  if (!commands.validateCommand(state, pending).ok)
    throw new Error('Historical source rejected its fixture pending command');
  const raw = codec.encodeSave(state, 1_751_808_000_000, [pending]);
  if (!codec.decodeSave(raw).ok) throw new Error('Source codec rejected its own fixture');
  return JSON.stringify(JSON.parse(raw), null, 2) + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceRoot = process.argv[2];
  if (!sourceRoot || !path.isAbsolute(sourceRoot)) throw new Error('Absolute source root required');
  process.stdout.write(await generateSaveFixture(sourceRoot));
}
