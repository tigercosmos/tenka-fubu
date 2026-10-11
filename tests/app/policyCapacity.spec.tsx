import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PolicyPanel } from '../../src/ui/screens/panels/PolicyPanel';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { BAL } from '../../src/core/balance';
import { extraPolicySlots, collapseShogunate } from '../../src/core/systems/court';
import { validateEnactPolicy } from '../../src/core/commands/domesticCommands';
import { validateState } from '../../src/core/state/invariants';
import type { CourtRank, ShogunateTitle } from '../../src/core/state/enums';
import type { PolicyId } from '../../src/core/state/ids';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});

function fixture(
  rank: CourtRank,
  title: ShogunateTitle,
  prestige: number = BAL.policySlotPrestige,
) {
  const game = buildTinyState();
  Object.assign(game.clans[CLAN_ALPHA]!, {
    courtRank: rank,
    shogunateTitle: title,
    prestige,
    gold: 100_000,
  });
  game.court.shogunateExists = true;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  initializeBridgeSession(game);
  return game;
}
function capacity(game: ReturnType<typeof buildTinyState>) {
  return Math.min(
    BAL.policySlotMax,
    1 +
      Math.floor(game.clans[CLAN_ALPHA]!.prestige / BAL.policySlotPrestige) +
      extraPolicySlots(game, CLAN_ALPHA),
  );
}
function label(game: ReturnType<typeof buildTinyState>) {
  return t('ui.policy.active', {
    n: game.policies[CLAN_ALPHA]!.active.length,
    max: capacity(game),
  });
}

it.each([
  ['none', 'none', 0],
  ['ju4jo', 'none', 1],
  ['sho2', 'none', 2],
  ['ju4jo', 'kanrei', 2],
  ['sho2', 'kanrei', 3],
] as const)(
  'renders canonical cumulative slots for %s / %s without mutation',
  (rank, title, bonus) => {
    const game = fixture(rank, title);
    expect(extraPolicySlots(game, CLAN_ALPHA)).toBe(bonus);
    const before = structuredClone(game);
    render(<PolicyPanel />);
    expect(screen.getByText(label(game))).toBeTruthy();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);

it('caps at six and matches central enactment permission at the displayed boundary', () => {
  const game = fixture('sho2', 'kanrei', BAL.policySlotPrestige * BAL.policySlotMax);
  const active = [
    'pol.rakuichi',
    'pol.kenchi',
    'pol.tenmasei',
    'pol.jishahogo',
    'pol.sekisho',
  ] as PolicyId[];
  game.policies[CLAN_ALPHA]!.active = active;
  expect(validateState(game)).toEqual([]);
  const cmd = {
    type: 'enactPolicy' as const,
    clanId: CLAN_ALPHA,
    policyId: 'pol.meyasubako' as PolicyId,
  };
  expect(validateEnactPolicy(game, cmd).ok).toBe(true);
  const before = structuredClone(game);
  render(<PolicyPanel />);
  expect(capacity(game)).toBe(BAL.policySlotMax);
  expect(screen.getByText(label(game))).toBeTruthy();
  const article = screen
    .getByRole('heading', { name: t('pol.meyasubako.name') })
    .closest('article')!;
  const button = within(article).getByRole('button', { name: t('ui.policy.adopt') });
  expect(button.hasAttribute('disabled')).toBe(false);
  fireEvent.click(button);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([cmd]);
  act(() => {
    runOneDay();
  });
  expect(game.policies[CLAN_ALPHA]!.active).toContain(cmd.policyId);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
  expect(validateEnactPolicy(game, { ...cmd, policyId: 'pol.jokashuju' as PolicyId }).ok).toBe(
    false,
  );
  const remaining = screen
    .getByRole('heading', { name: t('pol.jokashuju.name') })
    .closest('article')!;
  expect(
    within(remaining)
      .getByRole('button', { name: t('ui.policy.adopt') })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByText(label(game))).toBeTruthy();
});

it('shows the bonus slot that central validation permits and refreshes after the real queued day', () => {
  const game = fixture('ju4jo', 'none');
  game.policies[CLAN_ALPHA]!.active = ['pol.rakuichi', 'pol.tenmasei'] as PolicyId[];
  expect(validateState(game)).toEqual([]);
  const cmd = {
    type: 'enactPolicy' as const,
    clanId: CLAN_ALPHA,
    policyId: 'pol.meyasubako' as PolicyId,
  };
  expect(validateEnactPolicy(game, cmd).ok).toBe(true);
  const before = structuredClone(game);
  render(<PolicyPanel />);
  expect(screen.getByText(label(game))).toBeTruthy();
  const article = screen
    .getByRole('heading', { name: t('pol.meyasubako.name') })
    .closest('article')!;
  fireEvent.click(within(article).getByRole('button', { name: t('ui.policy.adopt') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([cmd]);
  act(() => {
    runOneDay();
  });
  expect(game.policies[CLAN_ALPHA]!.active).toContain(cmd.policyId);
  expect(validateState(game)).toEqual([]);
  expect(screen.getByText(label(game))).toBeTruthy();
  expect(validateEnactPolicy(game, { ...cmd, policyId: 'pol.sekisho' as PolicyId }).ok).toBe(false);
});

it('refreshes on ordinary publication, actual shogunate collapse and same-ID replacement', () => {
  const game = fixture('ju4jo', 'none');
  render(<PolicyPanel />);
  expect(screen.getByText(label(game))).toBeTruthy();
  act(() => {
    game.clans[CLAN_ALPHA]!.courtRank = 'sho2';
    game.clans[CLAN_ALPHA]!.shogunateTitle = 'kanrei';
    bumpTickSeq();
  });
  expect(validateState(game)).toEqual([]);
  expect(screen.getByText(label(game))).toBeTruthy();
  act(() => {
    collapseShogunate(game, () => {});
    bumpTickSeq();
  });
  expect(validateState(game)).toEqual([]);
  const collapsed = structuredClone(game);
  expect(screen.getByText(label(game))).toBeTruthy();
  const replacement = buildTinyState();
  const fresh = structuredClone(replacement);
  act(() => setGame(replacement));
  expect(screen.getByText(label(replacement))).toBeTruthy();
  expect(game).toEqual(collapsed);
  expect(replacement).toEqual(fresh);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
});
