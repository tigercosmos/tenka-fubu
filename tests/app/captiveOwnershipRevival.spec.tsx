import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import { ConfirmDialog } from '../../src/ui/components';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { bumpTickSeq, resetGameStoreForTests, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import {
  captiveRecruitSuccessRate,
  officerAbilityScore,
  validateCommand,
} from '../../src/core/index';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { createRngStream } from '../../src/core/rng';
import { BAL } from '../../src/core/balance';
import { t } from '../../src/i18n/zh-TW';
import {
  buildTinyState,
  CASTLE_A1,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

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

function retainedClick(button: HTMLElement): () => void {
  const key = Object.keys(button).find((name) => name.startsWith('__reactProps$'));
  if (!key) throw new Error('Expected an actual React-owned native button');
  const props = (button as unknown as Record<string, { onClick: () => void }>)[key];
  if (!props) throw new Error('Expected native button click props');
  return props.onClick;
}

function setup() {
  // Controlled legal captive state, not a claim about a capture campaign journey.
  const game = buildTinyState();
  const subject = game.officers[OFF_BETA_BUSHO]!;
  subject.status = 'captive';
  subject.capturedByClanId = game.meta.playerClanId;
  subject.locationCastleId = CASTLE_A1;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.enqueueModal({
    id: 'captive',
    params: { officerId: subject.id },
    pausesTime: true,
  });
  const modal = uiStore.getState().modal!;
  render(<CaptiveModal officerId={subject.id} />);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.execute') }));
  const dialog = screen.getAllByRole('dialog').at(-1)!;
  const confirm = retainedClick(
    within(dialog).getByRole('button', { name: t('ui.common.confirm') }),
  );
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  return { game, subject, modal, confirm };
}

function setupRecruit() {
  const result = setup();
  fireEvent.click(
    within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', {
      name: t('ui.common.cancel'),
    }),
  );
  const executor = screen.getByRole('combobox', { name: t('ui.recruit.executor') });
  fireEvent.change(executor, { target: { value: OFF_ALPHA_BUSHO } });
  const button = screen.getByRole('button', { name: t('cmd.captive.recruit') });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  const command = {
    type: 'handleCaptive' as const,
    clanId: result.game.meta.playerClanId,
    officerId: result.subject.id,
    action: 'recruit' as const,
    executorId: OFF_ALPHA_BUSHO,
  };
  expect(validateCommand(result.game, command).ok).toBe(true);
  expect(
    screen.getByText(
      t('ui.plot.chance', {
        chance: Math.round(
          captiveRecruitSuccessRate(
            result.game,
            result.subject.id,
            OFF_ALPHA_BUSHO,
            result.game.meta.playerClanId,
          ) * 100,
        ),
      }),
    ),
  ).toBeTruthy();
  return { ...result, executor, button, command };
}

