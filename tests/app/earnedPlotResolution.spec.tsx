import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  captureSaveSnapshot,
  exportCommandLog,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { monthSummaryStore } from '../../src/app/monthSummaryFlow';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { PlotPanel } from '../../src/ui/screens/PlotPanel';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { BAL } from '../../src/core/balance';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { isOfficerBusy } from '../../src/core/systems/diplomacyCommon';
import { getEffectiveOfficerStat } from '../../src/core/battleStats';
import type { GameEvent } from '../../src/core/state/events';
import type { GameState } from '../../src/core/state/gameState';
import { renderReport } from '../../src/ui/reports/renderReport';
import { t } from '../../src/i18n/zh-TW';
import {
  buildMiniState,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO_B,
} from '../fixtures/mini';

function reset() {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
}
afterEach(reset);
function persistent(game: GameState) {
  const copy = structuredClone(game);
  copy.ai.intentLog = []; // Native codec excludes only this transient diagnostic history.
  return copy;
}
function restore(game: GameState) {
  const before = structuredClone(game);
  const snapshot = captureSaveSnapshot(0);
  expect(snapshot.pendingCommands).toEqual(getQueuedPlayerCommands(game));
  const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
  expect(game).toEqual(before);
  if (!decoded.ok) throw new Error(decoded.code);
  expect(persistent(decoded.saveFile.state)).toEqual(persistent(game));
  setGame(decoded.saveFile.state);
  initializeBridgeSession(decoded.saveFile.state, decoded.saveFile.pendingCommands, {
    loaded: true,
  });
  store.getState().actions.setScreen('main');
  return decoded.saveFile.state;
}

/** Actual panel + production bridge, unchanged mini42 and naturally generated AI.
 * jsdom rendering is not native pointer/geometry evidence. No outcome or resources are injected.
 */
