import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { MarchModal } from '../../src/ui/screens/MarchModal';
import { bumpTickSeq, resetGameStoreForTests, setGame } from '../../src/app/store';
import { getOfficerTacticIds, validateCommand } from '../../src/core/index';
import { TACTICS, TACTIC_IDS } from '../../src/core/tactics';
import type { RoadEdgeId, TraitId } from '../../src/core/state/ids';
import { CommandQueue } from '../../src/core/commands/queue';
import { defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import { getAvailableTacticIds } from '../../src/core/tactics';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});

it('matches generated tactical units after real queued marches and calendar-driven physical encounter', () => {
  const game = fixture();
  const roadId = 'road.preview-frontier' as RoadEdgeId;
  game.roads[roadId] = {
    id: roadId,
    a: CASTLE_A1,
    b: CASTLE_B1,
    type: 'land',
    grade: 1,
    baseDays: 4,
  };
  const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
  row.lastHostileDay = game.time.day;
  game.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)] = row;
  game.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.benzetsu' as TraitId];
  game.officers[OFF_ALPHA_LORD]!.traits = ['trait.gunshin' as TraitId];
  uiStore.getState().actions.setMarchDraft({
    ...uiStore.getState().marchDraft!,
    leaderOfficerId: OFF_ALPHA_LORD,
    subOfficerIds: [OFF_ALPHA_BUSHO],
  });
  expect(validateState(game)).toEqual([]);
  render(<MarchModal />);
  const shown = within(screen.getByTestId('march-formation-tactics'))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
  cleanup();
  const queue = new CommandQueue(game.meta.lastAppliedCmdSeq + 1);
  for (const [clanId, originCastleId, leaderId, targetNodeId] of [
    [CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_LORD, CASTLE_B1],
    [CLAN_BETA, CASTLE_B1, OFF_BETA_LORD, CASTLE_A1],
  ] as const) {
    const command = {
      type: 'march' as const,
      clanId,
      originCastleId,
      leaderId,
      targetNodeId,
      deputyIds: clanId === CLAN_ALPHA ? [OFF_ALPHA_BUSHO] : [],
      soldiers: 1800,
      food: 1200,
    };
    const authority =
      clanId === CLAN_ALPHA ? { kind: 'player' as const } : { kind: 'clan' as const, clanId };
    expect(validateCommand(game, command, authority)).toEqual({ ok: true });
    queue.enqueue(command, game.time.day, authority);
  }
  const result = advanceDay(game, queue.drain());
  expect(result.appliedCommands).toHaveLength(2);
  for (let day = 0; day < 20 && Object.keys(game.fieldCombats).length === 0; day++) {
    advanceDay(game, []);
    expect(validateState(game)).toEqual([]);
  }
  const combat = Object.values(game.fieldCombats)[0]!;
  expect(combat).toBeDefined();
  const command = { type: 'startKassen' as const, clanId: CLAN_ALPHA, fieldCombatId: combat.id };
  expect(validateCommand(game, command)).toEqual({ ok: true });
  queue.enqueue(command, game.time.day);
  expect(advanceDay(game, queue.drain()).appliedCommands).toHaveLength(1);
  const battle = Object.values(game.battles)[0]!;
  const unit = battle.units.find((item) => item.generalId === OFF_ALPHA_LORD)!;
  expect(unit).toBeDefined();
  expect(shown).toEqual(getAvailableTacticIds(game, unit).map(tacticText));
  expect(validateState(game)).toEqual([]);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});

function fixture() {
  const game = buildTinyState();
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  uiStore.getState().actions.setMarchDraft({
    originCastleId: CASTLE_A1,
    leaderOfficerId: OFF_ALPHA_BUSHO,
    subOfficerIds: [],
    soldiers: 100,
    food: 100,
    targetNodeId: null,
    previewPath: null,
    previewDays: null,
    phase: 'compose',
    errorKey: null,
  });
  return game;
}

