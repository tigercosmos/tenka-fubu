import { advanceDay } from '../../src/core/systems';
import type { Command, CommandEnvelope } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import { balanceHash, stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import {
  buildMiniState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_B2,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO_A,
  OFF_ALPHA_TAISHO_B,
  OFF_ALPHA_TAISHO_C,
  OFF_BETA_LORD,
  OFF_BETA_TAISHO_A,
  OFF_BETA_TAISHO_B,
} from '../fixtures/mini';

const GAMMA = 'clan.gamma' as ClanId;
const GAMMA_LEADER = 'off.gamma-lord' as OfficerId;
const GAMMA_TARGET = 'off.gamma-target' as OfficerId;
const ALPHA_PLOTTER = 'off.alpha-plotter' as OfficerId;
const SEED = 42;
const TICKS = 1800;

export interface DiplomacyGoldenSnapshot {
  formatVersion: 1;
  scenarioId: string;
  seed: number;
  ticks: number;
  balanceHash: string;
  checkpoints: Array<{ day: number; hash: string }>;
  appliedCommands: Record<string, number>;
  eventCounts: Record<string, number>;
  plotResolutions: Array<{ day: number; kind: string; outcome: string }>;
}

/** Zod-built mini geography with a third independent target; setup is not a gameplay mutation. */
function setup(): GameState {
  const state = buildMiniState({ seed: SEED });
  state.meta.scenarioId = 'mini-diplomacy';
  state.ai.clans = {};
  state.clans[GAMMA] = {
    ...structuredClone(state.clans[CLAN_BETA]!),
    id: GAMMA,
    name: '丙家',
    homeCastleId: CASTLE_B2,
    leaderId: GAMMA_LEADER,
    colorIndex: 2,
  };
  state.castles[CASTLE_B2]!.ownerClanId = GAMMA;
  state.castles[CASTLE_B2]!.tier = 'main';
  for (const district of Object.values(state.districts))
    if (district.castleId === CASTLE_B2) district.ownerClanId = GAMMA;
  for (const id of [GAMMA_LEADER, GAMMA_TARGET])
    state.officers[id] = {
      ...structuredClone(state.officers[OFF_BETA_LORD]!),
      id,
      name: id === GAMMA_LEADER ? '丙家當主' : '丙家武將',
      clanId: GAMMA,
      locationCastleId: CASTLE_B2,
      debutClanId: GAMMA,
      debutCastleId: CASTLE_B2,
      kinship: id === GAMMA_LEADER ? 'kin' : 'tozama',
      spouseId: null,
    };
  const lord = state.officers[OFF_BETA_TAISHO_A]!;
  lord.clanId = GAMMA;
  lord.debutClanId = GAMMA;
  lord.locationCastleId = CASTLE_B2;
  lord.kinship = 'tozama';
  lord.loyalty = 40;
  state.castles[CASTLE_B2]!.lordId = lord.id;
  state.officers[GAMMA_TARGET]!.loyalty = 30;
  state.officers[ALPHA_PLOTTER] = {
    ...structuredClone(state.officers[OFF_ALPHA_TAISHO_C]!),
    id: ALPHA_PLOTTER,
    name: '甲家調略武將',
    int: 100,
  };
  for (const clan of Object.values(state.clans)) clan.gold = 100_000;
  for (const officer of Object.values(state.officers)) {
    officer.deathYear = 1700;
    officer.scheduledDeath = { year: 1700, month: 1 };
    officer.birthYear = 1535;
    officer.debutYear = 1550;
    officer.traits = [];
  }
  for (const id of [OFF_ALPHA_LORD, OFF_ALPHA_TAISHO_B]) state.officers[id]!.pol = 100;
  for (const id of [OFF_ALPHA_TAISHO_A, OFF_ALPHA_TAISHO_C]) state.officers[id]!.int = 100;
  for (const id of [OFF_ALPHA_TAISHO_C, OFF_BETA_TAISHO_B]) state.officers[id]!.kinship = 'kin';
  state.court.courtFavor[CLAN_ALPHA] = 50;
  ensureDiplomacyRow(state, CLAN_ALPHA, GAMMA).lastHostileDay = state.time.day;
  return state;
}

function script(tick: number): Command[] {
  const plot = (kind: 'rumor' | 'poach' | 'betrayal'): Command => ({
    type: 'startPlot',
    clanId: CLAN_ALPHA,
    kind,
    executorId:
      kind === 'poach'
        ? OFF_ALPHA_TAISHO_A
        : kind === 'betrayal'
          ? ALPHA_PLOTTER
          : OFF_ALPHA_TAISHO_C,
    targetClanId: GAMMA,
    targetOfficerId: kind === 'poach' ? GAMMA_TARGET : null,
    targetCastleId: kind === 'poach' ? null : CASTLE_B2,
    investGold: kind === 'poach' ? 1000 : kind === 'betrayal' ? 2000 : 0,
  });
  switch (tick) {
    case 1:
      return [
        { type: 'startDiploWork', clanId: CLAN_ALPHA, executorId: OFF_ALPHA_LORD, target: 'court' },
        {
          type: 'startDiploWork',
          clanId: CLAN_ALPHA,
          executorId: OFF_ALPHA_TAISHO_B,
          target: CLAN_BETA,
        },
        ...Array.from({ length: 3 }, (): Command => ({
          type: 'requestCourtRank',
          clanId: CLAN_ALPHA,
        })),
        plot('rumor'),
        plot('poach'),
        plot('betrayal'),
      ];
    case 170:
      return [{ type: 'requestMediation', clanId: CLAN_ALPHA, targetClanId: GAMMA }];
    case 421:
      return [
        {
          type: 'proposePact',
          clanId: CLAN_ALPHA,
          targetClanId: CLAN_BETA,
          kind: 'proposeAlliance',
          reinforceAgainstClanId: null,
        },
      ];
    case 781:
      return [
        {
          type: 'proposePact',
          clanId: CLAN_ALPHA,
          targetClanId: CLAN_BETA,
          kind: 'proposeMarriage',
          reinforceAgainstClanId: null,
        },
      ];
    case 901:
      return [
        { type: 'requestCourtRank', clanId: CLAN_ALPHA },
        { type: 'requestCourtRank', clanId: CLAN_ALPHA },
      ];
    case 1201:
      return [{ type: 'breakPact', clanId: CLAN_ALPHA, targetClanId: CLAN_BETA, kind: 'alliance' }];
    default:
      return [];
  }
}

export function runDiplomacyGolden(): DiplomacyGoldenSnapshot {
  let state = setup(),
    seq = 0;
  const plotResolutions: DiplomacyGoldenSnapshot['plotResolutions'] = [];
  const checkpoints: DiplomacyGoldenSnapshot['checkpoints'] = [],
    appliedCommands: Record<string, number> = {},
    eventCounts: Record<string, number> = {};
  for (let tick = 1; tick <= TICKS; tick++) {
    const queue: CommandEnvelope[] = script(tick).map((command) => ({
      seq: ++seq,
      issuedDay: state.time.day,
      command,
    }));
    const result = advanceDay(state, queue);
    if (result.appliedCommands.length !== queue.length)
      throw new Error(
        `Diplomacy golden tick ${tick}: rejected fixed command ${JSON.stringify(result.events.filter((e) => e.type === 'command.rejected'))}`,
      );
    for (const { command } of queue)
      appliedCommands[command.type] = (appliedCommands[command.type] ?? 0) + 1;
    for (const event of result.events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
      if (
        event.type === 'plot.succeeded' ||
        event.type === 'plot.failed' ||
        event.type === 'plot.exposed'
      )
        plotResolutions.push({ day: tick, kind: event.kind, outcome: event.type });
    }
    const violations = validateState(state);
    if (violations.length)
      throw new Error(`Diplomacy golden tick ${tick}: ${JSON.stringify(violations)}`);
    if (tick % 30 === 0) checkpoints.push({ day: tick, hash: stateHash(state) });
    if (tick === 900) {
      const hash = stateHash(state),
        decoded = decodeSave(encodeSave(state, 0));
      if (!decoded.ok) throw new Error('Diplomacy golden midpoint save failed');
      state = decoded.saveFile.state;
      if (stateHash(state) !== hash)
        throw new Error('Diplomacy golden midpoint save changed state');
    }
  }
  if (state.meta.gameOver !== null) throw new Error('Diplomacy golden unexpectedly ended early');
  for (const type of [
    'court.rankGranted',
    'court.mediationResult',
    'pact.signed',
    'pact.broken',
    'plot.succeeded',
  ])
    if (!eventCounts[type]) throw new Error(`Diplomacy golden did not exercise ${type}`);
  if (
    (eventCounts['plot.succeeded'] ?? 0) +
      (eventCounts['plot.failed'] ?? 0) +
      (eventCounts['plot.exposed'] ?? 0) !==
    3
  )
    throw new Error('Diplomacy golden did not settle all three plot kinds');
  if (new Set(plotResolutions.map((resolution) => resolution.kind)).size !== 3)
    throw new Error('Diplomacy golden missed a plot kind');
  if (eventCounts['pact.signed'] !== 3)
    throw new Error('Diplomacy golden did not sign mediation, alliance and marriage');
  const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
  if (!row.pacts.some((p) => p.kind === 'marriage'))
    throw new Error('Diplomacy golden marriage did not succeed');
  return {
    formatVersion: 1,
    scenarioId: state.meta.scenarioId,
    seed: SEED,
    ticks: TICKS,
    balanceHash: balanceHash(),
    checkpoints,
    appliedCommands,
    eventCounts,
    plotResolutions,
  };
}
