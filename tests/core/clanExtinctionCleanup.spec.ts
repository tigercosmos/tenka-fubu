import { expect, it } from 'vitest';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import { advanceDay } from '../../src/core/systems';
import { validateState } from '../../src/core/state/invariants';
import { clearExtinctClanWork } from '../../src/core/systems/clanExtinction';
import { dieOfficer } from '../../src/core/systems/officers';
import { defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import type {
  PlotId,
  ProposalId,
  TransportId,
  TaimeiId,
  FacilityTypeId,
  ClanId,
  CastleId,
  RoadEdgeId,
} from '../../src/core/state/ids';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
  CASTLE_B1,
  CASTLE_A1,
} from '../fixtures/tiny';

it('ordinary no-heir death clears both mission ends without changing territory or death semantics', () => {
  const state = buildTinyState();
  for (const officer of Object.values(state.officers))
    if (officer.clanId === CLAN_BETA && officer.id !== OFF_BETA_LORD) officer.kinship = 'fudai';
  const control = structuredClone(state);
  state.diplomacy.missions = [
    { fromClanId: CLAN_ALPHA, target: CLAN_BETA, officerId: OFF_ALPHA_BUSHO, startDay: 0 },
    { fromClanId: CLAN_BETA, target: CLAN_ALPHA, officerId: OFF_BETA_BUSHO, startDay: 0 },
  ];
  const ownership = Object.values(state.castles).map(({ id, ownerClanId }) => [id, ownerClanId]);
  const events = dieOfficer(state, OFF_BETA_LORD, CASTLE_B1, false, 'age');
  expect(events).toEqual(dieOfficer(control, OFF_BETA_LORD, CASTLE_B1, false, 'age'));
  expect(state.clans[CLAN_BETA]?.alive).toBe(false);
  expect(state.diplomacy.missions).toEqual([]);
  expect(Object.values(state.castles).map(({ id, ownerClanId }) => [id, ownerClanId])).toEqual(
    ownership,
  );
  expect(state.events.flags).toEqual(control.events.flags);
  expect(state.rng).toEqual(control.rng);
  expect(state).toEqual(control);
});

it('clears extinct clan plots, pacts, pending proposals, transports and taimei without erasing history', () => {
  const state = buildTinyState();
  const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
  row.trustAtoB = 37;
  row.pacts = [{ kind: 'alliance', startDay: 0, endDay: 720, vassalClanId: null }];
  state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)] = row;
  state.diplomacy.plots = [
    {
      id: 'plot.000001' as PlotId,
      kind: 'rumor',
      ownerClanId: CLAN_ALPHA,
      targetClanId: CLAN_BETA,
      officerId: OFF_ALPHA_BUSHO,
      targetOfficerId: OFF_BETA_BUSHO,
      targetCastleId: null,
      investGold: 0,
      progress: 0,
      startedDay: 0,
    },
    {
      id: 'plot.000002' as PlotId,
      kind: 'rumor',
      ownerClanId: CLAN_BETA,
      targetClanId: CLAN_ALPHA,
      officerId: OFF_BETA_BUSHO,
      targetOfficerId: OFF_ALPHA_BUSHO,
      targetCastleId: null,
      investGold: 0,
      progress: 0,
      startedDay: 0,
    },
  ];
  state.diplomacy.pendingProposals = [
    {
      id: 'prop.000001' as ProposalId,
      kind: 'proposeAlliance',
      fromClanId: CLAN_ALPHA,
      toClanId: CLAN_BETA,
      createdDay: 0,
      expiresDay: 60,
      marriageOfficerIds: null,
      reinforceAgainstClanId: null,
    },
  ];
  const proposalId = 'prop.000002' as ProposalId;
  const transportId = 'trans.000001' as TransportId;
  state.proposals[proposalId] = {
    id: proposalId,
    clanId: CLAN_BETA,
    officerId: OFF_BETA_BUSHO,
    kind: 'facility',
    command: {
      type: 'buildFacility',
      clanId: CLAN_BETA,
      castleId: CASTLE_B1,
      facilityTypeId: 'fac.kura' as FacilityTypeId,
    },
    createdDay: 0,
    expiresDay: 60,
    status: 'pending',
    meritReward: 0,
    estimatedCostGold: 0,
    summaryKey: 'test',
    summaryParams: {},
  };
  state.transports[transportId] = {
    id: transportId,
    clanId: CLAN_BETA,
    fromCastleId: CASTLE_B1,
    toCastleId: CASTLE_A1,
    soldiers: 0,
    gold: 0,
    food: 1,
    path: [CASTLE_B1, CASTLE_A1],
    pathCursor: 0,
    edgeProgressDays: 0,
    edgeCostDays: 0,
    returning: false,
  };
  state.clans[CLAN_BETA]!.taimei.activeTaimeiId = 'taimei.sodoin' as TaimeiId;
  state.clans[CLAN_BETA]!.taimei.activeUntilDay = 360;
  clearExtinctClanWork(state, CLAN_BETA);
  expect(state.diplomacy.plots).toEqual([]);
  expect(state.diplomacy.pendingProposals).toEqual([]);
  expect(row.pacts).toEqual([]);
  expect(row.trustAtoB).toBe(37);
  expect(state.proposals[proposalId]?.status).toBe('expired');
  expect(state.transports).toEqual({});
  expect(state.clans[CLAN_BETA]!.taimei).toMatchObject({ activeTaimeiId: null, activeUntilDay: 0 });
});