it('the actual formation modal shows canonical default tactics, costs and the usability qualification without game writes', () => {
  const game = fixture();
  const before = structuredClone(game);
  render(<MarchModal />);
  expect(screen.getByRole('heading', { name: t('ui.march.formationTactics') })).toBeTruthy();
  expect(screen.getByText(t('ui.march.tacticPreviewNote'))).toBeTruthy();
  const formation = screen.getByTestId('march-formation-tactics');
  expect(
    within(formation)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(getOfficerTacticIds(game, [OFF_ALPHA_BUSHO]).map(tacticText));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

function tacticText(id: (typeof TACTIC_IDS)[number]) {
  return t('ui.march.tacticCost', { name: t(`${id}.name`), cost: TACTICS[id]!.saihaiCost });
}

it('shows each eligible card contribution and deduplicates selected deputies in canonical order', () => {
  const game = fixture();
  game.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.gunshin' as TraitId];
  game.officers[OFF_ALPHA_LORD]!.traits = ['trait.benzetsu' as TraitId];
  const before = structuredClone(game);
  render(<MarchModal />);
  for (const id of [OFF_ALPHA_BUSHO, OFF_ALPHA_LORD]) {
    const card = screen.getByTestId(`march-general-${id}`);
    expect(card.textContent).toContain(
      t('ui.march.officerTactics', {
        tactics: getOfficerTacticIds(game, [id])
          .map((tactic) => t(`${tactic}.name`))
          .join('、'),
      }),
    );
  }
  const deputyCard = screen.getByTestId(`march-deputy-${OFF_ALPHA_LORD}`);
  fireEvent.click(within(deputyCard).getByRole('button'));
  const formation = screen.getByTestId('march-formation-tactics');
  expect(
    within(formation)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(getOfficerTacticIds(game, [OFF_ALPHA_BUSHO, OFF_ALPHA_LORD]).map(tacticText));
  fireEvent.click(within(deputyCard).getByRole('button'));
  expect(
    within(formation)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(getOfficerTacticIds(game, [OFF_ALPHA_BUSHO]).map(tacticText));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('covers every canonical unlock and refreshes same-ID replacement without retained trait claims', () => {
  const game = fixture();
  game.officers[OFF_ALPHA_BUSHO]!.traits = TACTIC_IDS.flatMap((id) => {
    const trait = TACTICS[id]!.unlockTraitId;
    return trait === null ? [] : [trait];
  });
  expect(validateState(game)).toEqual([]);
  render(<MarchModal />);
  expect(
    within(screen.getByTestId('march-formation-tactics'))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(TACTIC_IDS.map(tacticText));
  act(() => {
    game.officers[OFF_ALPHA_BUSHO]!.traits = [];
    bumpTickSeq();
  });
  expect(
    within(screen.getByTestId('march-formation-tactics')).getAllByRole('listitem'),
  ).toHaveLength(2);
  const replacement = structuredClone(game);
  replacement.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.benzetsu' as TraitId];
  act(() => setGame(replacement));
  expect(
    within(screen.getByTestId('march-formation-tactics'))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(getOfficerTacticIds(replacement, [OFF_ALPHA_BUSHO]).map(tacticText));
});

it('does not describe an invalid leader or stale relocated deputy as a current formation', () => {
  const game = fixture();
  const draft = uiStore.getState().marchDraft!;
  uiStore
    .getState()
    .actions.setMarchDraft({ ...draft, subOfficerIds: [OFF_ALPHA_LORD, OFF_ALPHA_LORD] });
  game.officers[OFF_ALPHA_LORD]!.traits = ['trait.benzetsu' as TraitId];
  render(<MarchModal />);
  act(() => {
    game.castles[CASTLE_A1]!.lordId = null;
    game.officers[OFF_ALPHA_LORD]!.locationCastleId = CASTLE_A2;
    bumpTickSeq();
  });
  expect(validateState(game)).toEqual([]);
  expect(
    within(screen.getByTestId('march-formation-tactics'))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(getOfficerTacticIds(game, [OFF_ALPHA_BUSHO]).map(tacticText));
  act(() => {
    game.officers[OFF_ALPHA_BUSHO]!.locationCastleId = CASTLE_A2;
    bumpTickSeq();
  });
  expect(screen.getByText(t('ui.march.formationIncomplete'))).toBeTruthy();
  expect(validateState(game)).toEqual([]);
  expect(screen.queryByTestId('march-formation-tactics')).toBeNull();
});

it('the preview agrees with a real centrally validated deployed army roster without preview mutations', () => {
  const game = fixture();
  game.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.gunshin' as TraitId];
  game.officers[OFF_ALPHA_LORD]!.traits = ['trait.benzetsu' as TraitId];
  uiStore
    .getState()
    .actions.setMarchDraft({ ...uiStore.getState().marchDraft!, subOfficerIds: [OFF_ALPHA_LORD] });
  expect(validateState(game)).toEqual([]);
  render(<MarchModal />);
  const shown = within(screen.getByTestId('march-formation-tactics'))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
  const command = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    targetNodeId: CASTLE_A2,
    leaderId: OFF_ALPHA_BUSHO,
    deputyIds: [OFF_ALPHA_LORD],
    soldiers: 300,
    food: 180,
  };
  const before = structuredClone(game);
  expect(validateCommand(game, command)).toEqual({ ok: true });
  expect(game).toEqual(before);
  cleanup();
  expect(dispatchCommand(command)).toEqual({ ok: true });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([command]);
  runOneDay();
  const army = Object.values(game.armies)[0]!;
  expect(shown).toEqual(
    getOfficerTacticIds(game, [army.leaderId, ...army.deputyIds]).map(tacticText),
  );
  expect(validateState(game)).toEqual([]);
});
