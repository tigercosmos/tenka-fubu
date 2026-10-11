import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfficerDetail } from '../../src/ui/screens/OfficerDetail';
import { resetGameStoreForTests, bumpTickSeq, setGame } from '../../src/app/store';
import {
  initializeBridgeSession,
  getQueuedPlayerCommands,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { gainMerit } from '../../src/core/systems/officers';
import { BAL } from '../../src/core/balance';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';
import { buildTinyState, OFF_ALPHA_BUSHO } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
});

function fixture() {
  const game = buildTinyState();
  game.officers[OFF_ALPHA_BUSHO]!.traits = [];
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  return game;
}
const experienceLabel = (stat: 'ldr' | 'val' | 'int' | 'pol') =>
  t('ui.officer.growthExperience', { stat: t(`ui.officer.${stat}`) });

describe('OfficerDetail authoritative ability-growth progress', () => {
  it('renders actual zero, near-threshold and capped progress without fabricating cap experience', () => {
    const game = fixture();
    const officer = game.officers[OFF_ALPHA_BUSHO]!;
    officer.statExp.val = BAL.statExpPerPoint - 1;
    officer.statGrowth.int = BAL.statGrowthCap;
    officer.statExp.int = 0;
    expect(validateState(game)).toEqual([]);
    const before = structuredClone(game);
    render(<OfficerDetail officerId={officer.id} />);
    expect(screen.getByRole('heading', { name: t('ui.officer.growthTitle') })).toBeTruthy();
    const zero = screen.getByRole('progressbar', { name: experienceLabel('ldr') });
    expect(zero.getAttribute('aria-valuenow')).toBe('0');
    expect(zero.getAttribute('aria-valuemax')).toBe(String(BAL.statExpPerPoint));
    const almost = screen.getByRole('progressbar', { name: experienceLabel('val') });
    expect(almost.getAttribute('aria-valuenow')).toBe(String(BAL.statExpPerPoint - 1));
    const capped = screen.getByRole('progressbar', {
      name: t('ui.officer.growthCapped', { stat: t('ui.officer.int') }),
    });
    expect(capped.getAttribute('aria-valuenow')).toBe(String(BAL.statGrowthCap));
    expect(capped.getAttribute('aria-valuemax')).toBe(String(BAL.statGrowthCap));
    expect(screen.queryByRole('progressbar', { name: experienceLabel('int') })).toBeNull();
    expect(
      screen.getByText(
        t('ui.officer.growthSummary', {
          base: officer.int,
          growth: BAL.statGrowthCap,
          cap: BAL.statGrowthCap,
        }),
      ),
    ).toBeTruthy();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('refreshes after real merit advancement on the same object and resets on replacement', () => {
    const game = fixture();
    const officer = game.officers[OFF_ALPHA_BUSHO]!;
    officer.statExp.ldr = BAL.statExpPerPoint - 1;
    render(<OfficerDetail officerId={officer.id} />);
    expect(
      screen
        .getByRole('progressbar', { name: experienceLabel('ldr') })
        .getAttribute('aria-valuenow'),
    ).toBe(String(BAL.statExpPerPoint - 1));
    const rng = structuredClone(game.rng);
    act(() => {
      gainMerit(officer, 1, ['ldr']);
      bumpTickSeq();
    });
    expect(officer.statGrowth.ldr).toBe(1);
    expect(
      screen
        .getByRole('progressbar', { name: experienceLabel('ldr') })
        .getAttribute('aria-valuenow'),
    ).toBe('0');
    expect(
      screen.getByText(
        t('ui.officer.growthSummary', { base: officer.ldr, growth: 1, cap: BAL.statGrowthCap }),
      ),
    ).toBeTruthy();
    expect(game.rng).toEqual(rng);
    expect(validateState(game)).toEqual([]);
    const afterMerit = structuredClone(game);
    const replacement = buildTinyState();
    replacement.officers[officer.id]!.statExp.ldr = 7;
    const beforeReplacement = structuredClone(replacement);
    act(() => setGame(replacement));
    expect(
      screen
        .getByRole('progressbar', { name: experienceLabel('ldr') })
        .getAttribute('aria-valuenow'),
    ).toBe('7');
    expect(game).toEqual(afterMerit);
    expect(replacement).toEqual(beforeReplacement);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });
});
