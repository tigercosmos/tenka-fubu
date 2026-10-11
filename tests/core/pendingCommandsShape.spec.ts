import { describe, expect, it } from 'vitest';
import type { Command, CommandType } from '../../src/core/commands/types';
import { buildSaveFile, decodeSave } from '../../src/core/save/serialize';
import { validateCommand } from '../../src/core/commands/validate';
import {
  isCommandShape,
  validateSavedPendingCommands,
} from '../../src/core/save/validatePendingCommands';
import { BAL } from '../../src/core/balance';
import { buildTinyState } from '../fixtures/tiny';

// Missing/added discriminants fail compilation; runtime mutations cover every required field.
const payloads = {
  grantFief: { districtId: 'gone', officerId: null },
  setDevelopFocus: { districtId: 'gone', focus: 'agri' },
  buildFacility: { castleId: 'gone', facilityTypeId: 'removed-catalog-entry' },
  cancelBuild: { castleId: 'gone', queueIndex: 0 },
  demolishFacility: { castleId: 'gone', facilityTypeId: 'gone' },
  setConscriptPolicy: { castleId: 'gone', policy: 'mid' },
  transport: { fromCastleId: 'gone', toCastleId: 'gone', soldiers: 0, gold: 1, food: 0 },
  recallTransport: { transportId: 'gone' },
  tradeRice: { castleId: 'gone', mode: 'buy', amount: 1 },
  enactPolicy: { policyId: 'removed-catalog-entry' },
  revokePolicy: { policyId: 'gone' },
  appointLord: { castleId: 'gone', officerId: null },
  setCastleControl: { castleId: 'gone', directControl: false },
  march: {
    originCastleId: 'gone',
    leaderId: 'gone',
    deputyIds: [],
    soldiers: 1,
    food: 0,
    targetNodeId: 'gone',
  },
  setArmyTarget: { armyId: 'gone', targetNodeId: 'gone' },
  recallArmy: { armyId: 'gone' },
  returnArmyToCastle: { armyId: 'gone', destinationCastleId: 'gone' },
  depositGarrison: { armyId: 'gone', castleId: 'gone', soldiers: 0, food: 1 },
  setAutoReturn: { armyId: 'gone', enabled: true },
  startKassen: { fieldCombatId: 'gone' },
  battleMove: { battleId: 'gone', unitId: 'gone', targetJinId: 'gone' },
  battleAttack: { battleId: 'gone', unitId: 'gone', targetUnitId: 'gone' },
  battleTactic: { battleId: 'gone', unitId: 'gone', tacticId: 'gone', targetUnitId: null },
  battleDelegate: { battleId: 'gone', unitId: 'all', enabled: true },
  setSiegeMode: { siegeId: 'gone', mode: 'encircle' },
  useBetrayal: { siegeId: 'gone' },
  recruitRonin: { officerId: 'gone', executorId: 'gone' },
  rewardOfficer: { officerId: 'gone', tier: 'small' },
  handleCaptive: { officerId: 'gone', action: 'release', executorId: null },
  promoteRank: { officerId: 'gone' },
  startDiploWork: { target: 'court', executorId: 'gone' },
  stopDiploWork: { target: 'shogunate' },
  proposePact: { targetClanId: 'gone', kind: 'proposeAlliance', reinforceAgainstClanId: null },
  respondPact: { proposalId: 'gone', accept: false },
  breakPact: { targetClanId: 'gone', kind: 'alliance' },
  requestCourtRank: {},
  requestMediation: { targetClanId: 'gone' },
  requestShogunateTitle: {},
  nominateShogun: {},
  startPlot: {
    kind: 'poach',
    executorId: 'gone',
    targetClanId: 'gone',
    targetOfficerId: 'gone',
    targetCastleId: null,
    investGold: 0,
  },
  cancelPlot: { plotId: 'gone' },
  createCorps: {
    corpsLeaderId: 'gone',
    castleIds: ['gone'],
    directive: 'advance',
    targetNodeId: 'gone',
  },
  setCorpsDirective: { corpsId: 'gone', directive: 'hold', targetNodeId: null },
  assignCastleToCorps: { castleId: 'gone', corpsId: null },
  dissolveCorps: { corpsId: 'gone' },
  resolveProposal: { proposalId: 'gone', accept: true },
  invokeTaimei: { taimeiId: 'gone' },
  resolveEventChoice: { eventId: 'gone', choiceIndex: 0 },
  debugSkipDays: { days: 1 },
  debugGrant: { gold: null, food: null, castleId: null },
} satisfies Record<CommandType, Record<string, unknown>>;