function journey(native = false) {
  let game = buildMiniState({ seed: 42 });
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  uiStore.getState().actions.openPanel('plot');
  expect(validateState(game)).toEqual([]);
  render(<PlotPanel />);
  fireEvent.click(screen.getByRole('radio', { name: t('term.plot.rumor') }));
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.targetClan') }), {
    target: { value: CLAN_BETA },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: t('ui.plot.castleMode') }));
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.target') }), {
    target: { value: CASTLE_B1 },
  });
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.executor') }), {
    target: { value: OFF_ALPHA_TAISHO_B },
  });
  const beforeSubmit = structuredClone(game);
  const start = screen.getByRole('button', { name: t('cmd.plot.start') });
  expect(start.hasAttribute('disabled')).toBe(false);
  fireEvent.click(start);
  expect(game).toEqual(beforeSubmit);
  expect(getQueuedPlayerCommands(game)).toEqual([
    {
      type: 'startPlot',
      clanId: CLAN_ALPHA,
      kind: 'rumor',
      executorId: OFF_ALPHA_TAISHO_B,
      targetClanId: CLAN_BETA,
      targetOfficerId: null,
      targetCastleId: CASTLE_B1,
      investGold: 0,
    },
  ]);
  if (native) {
    cleanup();
    game = restore(game);
  }
  const history: GameEvent[][] = [];
  const paid: number[] = [];
  let ongoingRestored = false;
  let plotId: string | undefined;
  for (let tick = 1; tick <= 91; tick++) {
    const goldBefore = game.clans[CLAN_ALPHA]!.gold;
    const plotBefore = game.diplomacy.plots.find((plot) => plot.id === plotId);
    const progressBefore = plotBefore?.progress;
    const expectedProgress =
      plotBefore === undefined
        ? null
        : Math.min(
            BAL.plotProgressMax,
            plotBefore.progress +
              BAL.plotRumorProgressBase +
              getEffectiveOfficerStat(game.officers[OFF_ALPHA_TAISHO_B]!, 'int') /
                BAL.plotRumorProgressIntDivisor,
          );
    let events: GameEvent[] = [];
    act(() => {
      events = runOneDay();
    });
    history.push(events);
    expect(
      events.filter((event) => event.type === 'command.rejected'),
      `day ${game.time.day}`,
    ).toEqual([]);
    expect(validateState(game), `day ${game.time.day}`).toEqual([]);
    expect(store.getState().session.fatalError).toBeNull();
    if (tick === 1) {
      const plot = game.diplomacy.plots[0]!;
      expect(plot).toMatchObject({
        kind: 'rumor',
        officerId: OFF_ALPHA_TAISHO_B,
        targetCastleId: CASTLE_B1,
        progress: 0,
        investGold: 0,
      });
      plotId = plot.id;
      expect(isOfficerBusy(game, OFF_ALPHA_TAISHO_B)).toBe(true);
      expect(game.clans[CLAN_ALPHA]!.gold).toBe(goldBefore);
    }
    if (plotBefore !== undefined && game.time.dayOfMonth === 1) {
      const settlement = monthSummaryStore.getState().view?.settlement;
      expect(settlement).not.toBeNull();
      expect(settlement!.goldBefore).toBe(goldBefore - BAL.plotMonthlyCost);
      expect(settlement!.goldAfter).toBe(
        settlement!.goldBefore +
          settlement!.incomeGold +
          settlement!.tributeReceived -
          settlement!.tributePaid -
          settlement!.salaryPaid -
          settlement!.policyPaid,
      );
      paid.push(game.time.day);
      const live = game.diplomacy.plots.find((plot) => plot.id === plotId);
      if (live) {
        expect(live.progress).toBe(expectedProgress);
        expect(isOfficerBusy(game, OFF_ALPHA_TAISHO_B)).toBe(true);
      }
      expect(progressBefore).toBeLessThan(expectedProgress!);
    }
    if (native && !ongoingRestored && tick >= 30 && game.ai.pendingOrders.length > 0) {
      expect(game.diplomacy.plots[0]!.progress).toBeGreaterThan(0);
      console.info(
        'ongoing native checkpoint',
        JSON.stringify({ day: game.time.day, pendingAi: game.ai.pendingOrders.length }),
      );
      game = restore(game); // Actual ongoing plot and all saved AI orders restored by bridge.
      ongoingRestored = true;
    }
  }
  const resolutions = history
    .flat()
    .filter((event) => ['plot.succeeded', 'plot.failed', 'plot.exposed'].includes(event.type));
  expect(resolutions).toHaveLength(1);
  expect(resolutions[0]).toMatchObject({
    type: 'plot.failed',
    day: 180,
    kind: 'rumor',
    actorClanId: CLAN_ALPHA,
    targetClanId: CLAN_BETA,
    targetCastleId: CASTLE_B1,
  });
  expect(paid).toEqual([120, 150, 180]);
  if (native) expect(ongoingRestored).toBe(true);
  expect(game.diplomacy.plots).toEqual([]);
  expect(isOfficerBusy(game, OFF_ALPHA_TAISHO_B)).toBe(false);
  expect(game.reports.filter((report) => report.event.type === resolutions[0]!.type)).toHaveLength(
    1,
  );
  expect(renderReport(resolutions[0]!, game, CLAN_ALPHA)).toBeTruthy();
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const log = exportCommandLog();
  expect(log.entries.some((entry) => entry.authority !== undefined)).toBe(true);
  // Loaded recording is honestly truncated: the original START predates the ongoing checkpoint.
  expect(log.entries.filter((entry) => entry.command.type === 'startPlot')).toHaveLength(
    native ? 0 : 1,
  );
  return { game, history, resolutions, log };
}

it('settles actual queued rumor across paid months, releases executor and publishes exactly one natural resolution', () => {
  const result = journey();
  expect(result.log.truncated).toBe(false);
  expect(result.log.entries).toHaveLength(11);
  expect(result.log.entries.filter((entry) => entry.authority !== undefined)).toHaveLength(10);
  console.info(
    'earned rumor observation',
    JSON.stringify({
      resolution: result.resolutions,
      entries: result.log.entries.length,
      finalHash: result.log.finalHash,
    }),
  );
});

it('native pending START and ongoing plot continuation preserve complete state, events and RNG', () => {
  const original = journey();
  reset();
  const restored = journey(true);
  expect(restored.history).toEqual(original.history);
  expect(restored.game.rng).toEqual(original.game.rng);
  expect(persistent(restored.game)).toEqual(persistent(original.game));
  expect(restored.log.truncated).toBe(true);
});
