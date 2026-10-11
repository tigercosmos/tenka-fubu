import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { replayCommandLog, type CommandLogFile } from '../../src/core/replay/commandLog';
import { balanceHash, canonicalStringify } from '../../src/core/state/serialize';
import { buildMiniState } from '../../tests/fixtures/mini';

// A deliberate BAL addition can leave a frozen replay's entire final state unchanged.
// Prove the original frozen hash before changing only its BAL version tag.
const args = process.argv.slice(2);
const option = (name: string): string => {
  const value = args[args.indexOf(name) + 1];
  if (!args.includes(name) || !value || value.startsWith('--'))
    throw new Error(`Required argument: ${name}`);
  return value;
};
const from = option('--from');
const to = option('--to');
const proofPath = option('--proof');
if (to !== balanceHash()) throw new Error('Target BAL tag does not match current core');
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const directory = resolve('tests/replay/cases');
const candidates = readdirSync(directory)
  .filter((name) => name.endsWith('.tfulog.json'))
  .sort()
  .map((name) => {
    const path = resolve(directory, name);
    const text = readFileSync(path, 'utf8');
    return { name, path, text, log: JSON.parse(text) as CommandLogFile };
  })
  .filter(({ log }) => log.balanceHash === from);
if (!candidates.length) throw new Error('No replay fixtures match the original BAL tag');
const rows = candidates.map(({ name, path, text, log }) => {
  if (log.scenarioId !== 'mini' || log.truncated)
    throw new Error(`${name}: only complete mini fixtures can use this audit`);
  const factory = (input: Readonly<CommandLogFile>) => buildMiniState({ seed: input.seed });
  const original = replayCommandLog(log, factory);
  const tagged = { ...structuredClone(log), balanceHash: to };
  const migrated = replayCommandLog(tagged, factory);
  if (
    !original.match ||
    !original.balanceMismatch ||
    !migrated.match ||
    migrated.balanceMismatch ||
    original.actualHash !== migrated.actualHash ||
    migrated.actualHash !== log.finalHash
  )
    throw new Error(`${name}: original frozen final hash is not preserved`);
  const beforeTag = `"balanceHash": "${from}"`;
  const afterText = text.replace(beforeTag, `"balanceHash": "${to}"`);
  if (
    text.split(beforeTag).length !== 2 ||
    canonicalStringify(JSON.parse(afterText)) !== canonicalStringify(tagged)
  )
    throw new Error(`${name}: migration changes fields beyond the BAL tag`);
  return {
    name,
    path,
    afterText,
    proof: {
      file: `tests/replay/cases/${name}`,
      finalDay: log.finalDay,
      commands: log.entries.length,
      oldBalanceHash: from,
      newBalanceHash: to,
      frozenFinalHash: log.finalHash,
      originalReplay: original,
      migratedReplay: migrated,
      entriesSha256: sha256(canonicalStringify(log.entries)),
      beforeFileSha256: sha256(text),
      afterFileSha256: sha256(afterText),
    },
  };
});
// All candidates must prove their original oracle before any fixture is written.
if (args.includes('--write')) for (const row of rows) writeFileSync(row.path, row.afterText);
writeFileSync(
  proofPath,
  `${JSON.stringify(
    {
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      mode: args.includes('--write') ? 'metadata-only migration' : 'read-only proof',
      scope: 'Only balanceHash changes; commands, finalDay and frozen finalHash stay unchanged.',
      limitation:
        'Exact final-state equality is proved; intermediate historical checkpoints are not recorded by these fixtures.',
      from,
      to,
      files: rows.length,
      rows: rows.map((row) => row.proof),
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Proved ${rows.length} unchanged frozen replay hashes; ${args.includes('--write') ? 'updated' : 'did not update'} BAL tags.`,
);
