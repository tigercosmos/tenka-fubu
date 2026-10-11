import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiplomacyPanel } from '../../src/ui/screens/DiplomacyPanel';
import { bumpTickSeq, resetGameStoreForTests, setGame } from '../../src/app/store';
import { getQueuedPlayerCommands, resetBridgeForTests } from '../../src/app/bridge';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { validateState } from '../../src/core/state/invariants';
import type { Pact } from '../../src/core/state/gameState';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});

// Controlled, invariant-valid saved pact facts; not a proposal negotiation journey.
function fixture(kind?: Pact['kind'], reversed = false) {
  const game = buildTinyState();
  const row = ensureDiplomacyRow(game, CLAN_ALPHA, CLAN_BETA);
  if (reversed) {
    game.meta.playerClanId = CLAN_BETA;
  }
  if (kind !== undefined) {
    row.pacts.push({
      kind,
      startDay: game.time.day,
      endDay: kind === 'marriage' || kind === 'vassal' ? null : game.time.day + 30,
      vassalClanId: kind === 'vassal' ? CLAN_BETA : null,
    });
  }
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  return { game, row };
}

function relationButton(name: string) {
  return screen.getByRole('button', { name: new RegExp(name) });
}

describe('current diplomacy pact indicators', () => {
  it.each(['alliance', 'marriage', 'ceasefire', 'vassal'] as const)(
    'shows %s in the relation entry and selected detail without writes',
    (kind) => {
      const { game } = fixture(kind);
      const before = structuredClone(game);
      render(<DiplomacyPanel />);
      const button = relationButton(game.clans[CLAN_BETA]!.name);
      expect(within(button).getByRole('img', { name: t(`term.pact.${kind}`) })).toBeTruthy();
      expect(screen.getAllByRole('img', { name: t(`term.pact.${kind}`) })).toHaveLength(2);
      expect(button.querySelector('button')).toBeNull();
      if (kind === 'alliance') expect(button.querySelector('svg')).not.toBeNull();
      else
        expect(
          within(button).getByText({ marriage: '婚', ceasefire: '休', vassal: '從' }[kind]),
        ).toBeTruthy();
      if (kind === 'marriage') expect(screen.getByText(t('ui.diplomacy.permanent'))).toBeTruthy();
      if (kind === 'vassal') {
        expect(
          screen.getByText(
            new RegExp(t('ui.diplomacy.vassalClan', { name: game.clans[CLAN_BETA]!.name })),
          ),
        ).toBeTruthy();
      }
      expect(game).toEqual(before);
      expect(getQueuedPlayerCommands(game)).toEqual([]);
    },
  );

  it.each(['alliance', 'marriage', 'ceasefire', 'vassal'] as const)(
    'reads %s with the player in the other row orientation',
    (kind) => {
      const { game } = fixture(kind, true);
      render(<DiplomacyPanel />);
      expect(
        within(relationButton(game.clans[CLAN_ALPHA]!.name)).getByRole('img', {
          name: t(`term.pact.${kind}`),
        }),
      ).toBeTruthy();
    },
  );

  it('has no invented pact for an empty row and refreshes removal and replacement', () => {
    const { game, row } = fixture();
    render(<DiplomacyPanel />);
    const name = game.clans[CLAN_BETA]!.name;
    expect(within(relationButton(name)).queryByRole('img')).toBeNull();
    act(() => {
      row.pacts.push({
        kind: 'alliance',
        startDay: game.time.day,
        endDay: game.time.day + 30,
        vassalClanId: null,
      });
      bumpTickSeq();
    });
    expect(
      within(relationButton(name)).getByRole('img', { name: t('term.pact.alliance') }),
    ).toBeTruthy();
    act(() => {
      row.pacts = [];
      bumpTickSeq();
    });
    expect(within(relationButton(name)).queryByRole('img')).toBeNull();
    const replacement = buildTinyState();
    ensureDiplomacyRow(replacement, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'marriage',
      startDay: replacement.time.day,
      endDay: null,
      vassalClanId: null,
    });
    expect(validateState(replacement)).toEqual([]);
    const before = structuredClone(replacement);
    act(() => setGame(replacement));
    expect(
      within(relationButton(name)).getByRole('img', { name: t('term.pact.marriage') }),
    ).toBeTruthy();
    expect(
      within(relationButton(name)).queryByRole('img', { name: t('term.pact.alliance') }),
    ).toBeNull();
    expect(replacement).toEqual(before);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });
});
