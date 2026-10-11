import { describe, expect, it } from 'vitest';
import { encodeSave, decodeSave, buildSaveFile } from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCommand } from '../../src/core/commands/apply';
import type { Command } from '../../src/core/commands/types';
import type { AttackPlan, AiState, ThreatCache } from '../../src/core/state/gameState';
import type { ClanId, CorpsId } from '../../src/core/state/ids';
import { buildTinyState, CASTLE_A2, CASTLE_B1, CLAN_BETA, OFF_BETA_LORD } from '../fixtures/tiny';

const validOrder = () => ({
  command: {
    type: 'setConscriptPolicy' as const,
    clanId: CLAN_BETA,
    castleId: CASTLE_B1,
    policy: 'high' as const,
  },
  authority: { kind: 'clan' as const, clanId: CLAN_BETA },
});
describe('M7 savev3 migration and untrusted AI data', () => {
  it('round-trips null and complete finite threat caches, including empty entries', () => {
    const state = buildTinyState();
    for (const threatCache of [
      null,
      { computedDay: state.time.day, totalThreat: 0, entries: [] },
      {
        computedDay: state.time.day,
        totalThreat: 1.5,
        entries: [
          {
            enemyClanId: CLAN_BETA,
            borderPowerEnemy: 1000,
            borderPowerOurs: 1000,
            relationFactor: 1.5,
            threat: 1.5,
            threatenedCastleIds: [CASTLE_A2],
          },
        ],
      },
    ]) {
      state.ai.clans[CLAN_BETA]!.threatCache = threatCache;
      expect(decodeSave(encodeSave(state, 123)).ok).toBe(true);
    }
  });
  it.each([
    {},
    { computedDay: 0, totalThreat: 0 },
    { computedDay: 0, totalThreat: 0, entries: null },
    { computedDay: 0, totalThreat: -1, entries: [] },
    { computedDay: 0, totalThreat: Number.POSITIVE_INFINITY, entries: [] },
    { computedDay: -1, totalThreat: 0, entries: [] },
    { computedDay: 1e9, totalThreat: 0, entries: [] },
    { computedDay: 0, totalThreat: 0, entries: [{}] },
    ...[
      'enemyClanId',
      'borderPowerEnemy',
      'borderPowerOurs',
      'relationFactor',
      'threat',
      'threatenedCastleIds',
    ].map((key) => ({
      computedDay: 0,
      totalThreat: 1,
      entries: [
        {
          enemyClanId: CLAN_BETA,
          borderPowerEnemy: 1,
          borderPowerOurs: 1,
          relationFactor: 1,
          threat: 1,
          threatenedCastleIds: [CASTLE_A2],
          [key]: key === 'enemyClanId' ? '' : key === 'threatenedCastleIds' ? [123] : -1,
        },
      ],
    })),
  ])(
    'rejects malformed persisted threat cache %j before any council can read it',
    (threatCache) => {
      const file = buildSaveFile(buildTinyState(), 123);
      file.state.ai.clans[CLAN_BETA]!.threatCache = threatCache as unknown as ThreatCache;
      expect(decodeSave(JSON.stringify(file))).toEqual({ ok: false, code: 'corrupt' });
    },
  );
  it('v2 discards only incompatible plan/council bookkeeping and preserves actual deployed armies and officers', () => {
    const state = buildTinyState();
    const command: Command = {
      type: 'march',
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_LORD,
      deputyIds: [],
      soldiers: 500,
      food: 600,
      targetNodeId: CASTLE_A2,
    };
    const authority = { kind: 'clan' as const, clanId: CLAN_BETA };
    expect(validateCommand(state, command, authority).ok).toBe(true);
    applyCommand(state, command, () => {}, authority);
    const armies = structuredClone(state.armies),
      officers = structuredClone(state.officers),
      castles = structuredClone(state.castles),
      rng = structuredClone(state.rng);
    state.ai.clans[CLAN_BETA]!.attackPlans.push({
      id: 'plan.legacy',
      stage: 'muster',
    } as AttackPlan);
    state.ai.clans[CLAN_BETA]!.pendingPhases = ['military', 'domestic', 'diplomacy'];
    const file = buildSaveFile(state, 123);
    file.version = 2;
    for (const key of ['pendingOrders', 'councilJobs', 'lastCouncilEnrollment', 'allAi'])
      Reflect.deleteProperty(file.state.ai, key);
    const loaded = decodeSave(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.code);
    expect(loaded.migrated).toBe(true);
    expect(loaded.saveFile.version).toBe(SAVE_FORMAT_VERSION);
    expect(loaded.saveFile.state.ai.clans[CLAN_BETA]!.attackPlans).toEqual([]);
    expect(loaded.saveFile.state.ai.clans[CLAN_BETA]!.pendingPhases).toEqual([]);
    expect(loaded.saveFile.state.ai.pendingOrders).toEqual([]);
    expect(loaded.saveFile.state.armies).toEqual(armies);
    expect(loaded.saveFile.state.officers).toEqual(officers);
    expect(loaded.saveFile.state.castles).toEqual(castles);
    expect(loaded.saveFile.state.rng).toEqual(rng);
  });
  it('round-trips valid stale orders without granting them execution legality', () => {
    const state = buildTinyState();
    state.ai.pendingOrders.push(validOrder());
    state.ai.pendingOrders[0]!.command = {
      ...validOrder().command,
      castleId: 'castle.no-longer-present' as typeof CASTLE_B1,
    };
    const loaded = decodeSave(encodeSave(state, 123));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.code);
    const pending = loaded.saveFile.state.ai.pendingOrders[0]!;
    expect(validateCommand(loaded.saveFile.state, pending.command, pending.authority).ok).toBe(
      false,
    );
  });
  it.each([
    { kind: 'player' },
    { kind: 'bogus', clanId: CLAN_BETA },
    { kind: 'corps', clanId: CLAN_BETA },
    { kind: 'castle', clanId: CLAN_BETA },
    { kind: 'steward', clanId: CLAN_BETA, officerId: OFF_BETA_LORD },
    { kind: 'clan', clanId: 'clan.wrong' },
  ])('rejects malformed/mismatched authority %j', (authority) => {
    const state = buildTinyState(),
      file = buildSaveFile(state, 123);
    file.state.ai.pendingOrders = [
      { ...validOrder(), authority },
    ] as unknown as AiState['pendingOrders'];
    expect(decodeSave(JSON.stringify(file))).toEqual({ ok: false, code: 'corrupt' });
  });
  it.each([
    { type: 'setConscriptPolicy', castleId: CASTLE_B1, policy: 'garbage' },
    { type: 'setDevelopFocus', districtId: 'dist.test', focus: 'garbage' },
    {
      type: 'march',
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_LORD,
      deputyIds: null,
      soldiers: 1,
      food: 1,
      targetNodeId: CASTLE_A2,
    },
    {
      type: 'transport',
      fromCastleId: CASTLE_B1,
      toCastleId: CASTLE_A2,
      soldiers: '1',
      gold: 0,
      food: 0,
    },
    { type: 'rewardOfficer', officerId: OFF_BETA_LORD, tier: 'infinite' },
    {
      type: 'startPlot',
      kind: 'rumor',
      executorId: OFF_BETA_LORD,
      targetClanId: 'clan.x',
      targetOfficerId: null,
      investGold: 0,
    },
    { type: 'setAutoReturn', armyId: 'army.x', enabled: 1 },
    {
      type: 'setConscriptPolicy',
      castleId: CASTLE_B1,
      policy: 'high',
      authority: { kind: 'player' },
    },
  ])('rejects malformed payload %j without crashing after load', (command) => {
    const file = buildSaveFile(buildTinyState(), 123);
    file.state.ai.pendingOrders = [
      { authority: validOrder().authority, command: { clanId: CLAN_BETA, ...command } },
    ] as unknown as AiState['pendingOrders'];
    expect(decodeSave(JSON.stringify(file))).toEqual({ ok: false, code: 'corrupt' });
  });
  it.each([
    { clanId: CLAN_BETA, corpsId: null, phases: ['military', 'threat'], enrolledDay: 1 },
    { clanId: CLAN_BETA, corpsId: null, phases: [], enrolledDay: 1 },
    {
      clanId: CLAN_BETA,
      corpsId: null,
      phases: ['threat', 'military', 'domestic', 'diplomacy'],
      enrolledDay: -1,
    },
    {
      clanId: 'clan.unknown',
      corpsId: null,
      phases: ['threat', 'military', 'domestic', 'diplomacy'],
      enrolledDay: 1,
    },
  ])('rejects malformed or unknown council owner %j', (job) => {
    const file = buildSaveFile(buildTinyState(), 123);
    file.state.ai.councilJobs = [job] as AiState['councilJobs'];
    expect(decodeSave(JSON.stringify(file))).toEqual({ ok: false, code: 'corrupt' });
  });
  it('rejects duplicate jobs and mismatch with the clan pending phase mirror', () => {
    const state = buildTinyState(),
      job = {
        clanId: CLAN_BETA,
        corpsId: null,
        phases: ['domestic', 'diplomacy'] as const,
        enrolledDay: state.time.day,
      };
    state.ai.councilJobs = [{ ...job, phases: [...job.phases] }];
    expect(decodeSave(encodeSave(state, 123))).toEqual({ ok: false, code: 'corrupt' });
    state.ai.clans[CLAN_BETA]!.pendingPhases = [...job.phases];
    expect(decodeSave(encodeSave(state, 123)).ok).toBe(true);
    state.ai.councilJobs.push({ ...job, phases: [...job.phases] });
    expect(decodeSave(encodeSave(state, 123))).toEqual({ ok: false, code: 'corrupt' });
  });
  it('rejects an existing corps job under the wrong clan', () => {
    const state = buildTinyState(),
      corpsId = 'corps.saved' as CorpsId;
    state.corps[corpsId] = {
      id: corpsId,
      clanId: 'clan.different' as ClanId,
      corpsLeaderId: OFF_BETA_LORD,
      directive: 'hold',
      targetNodeId: null,
      gold: 0,
      createdDay: state.time.day,
    };
    state.ai.councilJobs = [
      { clanId: CLAN_BETA, corpsId, phases: ['diplomacy'], enrolledDay: state.time.day },
    ];
    expect(decodeSave(encodeSave(state, 123))).toEqual({ ok: false, code: 'corrupt' });
  });
  it('requires complete typed plan bookkeeping while allowing well-shaped stale targets', () => {
    const state = buildTinyState();
    const plan: AttackPlan = {
      id: 'plan.test',
      ownerCorpsId: null,
      targetCastleId: CASTLE_A2,
      targetClanId: state.castles[CASTLE_A2]!.ownerClanId,
      sourceLeaderIds: { [CASTLE_B1]: OFF_BETA_LORD },
      stagingRetainedTroops: 500,
      stagingCastleId: CASTLE_B1,
      sourceCastleIds: [CASTLE_B1],
      stage: 'muster',
      armyIds: [],
      startedDay: state.time.day,
      stageEnteredDay: state.time.day,
      plannedTroops: 500,
      abortReason: null,
    };
    state.ai.clans[CLAN_BETA]!.attackPlans = [plan];
    expect(decodeSave(encodeSave(state, 123)).ok).toBe(true);
    for (const field of [
      'id',
      'targetCastleId',
      'stagingCastleId',
      'ownerCorpsId',
      'startedDay',
      'stageEnteredDay',
      'plannedTroops',
      'abortReason',
    ]) {
      const malformed = structuredClone(state);
      Reflect.deleteProperty(malformed.ai.clans[CLAN_BETA]!.attackPlans[0]!, field);
      expect(decodeSave(encodeSave(malformed, 123))).toEqual({ ok: false, code: 'corrupt' });
    }
    const malformed = structuredClone(state);
    malformed.ai.clans[CLAN_BETA]!.attackPlans[0]!.sourceCastleIds = [
      12,
    ] as unknown as AttackPlan['sourceCastleIds'];
    expect(decodeSave(encodeSave(malformed, 123))).toEqual({ ok: false, code: 'corrupt' });
  });
});
