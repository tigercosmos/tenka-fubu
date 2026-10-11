import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandAction } from '../../src/ui/components/CommandAction';
import { validateCommand } from '../../src/core/commands/validate';
import { applyMarch } from '../../src/core/commands/march';
import { REJECT_REASONS } from '../../src/core/commands/reasons';
import { validateState } from '../../src/core/state/invariants';
import { resetGameStoreForTests } from '../../src/app/store';
import {
  initializeBridgeSession,
  getQueuedPlayerCommands,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { t } from '../../src/i18n/zh-TW';
import {
  buildTinyState,
  CASTLE_A1,
  CLAN_ALPHA,
  DIST_A1X,
  DIST_A2X,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

beforeEach(() => resetBridgeForTests());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
describe('grant-fief authoritative named disabled feedback', () => {
  it.each(['location', 'army'] as const)(
    'preserves %s rejection and renders complete accessible officer feedback without i18n warnings',
    (mode) => {
      const game = buildTinyState();
      if (mode === 'army') {
        const march = {
          type: 'march' as const,
          clanId: CLAN_ALPHA,
          originCastleId: CASTLE_A1,
          leaderId: OFF_ALPHA_BUSHO,
          deputyIds: [],
          soldiers: 100,
          food: 200,
          targetNodeId: DIST_A1X,
        };
        expect(validateCommand(game, march)).toEqual({ ok: true });
        applyMarch(game, march, () => {});
      }
      expect(validateState(game)).toEqual([]);
      resetGameStoreForTests(game);
      initializeBridgeSession(game);
      const command = {
        type: 'grantFief' as const,
        clanId: CLAN_ALPHA,
        districtId: mode === 'army' ? DIST_A1X : DIST_A2X,
        officerId: OFF_ALPHA_BUSHO,
      };
      const before = structuredClone(game);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<CommandAction command={command} label="加封" />);
      const expected = t(REJECT_REASONS.officerBusy, {
        name: game.officers[OFF_ALPHA_BUSHO]!.name,
      });
      const button = screen.getByRole('button', { name: '加封' });
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.getAttribute('title')).toBe(expected);
      const reason = document.getElementById(button.getAttribute('aria-describedby')!);
      expect(reason?.textContent).toBe(expected);
      expect(reason?.textContent).not.toContain('{name}');
      expect(validateCommand(game, command)).toEqual({
        ok: false,
        reasonKey: REJECT_REASONS.officerBusy,
        params: { name: game.officers[OFF_ALPHA_BUSHO]!.name },
      });
      expect(warn).not.toHaveBeenCalled();
      expect(game).toEqual(before);
      expect(getQueuedPlayerCommands(game)).toEqual([]);
    },
  );
  it('leaves legal grant eligibility and game/RNG unchanged', () => {
    const game = buildTinyState();
    game.districts[DIST_A1X]!.stewardId = null;
    const before = structuredClone(game);
    expect(
      validateCommand(game, {
        type: 'grantFief',
        clanId: CLAN_ALPHA,
        districtId: DIST_A1X,
        officerId: OFF_ALPHA_BUSHO,
      }),
    ).toEqual({ ok: true });
    expect(game).toEqual(before);
    expect(validateState(game)).toEqual([]);
  });
});
