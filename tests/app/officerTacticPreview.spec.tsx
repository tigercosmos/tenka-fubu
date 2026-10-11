import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { OfficerDetail } from '../../src/ui/screens/OfficerDetail';
import { bumpTickSeq, resetGameStoreForTests, setGame } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { TACTICS, TACTIC_IDS } from '../../src/core/tactics';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, OFF_ALPHA_BUSHO, OFF_ALPHA_TAISHO } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

const label = t('ui.march.officerTactics', { tactics: '' });
const tacticLabel = (id: (typeof TACTIC_IDS)[number]) =>
  t('ui.march.tacticCost', { name: t(`${id}.name`), cost: TACTICS[id]!.saihaiCost });
function list() {
  return within(screen.getByRole('region', { name: label }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}
function fixture() {
  const game = buildTinyState();
  game.officers[OFF_ALPHA_BUSHO]!.traits = [];
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  return game;
}

it('shows the canonical default tactics and costs without pretending they are usable battle actions', () => {
  const game = fixture();
  game.officers[OFF_ALPHA_TAISHO]!.traits = [TACTICS[TACTIC_IDS[2]]!.unlockTraitId!];
  expect(validateState(game)).toEqual([]);
  const before = structuredClone(game);
  render(<OfficerDetail officerId={OFF_ALPHA_BUSHO} />);
  expect(list()).toEqual(
    ['tac.charge', 'tac.volley'].map((id) => tacticLabel(id as (typeof TACTIC_IDS)[number])),
  );
  const region = screen.getByRole('region', { name: label });
  expect(within(region).getByText(t('ui.march.tacticPreviewNote'))).toBeTruthy();
  expect(within(region).queryByRole('button')).toBeNull();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});

it('includes every trait-unlocked tactic once in canonical order', () => {
  const game = fixture();
  game.officers[OFF_ALPHA_BUSHO]!.traits = TACTIC_IDS.flatMap((id) => {
    const trait = TACTICS[id]!.unlockTraitId;
    return trait === null ? [] : [trait];
  });
  expect(validateState(game)).toEqual([]);
  const before = structuredClone(game);
  render(<OfficerDetail officerId={OFF_ALPHA_BUSHO} />);
  expect(list()).toEqual(TACTIC_IDS.map(tacticLabel));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('refreshes in-place trait changes and a same-ID native replacement without mutating state or RNG', () => {
  const game = fixture();
  render(<OfficerDetail officerId={OFF_ALPHA_BUSHO} />);
  const gunshin = TACTICS[TACTIC_IDS[2]]!.unlockTraitId!;
  act(() => {
    game.officers[OFF_ALPHA_BUSHO]!.traits = [gunshin];
    bumpTickSeq();
  });
  const afterChange = structuredClone(game);
  expect(list()).toEqual(TACTIC_IDS.slice(0, 3).map(tacticLabel));
  expect(game).toEqual(afterChange);
  expect(validateState(game)).toEqual([]);
  const replacementSource = buildTinyState();
  replacementSource.officers[OFF_ALPHA_BUSHO]!.traits = [];
  const decoded = decodeSave(encodeSave(replacementSource, 123));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  const replacement = decoded.saveFile.state;
  const before = structuredClone(replacement);
  act(() => {
    setGame(replacement);
    initializeBridgeSession(replacement, [], { loaded: true });
  });
  expect(list()).toEqual(TACTIC_IDS.slice(0, 2).map(tacticLabel));
  expect(replacement).toEqual(before);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  expect(validateState(replacement)).toEqual([]);
});
