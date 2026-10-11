import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import { CaptiveSummary } from '../../src/ui/screens/CaptiveSummary';
import { bumpTickSeq, resetGameStoreForTests, setGame } from '../../src/app/store';
import { getQueuedPlayerCommands, resetBridgeForTests } from '../../src/app/bridge';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import type { ClanId, TraitId } from '../../src/core/state/ids';
import { rankLabel } from '../../src/ui/screens/OfficerList';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, CASTLE_A1, CLAN_ALPHA, CLAN_BETA, OFF_BETA_BUSHO } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetBridgeForTests();
  resetGameStoreForTests();
});

function fixture() {
  const game = buildTinyState();
  const officer = game.officers[OFF_BETA_BUSHO]!;
  officer.status = 'captive';
  officer.capturedByClanId = CLAN_ALPHA;
  officer.locationCastleId = CASTLE_A1;
  officer.loyalty = 88;
  officer.ldr = 119;
  officer.statGrowth.ldr = 5;
  officer.traits = ['trait.gunshin' as TraitId];
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  return { game, officer };
}

it('the actual captive decision modal presents retained allegiance, loyalty, rank, four ordinary abilities and traits without writes', () => {
  const { game, officer } = fixture();
  const before = structuredClone(game);
  render(<CaptiveModal officerId={officer.id} />);
  expect(screen.getByText(t('ui.captive.originalClan'))).toBeTruthy();
  expect(screen.getByText('乙家')).toBeTruthy();
  expect(screen.getByText(t('ui.captive.oldLoyalty'))).toBeTruthy();
  expect(screen.getByText('88')).toBeTruthy();
  expect(screen.getByText(rankLabel(officer.rank))).toBeTruthy();
  for (const stat of ['ldr', 'val', 'int', 'pol'] as const) {
    const value = Math.min(BAL.abilityMax, officer[stat] + officer.statGrowth[stat]);
    expect(screen.getByRole('img', { name: `${t(`ui.officer.${stat}`)} ${value}` })).toBeTruthy();
  }
  expect(screen.getByText('軍神')).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('refreshes detached facts on ordinary ticks and same-ID game replacement', () => {
  const { game, officer } = fixture();
  render(<CaptiveSummary officerId={officer.id} />);
  act(() => {
    officer.loyalty = 49;
    officer.pol = 118;
    officer.statGrowth.pol = 5;
    bumpTickSeq();
  });
  expect(screen.getByText('49')).toBeTruthy();
  expect(screen.getByRole('img', { name: `${t('ui.officer.pol')} 120` })).toBeTruthy();
  const replacement = structuredClone(game);
  replacement.officers[officer.id]!.loyalty = 30;
  replacement.clans[CLAN_BETA]!.name = '新乙家';
  const oldBefore = structuredClone(game);
  const newBefore = structuredClone(replacement);
  act(() => setGame(replacement));
  expect(screen.getByText('30')).toBeTruthy();
  expect(screen.getByText('新乙家')).toBeTruthy();
  expect(game).toEqual(oldBefore);
  expect(replacement).toEqual(newBefore);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
});

it('shows an extinct original clan by its retained name in an invariant-valid captive state', () => {
  const { game, officer } = fixture();
  const clan = game.clans[CLAN_BETA]!;
  clan.alive = false;
  clan.destroyedDay = game.time.day;
  for (const castle of Object.values(game.castles)) {
    if (castle.ownerClanId === CLAN_BETA) {
      castle.ownerClanId = CLAN_ALPHA;
      castle.lordId = null;
    }
  }
  for (const district of Object.values(game.districts)) {
    if (district.ownerClanId === CLAN_BETA) district.ownerClanId = CLAN_ALPHA;
  }
  for (const other of Object.values(game.officers)) {
    if (other.clanId === CLAN_BETA && other.status === 'serving') {
      other.status = 'ronin';
      other.clanId = null;
    }
  }
  expect(validateState(game)).toEqual([]);
  const before = structuredClone(game);
  render(<CaptiveSummary officerId={officer.id} />);
  expect(screen.getByText('乙家')).toBeTruthy();
  expect(game).toEqual(before);
});

it.each([null, 'clan.missing' as ClanId])(
  'uses explicit retained-reference fallback for diagnostic malformed original clan %s',
  (clanId) => {
    const { game, officer } = fixture();
    officer.clanId = clanId;
    const before = structuredClone(game);
    render(<CaptiveSummary officerId={officer.id} />);
    expect(screen.getByText(clanId ?? t('ui.captive.originalClanUnknown'))).toBeTruthy();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);

it('reuses actual trait descriptions and resets pending/visible ownership on session replacement', () => {
  const { game, officer } = fixture();
  render(<CaptiveSummary officerId={officer.id} />);
  vi.useFakeTimers();
  const before = structuredClone(game);
  const chip = screen.getByRole('button', { name: '軍神' });
  expect(chip.getAttribute('type')).toBe('button');
  act(() => chip.focus());
  expect(document.activeElement).toBe(chip);
  expect(screen.getByRole('tooltip').textContent).toContain('合戰');
  act(() => bumpTickSeq());
  expect(screen.getByRole('tooltip')).toBeTruthy();
  act(() => setGame(structuredClone(game)));
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.pointerEnter(screen.getByText('軍神'));
  void act(() => vi.advanceTimersByTime(200));
  act(() => setGame(structuredClone(game)));
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