it('does not revive a retained recruit draft after its selected executor changes and is restored', () => {
  const { game, executor, button, command } = setupRecruit();
  const oldRecruit = retainedClick(button);
  fireEvent.change(executor, { target: { value: OFF_ALPHA_LORD } });
  fireEvent.change(executor, { target: { value: OFF_ALPHA_BUSHO } });
  const before = structuredClone(game);
  const modal = uiStore.getState().modal;
  act(() => oldRecruit());
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  expect(uiStore.getState().modal).toBe(modal);
  expect(validateState(game)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.recruit') }));
  expect(getQueuedPlayerCommands(game)).toEqual([command]);
  expect(game).toEqual(before);
});

it('rejects retained recruitment when the same-ID executor is replaced by an actual native-codec row', () => {
  const { game, button, command } = setupRecruit();
  const oldRecruit = retainedClick(button);
  const original = game.officers[OFF_ALPHA_BUSHO]!;
  const decoded = decodeSave(encodeSave(game, 123));
  if (!decoded.ok) throw new Error('Expected valid captive native roundtrip');
  act(() => {
    game.officers[OFF_ALPHA_BUSHO] = decoded.saveFile.state.officers[OFF_ALPHA_BUSHO]!;
    bumpTickSeq();
  });
  expect(game.officers[OFF_ALPHA_BUSHO]).not.toBe(original);
  expect(validateState(game)).toEqual([]);
  const before = structuredClone(game);
  const modal = uiStore.getState().modal;
  act(() => oldRecruit());
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  expect(uiStore.getState().modal).toBe(modal);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.recruit') }));
  expect(getQueuedPlayerCommands(game)).toEqual([command]);
  expect(game).toEqual(before);
});

it('queues the current selected executor exactly once and applies the actual recruitment outcome on a normal day', () => {
  const { game, button, command, subject } = setupRecruit();
  const success = createRngStream(structuredClone(game.rng), 'misc').chance(
    captiveRecruitSuccessRate(game, subject.id, OFF_ALPHA_BUSHO, game.meta.playerClanId),
  );
  const signing = officerAbilityScore(subject) * BAL.recruitSigningBonusPerAbility;
  const before = structuredClone(game);
  const recruit = retainedClick(button);
  act(() => {
    recruit();
    recruit();
  });
  expect(getQueuedPlayerCommands(game)).toEqual([command]);
  expect(game).toEqual(before);
  expect(uiStore.getState().queuedDecisionIds).toEqual([subject.id]);
  expect(uiStore.getState().modal).toBeNull();
  act(() => {
    runOneDay();
  });
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(subject.status).toBe(success ? 'serving' : 'captive');
  expect(game.clans[game.meta.playerClanId]!.gold).toBe(
    before.clans[game.meta.playerClanId]!.gold - (success ? signing : 0),
  );
  expect(validateState(game)).toEqual([]);
});

it('cannot revive execution consent after its exact FIFO owner is removed and restored in one batch', () => {
  const { game, modal, confirm } = setup();
  act(() => {
    expect(uiStore.getState().actions.closeOwnedModal(modal, { resume: false })).toBe(true);
    uiStore.getState().actions.enqueueModal(modal);
  });
  const before = structuredClone(game);
  const currentModal = uiStore.getState().modal;
  const decisions = [...uiStore.getState().queuedDecisionIds];
  act(() => confirm());
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  expect(uiStore.getState().modal).toBe(currentModal);
  expect(uiStore.getState().queuedDecisionIds).toEqual(decisions);
  expect(validateState(game)).toEqual([]);
});

it('cannot revive execution consent after an actual foreign native dialog appears and disappears', async () => {
  const { game, confirm } = setup();
  const foreign = render(
    <ConfirmDialog
      open
      title="Different native owner"
      message="Unrelated decision"
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByRole('dialog', { name: 'Different native owner' })).toBeTruthy();
  await act(async () => {
    await Promise.resolve();
  });
  foreign.unmount();
  await act(async () => {
    await Promise.resolve();
  });
  const before = structuredClone(game);
  const currentModal = uiStore.getState().modal;
  const decisions = [...uiStore.getState().queuedDecisionIds];
  act(() => confirm());
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  expect(uiStore.getState().modal).toBe(currentModal);
  expect(uiStore.getState().queuedDecisionIds).toEqual(decisions);
  expect(validateState(game)).toEqual([]);
});

it('keeps ordinary current consent usable once, then settles the queued execution on a normal day', () => {
  const { game, subject, confirm } = setup();
  act(() => bumpTickSeq());
  const before = structuredClone(game);
  act(() => {
    confirm();
    confirm();
  });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    {
      type: 'handleCaptive',
      clanId: game.meta.playerClanId,
      officerId: subject.id,
      action: 'execute',
      executorId: null,
    },
  ]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([subject.id]);
  expect(uiStore.getState().modal).toBeNull();
  act(() => {
    runOneDay();
  });
  expect(subject.status).toBe('dead');
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});
