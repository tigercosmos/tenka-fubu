import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import {
  earnRegionalCapture,
  persistentCaptureState,
  REGIONAL_CAPTURE_RELEASE,
  TAKEDA,
  TOMONOBU,
} from '../helpers/earnedRegionalCapture';
import {
  captureSaveSnapshot,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { RecruitPanel } from '../../src/ui/screens/RecruitPanel';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import { t } from '../../src/i18n/zh-TW';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
it('generates the genuinely earned supported s1560 day35 regional captive checkpoint', async () => {
  const result = await earnRegionalCapture();
  expect(result.state.meta.scenarioId).toBe('s1560');
  expect(result.state.meta.playerClanId).toBe(TAKEDA);
  expect(result.state.time.day).toBe(35);
  expect(result.state.meta.gameOver).toBeNull();
  expect(result.events).toHaveLength(35);
  expect(result.log.truncated).toBe(false);
  expect(result.log.entries.some((entry) => entry.authority?.kind === 'clan')).toBe(true);
  // This actual regional binding does not trigger the full-world Azai choice.
  expect(result.commands.filter(({ command }) => command.type === 'resolveEventChoice')).toEqual(
    [],
  );
  expect(result.state.events.pendingChoiceEventId).toBeNull();
  if (process.env.EARNED_REGIONAL_CAPTURE_SAVE_PATH) {
    await writeFile(process.env.EARNED_REGIONAL_CAPTURE_SAVE_PATH, result.raw);
    await writeFile(
      `${process.env.EARNED_REGIONAL_CAPTURE_SAVE_PATH}.evidence.json`,
      JSON.stringify({
        commands: result.commands,
        events: result.events,
        captures: result.captures,
        appliedCommands: result.appliedCommands,
        log: result.log,
      }),
    );
  }
});
it('repeats actual capture, natural AI, full events and persistent state through genuinely queued native marches', async () => {
  const original = await earnRegionalCapture();
  const restored = await earnRegionalCapture(true);
  expect(restored.events).toEqual(original.events);
  expect(restored.commands).toEqual(original.commands);
  // Loaded recorder starts at its checkpoint; retain and compare every day's actual
  // applied commands in absolute core-day coordinates, including the prefix.
  expect(restored.appliedCommands).toEqual(original.appliedCommands);
  expect(restored.log.finalHash).toBe(original.log.finalHash);
  expect(restored.log.incompleteReasons).toEqual(['loadedGame']);
  expect(persistentCaptureState(restored.state)).toEqual(persistentCaptureState(original.state));
});
it('loads the earned regional captive into actual recruitment UI and preserves one release across pending native reload', async () => {
  const result = await earnRegionalCapture();
  uiStore.getState().actions.reset(); // Actual load starts a new presentation session, no historical arrival replay.
  const game = result.save.state;
  setGame(game);
  initializeBridgeSession(game, [], {
    loaded: true,
    eventEngine: await loadScenarioEventEngine('s1560'),
  });
  store.getState().actions.setScreen('main');
  expect(uiStore.getState().modal).toBeNull();
  render(createElement(RecruitPanel));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(game.officers[TOMONOBU]!.name) }));
  expect(uiStore.getState().modal).toMatchObject({
    id: 'captive',
    params: { officerId: TOMONOBU },
  });
  cleanup();
  render(createElement(CaptiveModal, { officerId: TOMONOBU }));
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.release') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([REGIONAL_CAPTURE_RELEASE]);
  const snapshot = captureSaveSnapshot(0);
  const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
  if (!decoded.ok) throw new Error(decoded.code);
  cleanup();
  uiStore.getState().actions.reset();
  const restored = decoded.saveFile.state;
  setGame(restored);
  initializeBridgeSession(restored, decoded.saveFile.pendingCommands, {
    loaded: true,
    eventEngine: await loadScenarioEventEngine('s1560'),
  });
  render(createElement(RecruitPanel));
  expect(
    screen.queryByRole('button', { name: new RegExp(restored.officers[TOMONOBU]!.name) }),
  ).toBeNull();
  expect(getQueuedPlayerCommands(restored)).toEqual([REGIONAL_CAPTURE_RELEASE]);
  expect(restored).toEqual(before);
  cleanup();
  const events = runOneDay();
  expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(
    events.filter((event) => event.type === 'officer.released' && event.officerId === TOMONOBU),
  ).toHaveLength(1);
  expect(restored.time.day).toBe(36);
  expect(getQueuedPlayerCommands(restored)).toEqual([]);
  expect(validateState(restored)).toEqual([]);
});