it('removes either mission endpoint but retains unrelated work and consumes no RNG', () => {
  const state = buildTinyState();
  state.diplomacy.missions = [
    { fromClanId: CLAN_ALPHA, target: CLAN_BETA, officerId: OFF_ALPHA_BUSHO, startDay: 0 },
    { fromClanId: CLAN_BETA, target: CLAN_ALPHA, officerId: OFF_BETA_BUSHO, startDay: 0 },
    { fromClanId: CLAN_ALPHA, target: 'court', officerId: OFF_ALPHA_BUSHO, startDay: 0 },
  ];
  const rng = structuredClone(state.rng);
  clearExtinctClanWork(state, CLAN_BETA);
  expect(state.diplomacy.missions).toEqual([
    { fromClanId: CLAN_ALPHA, target: 'court', officerId: OFF_ALPHA_BUSHO, startDay: 0 },
  ]);
  expect(state.rng).toEqual(rng);
  clearExtinctClanWork(state, CLAN_BETA);
  expect(state.diplomacy.missions).toHaveLength(1);
});

it('cleans both diplomacy endpoints after a legal queued tiny-world conquest and actual last-castle fall', () => {
  const state = buildTinyState();
  // Controlled initial frontier only; all subsequent armies, arrivals and conquest
  // are produced by legal commands and ordinary daily systems, not state injection.
  const castle = state.castles[CASTLE_B1]!;
  castle.soldiers = 100;
  castle.durability = 100;
  castle.morale = 10;
  const roadId = 'road.cleanup-conquest' as RoadEdgeId;
  state.roads[roadId] = {
    id: roadId,
    a: CASTLE_A1,
    b: CASTLE_B1,
    type: 'land',
    grade: 1,
    baseDays: 1,
  };
  expect(validateState(state)).toEqual([]);
  const commands: Command[] = [
    { type: 'startDiploWork', clanId: CLAN_ALPHA, target: CLAN_BETA, executorId: OFF_ALPHA_BUSHO },
    { type: 'startDiploWork', clanId: CLAN_BETA, target: CLAN_ALPHA, executorId: OFF_BETA_BUSHO },
    { type: 'startDiploWork', clanId: CLAN_ALPHA, target: 'court', executorId: OFF_ALPHA_TAISHO },
    {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      targetNodeId: CASTLE_B1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 1500,
      food: 1000,
    },
  ];
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  for (const command of commands) {
    const authority =
      command.clanId === CLAN_ALPHA
        ? { kind: 'player' as const }
        : { kind: 'clan' as const, clanId: CLAN_BETA };
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day, authority);
  }
  let arrived = false;
  let siegeStarted = false;
  let destroyed = false;
  let unrelatedMission: (typeof state.diplomacy.missions)[number] | undefined;
  let unrelatedSnapshot: (typeof state.diplomacy.missions)[number] | undefined;
  for (let day = 0; day < 25 && !destroyed; day++) {
    const beforeMissions = structuredClone(state.diplomacy.missions);
    const result = advanceDay(state, queue.drain());
    if (day === 0) {
      expect(result.appliedCommands.map((envelope) => envelope.command)).toEqual(commands);
      expect(state.diplomacy.missions).toHaveLength(3);
      unrelatedMission = state.diplomacy.missions.find((mission) => mission.target === 'court');
      expect(unrelatedMission).toBeDefined();
      unrelatedSnapshot = structuredClone(unrelatedMission);
    }
    arrived ||= result.events.some(
      (event) => event.type === 'army.arrived' && event.nodeId === CASTLE_B1,
    );
    siegeStarted ||= result.events.some(
      (event) => event.type === 'siege.started' && event.castleId === CASTLE_B1,
    );
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand')).toEqual(
      [],
    );
    expect(validateState(state), `day${state.time.day}`).toEqual([]);
    if (
      result.events.some((event) => event.type === 'clan.destroyed' && event.clanId === CLAN_BETA)
    ) {
      destroyed = true;
      expect(siegeStarted).toBe(true);
      expect(state.time.day).toBe(96);
      expect(beforeMissions.some((mission) => mission.fromClanId === CLAN_BETA)).toBe(true);
      expect(beforeMissions.some((mission) => mission.target === CLAN_BETA)).toBe(true);
      expect(result.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'siege.ended',
            castleId: CASTLE_B1,
            fallen: true,
            newOwnerClanId: CLAN_ALPHA,
          }),
        ]),
      );
      expect(state.clans[CLAN_BETA]!.alive).toBe(false);
      expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_ALPHA);
      expect(state.diplomacy.missions).toEqual([unrelatedMission]);
      expect(state.diplomacy.missions[0]).toBe(unrelatedMission);
      expect(state.diplomacy.missions[0]).toEqual(unrelatedSnapshot);
    }
  }
  expect(arrived).toBe(true);
  expect(siegeStarted).toBe(true);
  expect(destroyed).toBe(true);
});

