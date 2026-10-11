import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, getQueuedPlayerCommands, type CommandDispatchResult } from '@app/bridge';
import { BAL } from '@core/balance';
import { validateCommand } from '@core/commands/validate';
import type { Command } from '@core/commands/types';
import type { CastleId } from '@core/state/ids';
import type { GameState, Officer } from '@core/state/gameState';
import { t } from '@i18n/zh-TW';
import { ConfirmDialog } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { uiStore, useUIStore, type ModalInstance } from '@ui/hooks/uiStore';
import styles from './CastleLordDismissPane.module.css';

const selectModel = makeCachedSelector((game, castleId: CastleId) => {
  const castle = game.castles[castleId];
  const lord = castle?.lordId ? game.officers[castle.lordId] : undefined;
  return { lordId: lord?.id ?? null, clanId: game.meta.playerClanId, day: game.time.day };
});
type DismissCommand = Extract<Command, { type: 'appointLord' }>;
interface Request {
  game: GameState;
  command: DismissCommand;
  lord: Officer;
  name: string;
  amount: number;
  modal: ModalInstance;
  consumed: boolean;
}

/** A separate dismissal action keeps the existing appointment editor's null draft semantics. */
export function CastleLordDismissPane({
  castleId,
  onCommand = dispatchCommand,
}: {
  castleId: CastleId;
  onCommand?: (command: Command) => CommandDispatchResult | void;
}) {
  const game = useStore(store, (state) => state.game);
  const panel = useUIStore((state) => state.panelStack.at(-1));
  const modal = useUIStore((state) => state.modal);
  const model = useCachedGameSelector(selectModel, castleId);
  const lord = game && model.lordId ? game.officers[model.lordId] : undefined;
  const owner = useMemo(
    () => ({ game, panel, castle: game?.castles[castleId], lord, live: true }),
    [game, panel, castleId, lord],
  );
  const active = useRef<typeof owner | null>(null);
  const requestRef = useRef<Request | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const flushNative = useRef<() => void>(() => {});
  const prefix = useId();
  const sequence = useRef(0);
  const discard = (expected: Request) => {
    expected.consumed = true;
    if (requestRef.current === expected) {
      requestRef.current = null;
      setRequest(null);
    }
    uiStore.getState().actions.closeOwnedModal(expected.modal, {
      resume: false,
      expectedGame: expected.game,
    });
  };
  useLayoutEffect(() => {
    active.current = owner;
    owner.live = true;
    setFeedback(null);
    const unsubscribe = uiStore.subscribe((next, previous) => {
      const expected = requestRef.current;
      if (owner.panel && !next.panelStack.includes(owner.panel)) {
        owner.live = false;
        if (expected) discard(expected);
        return;
      }
      if (
        expected &&
        (previous.modal === expected.modal || previous.modalQueue.includes(expected.modal)) &&
        next.modal !== expected.modal &&
        !next.modalQueue.includes(expected.modal)
      ) {
        expected.consumed = true;
        requestRef.current = null;
        setRequest(null);
      }
    });
    const offGame = store.subscribe((next) => {
      if (next.game !== owner.game) {
        owner.live = false;
        const expected = requestRef.current;
        if (expected) discard(expected);
      }
    });
    return () => {
      unsubscribe();
      offGame();
      owner.live = false;
      if (active.current === owner) active.current = null;
      const expected = requestRef.current;
      if (expected) discard(expected);
    };
  }, [owner]);
  useLayoutEffect(() => {
    if (!request || modal !== request.modal) return;
    const originalDialog = body.current?.closest('[data-ui-dialog]');
    if (!originalDialog) return;
    const inspect = (records: MutationRecord[]) => {
      if (requestRef.current !== request) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const dialogs = [
            ...(node.matches('[data-ui-dialog]') ? [node] : []),
            ...node.querySelectorAll('[data-ui-dialog]'),
          ];
          if (dialogs.some((dialog) => dialog !== originalDialog)) {
            discard(request);
            return;
          }
        }
        for (const node of record.removedNodes) {
          if (
            node === originalDialog ||
            (node instanceof Element && node.contains(originalDialog))
          ) {
            discard(request);
            return;
          }
        }
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    const flush = () => inspect(observer.takeRecords());
    flushNative.current = flush;
    return () => {
      observer.disconnect();
      if (flushNative.current === flush) flushNative.current = () => {};
    };
  }, [owner, request, modal]);
  if (!game || !lord || !owner.castle) return null;
  const command: DismissCommand = {
    type: 'appointLord',
    clanId: model.clanId,
    castleId,
    officerId: null,
  };
  const queued = () =>
    getQueuedPlayerCommands(game).some((c) => c.type === 'appointLord' && c.castleId === castleId);
  const native = () => body.current?.closest('[data-ui-dialog]') ?? null;
  const owns = (expected?: Request) => {
    flushNative.current();
    const state = store.getState();
    const ui = uiStore.getState();
    const dialog = native();
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      active.current === owner &&
      owner.live &&
      state.game === game &&
      game.meta.playerClanId === model.clanId &&
      game.castles[castleId] === owner.castle &&
      state.session.screen === 'main' &&
      state.session.fatalError === null &&
      !state.session.viewportBlocked &&
      (owner.panel ? ui.panelStack.at(-1) === owner.panel : ui.panelStack.length === 0) &&
      (expected
        ? requestRef.current === expected &&
          ui.modal === expected.modal &&
          dialog !== null &&
          dialogs.item(dialogs.length - 1) === dialog
        : ui.modal === null && dialogs.length === 0)
    );
  };
  const loss = (officer: Officer) =>
    game.clans[model.clanId]?.leaderId === officer.id
      ? 0
      : Math.min(officer.loyalty, BAL.loyaltyDismiss);
  const subject = (expected: Request) =>
    game.castles[castleId]?.lordId === expected.lord.id &&
    game.officers[expected.lord.id] === expected.lord &&
    loss(expected.lord) === expected.amount &&
    expected.lord.name === expected.name;
  const verdict = validateCommand(game, command);
  const open = () => {
    if (
      !owns() ||
      game.time.day !== model.day ||
      requestRef.current ||
      queued() ||
      game.meta.gameOver !== null ||
      game.castles[castleId]?.lordId !== lord.id ||
      game.officers[lord.id] !== lord
    )
      return;
    const fresh = validateCommand(game, command);
    if (!fresh.ok) {
      setFeedback(t(fresh.reasonKey, fresh.params));
      return;
    }
    const descriptor: ModalInstance = {
      id: 'confirm',
      params: { owner: 'castleLordDismiss', token: `${prefix}-${++sequence.current}`, castleId },
      pausesTime: false,
    };
    const expected: Request = {
      game,
      command,
      lord,
      name: lord.name,
      amount: loss(lord),
      modal: descriptor,
      consumed: false,
    };
    requestRef.current = expected;
    setRequest(expected);
    setFeedback(null);
    uiStore.getState().actions.enqueueModal(descriptor);
  };
  const cancel = (expected: Request) => {
    if (!owns(expected)) return;
    discard(expected);
  };
  const confirm = (expected: Request) => {
    if (!owns(expected) || expected.consumed || queued()) return;
    const fresh = validateCommand(game, expected.command);
    if (!subject(expected) || !fresh.ok) {
      setFeedback(!fresh.ok ? t(fresh.reasonKey, fresh.params) : t('cmd.reject.invalidTarget'));
      return;
    }
    const originalDialog = native();
    const dispatchDay = game.time.day;
    expected.consumed = true;
    let result: CommandDispatchResult | void;
    try {
      result = onCommand(expected.command);
    } catch (error) {
      if (owns(expected)) expected.consumed = false;
      throw error;
    }
    if (
      !owns(expected) ||
      native() !== originalDialog ||
      game.time.day !== dispatchDay ||
      !subject(expected)
    )
      return;
    if (result && !result.ok) {
      expected.consumed = false;
      setFeedback(t(result.reason, result.params));
      return;
    }
    discard(expected);
    if (owns()) setFeedback(t('ui.castle.dismissLordPending'));
  };
  return (
    <div className={styles.root}>
      <button type="button" disabled={queued() || !verdict.ok} onClick={open}>
        {t('ui.castle.dismissLord')}
      </button>
      {!verdict.ok && <small>{t(verdict.reasonKey, verdict.params)}</small>}
      {feedback && !request && <p role="status">{feedback}</p>}
      {request && modal === request.modal && (
        <ConfirmDialog
          open
          danger
          title={t('ui.castle.dismissLord')}
          message={
            <div ref={body}>
              <p>
                {t('ui.castle.dismissLordConfirm', { name: request.name, amount: request.amount })}
              </p>
              {feedback && <p role="alert">{feedback}</p>}
            </div>
          }
          onCancel={() => cancel(request)}
          onConfirm={() => confirm(request)}
        />
      )}
    </div>
  );
}