describe('untrusted saved player command shapes', () => {
  for (const [type, payload] of Object.entries(payloads)) {
    const command = { type, clanId: 'player', ...payload };
    it(`${type}: accepts canonical shape, rejects missing/malformed fields and authority`, () => {
      expect(isCommandShape(command)).toBe(true);
      for (const key of Object.keys(command)) {
        const missing: Record<string, unknown> = { ...command };
        delete missing[key];
        expect(isCommandShape(missing), `missing ${key}`).toBe(false);
        expect(isCommandShape({ ...command, [key]: {} }), `object ${key}`).toBe(false);
      }
      expect(isCommandShape({ ...command, authority: { kind: 'clan', clanId: 'player' } })).toBe(
        false,
      );
      expect(isCommandShape({ ...command, debugMode: true })).toBe(false);
    });
  }
  it('covers exactly all 50 command variants', () =>
    expect(Object.keys(payloads)).toHaveLength(50));
  it.each([
    null,
    [],
    1,
    'march',
    {},
    { type: '__proto__', clanId: 'player' },
    { type: 'constructor', clanId: 'player' },
  ])('rejects non-command %j', (value) => {
    expect(isCommandShape(value)).toBe(false);
  });
  it('enforces player identity and preserves repeated intents across multiple tick batches', () => {
    const command = { type: 'requestCourtRank', clanId: 'player' };
    expect(validateSavedPendingCommands([], 'player')).toBe(true);
    expect(
      validateSavedPendingCommands(Array(BAL.maxCommandsPerTick).fill(command), 'player'),
    ).toBe(true);
    expect(
      validateSavedPendingCommands(Array(BAL.maxCommandsPerTick + 1).fill(command), 'player'),
    ).toBe(true);
    expect(validateSavedPendingCommands([command], 'other')).toBe(false);
    expect(validateSavedPendingCommands([null], 'player')).toBe(false);
    expect(validateSavedPendingCommands(Array(1), 'player')).toBe(false);
    expect(validateSavedPendingCommands({}, 'player')).toBe(false);
  });
  it('retains stale entities for ordinary next-tick hard rejection', () => {
    const state = buildTinyState();
    const command: unknown = {
      type: 'appointLord',
      clanId: state.meta.playerClanId,
      castleId: 'gone',
      officerId: null,
    };
    expect(validateSavedPendingCommands([command], state.meta.playerClanId)).toBe(true);
    if (!isCommandShape(command)) throw new Error('shape unexpectedly rejected');
    expect(validateCommand(state, command).ok).toBe(false);
  });
  it('round-trips a player queue larger than one tick without truncating or deduplicating', () => {
    const state = buildTinyState();
    const command: Command = { type: 'requestCourtRank', clanId: state.meta.playerClanId };
    const pending = Array.from({ length: BAL.maxCommandsPerTick + 1 }, () => command);
    const decoded = decodeSave(JSON.stringify(buildSaveFile(state, 123, pending)));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.saveFile.pendingCommands).toEqual(pending);
  });
  it('keeps debug intents regardless of debugMode and does not impose a new grant number policy', () => {
    const state = buildTinyState();
    state.meta.debugMode = false;
    const command: unknown = {
      type: 'debugGrant',
      clanId: state.meta.playerClanId,
      gold: -1.25,
      food: 0.5,
      castleId: null,
    };
    expect(validateSavedPendingCommands([command], state.meta.playerClanId)).toBe(true);
    if (!isCommandShape(command)) throw new Error('shape unexpectedly rejected');
    expect(validateCommand(state, command).ok).toBe(false);
    expect(
      isCommandShape({ type: 'debugSkipDays', clanId: 'player', days: BAL.debugSkipMaxDays + 1 }),
    ).toBe(true);
  });
  it('rejects bad enums, numeric coercions/non-finite values and malformed ID arrays', () => {
    for (const bad of ['garbage', null, 0]) {
      expect(
        isCommandShape({
          type: 'setConscriptPolicy',
          clanId: 'player',
          castleId: 'gone',
          policy: bad,
        }),
      ).toBe(false);
    }
    for (const bad of [-1, 0.5, Infinity, NaN, '1', Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        isCommandShape({ type: 'transport', clanId: 'player', ...payloads.transport, food: bad }),
      ).toBe(false);
    }
    for (const bad of [Infinity, NaN, '1']) {
      expect(
        isCommandShape({ type: 'debugGrant', clanId: 'player', ...payloads.debugGrant, gold: bad }),
      ).toBe(false);
    }
    expect(
      isCommandShape({ type: 'march', clanId: 'player', ...payloads.march, deputyIds: ['ok', 1] }),
    ).toBe(false);
    expect(
      isCommandShape({ type: 'march', clanId: 'player', ...payloads.march, deputyIds: Array(1) }),
    ).toBe(false);
    expect(
      isCommandShape({
        type: 'createCorps',
        clanId: 'player',
        ...payloads.createCorps,
        castleIds: 'gone',
      }),
    ).toBe(false);
  });
});