it('preserves the genuine seven-region assault progress without premature day185 extinction', async () => {
  // Preserve the original B7 reproduction, rather than letting newly activated regions
  // alter roster/RNG order. Use the real production bundle and canonical builder filter.
  const state = buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: '0.0.0-test',
    seed: 15600519,
    playerClanId: 'clan.oda' as ClanId,
    difficulty: 'normal',
    startDay: 0,
    regions: ['tokai', 'kinki', 'kanto', 'koshinetsu', 'hokuriku', 'chugoku', 'shikoku'],
  });
  state.ai.allAi = true;
  const engine = await loadScenarioEventEngine('s1560');
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  let destroyed = false;
  let departureTick: number | undefined;
  let arrivalTick: number | undefined;
  const yukiCastleId = 'castle.yuki' as CastleId;
  const initialDurability = state.castles[yukiCastleId]!.durability;
  let arrivalSoldiers: number | undefined;
  let arrivalMorale: number | undefined;
  for (let day = 0; day < 185; day++) {
    enqueuePendingAiOrders(state, queue);
    const result = advanceDay(state, queue.drain(), { eventEngine: engine });
    if (
      result.events.some(
        (event) =>
          event.type === 'army.departed' &&
          event.clanId === 'clan.hojo' &&
          event.targetNodeId === 'castle.yuki',
      )
    )
      departureTick = state.time.day;
    if (
      result.events.some(
        (event) =>
          event.type === 'army.arrived' &&
          event.clanId === 'clan.hojo' &&
          event.nodeId === 'castle.yuki',
      )
    ) {
      arrivalTick = state.time.day;
      arrivalSoldiers = state.castles[yukiCastleId]!.soldiers;
      arrivalMorale = state.castles[yukiCastleId]!.morale;
    }
    if (
      result.events.some((event) => event.type === 'clan.destroyed' && event.clanId === 'clan.yuki')
    ) {
      destroyed = true;
      expect(state.clans['clan.yuki' as ClanId]?.alive).toBe(false);
      expect(
        result.events.some(
          (event) =>
            event.type === 'siege.ended' && event.castleId === 'castle.yuki' && event.fallen,
        ),
      ).toBe(true);
      expect(
        state.diplomacy.missions.some(
          (mission) => mission.fromClanId === 'clan.yuki' || mission.target === 'clan.yuki',
        ),
      ).toBe(false);
    }
    expect(validateState(state), `day${state.time.day}`).toEqual([]);
  }
  expect(destroyed).toBe(false);
  expect(departureTick).toBe(157);
  expect(arrivalTick).toBe(158);
  const castle = state.castles[yukiCastleId]!;
  expect(state.clans['clan.yuki' as ClanId]!.alive).toBe(true);
  expect(castle.ownerClanId).toBe('clan.yuki');
  expect(castle.durability).toBeGreaterThan(0);
  expect(castle.durability).toBeLessThan(initialDurability);
  expect(castle.morale).toBeGreaterThan(0);
  expect(castle.morale).toBeLessThan(arrivalMorale!);
  expect(castle.soldiers).toBeGreaterThan(0);
  expect(castle.soldiers).toBeLessThan(arrivalSoldiers!);
  const siege = Object.values(state.sieges).find((candidate) => candidate.castleId === castle.id)!;
  expect(siege).toMatchObject({
    attackerClanId: 'clan.hojo',
    mode: 'assault',
    startDay: 158,
    interrupted: false,
  });
  expect(siege.attackerArmyIds.length).toBeGreaterThan(0);
  for (const armyId of siege.attackerArmyIds)
    expect(state.armies[armyId]).toMatchObject({
      clanId: 'clan.hojo',
      status: 'sieging',
      siegeId: siege.id,
    });
}, 15_000);
