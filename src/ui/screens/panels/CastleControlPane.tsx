import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, getQueuedPlayerCommands, type CommandDispatchResult } from '@app/bridge';
import { validateCommand } from '@core/commands/validate';
import type { Command } from '@core/commands/types';
import type { CastleId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { uiStore, useUIStore } from '@ui/hooks/uiStore';
import styles from './CastleControlPane.module.css';

const selectModel = makeCachedSelector((game, castleId: CastleId) => {
  const castle = game.castles[castleId];
  return castle
    ? {
        clanId: game.meta.playerClanId,
        directControl: castle.directControl,
        ownerClanId: castle.ownerClanId,
        corpsId: castle.corpsId,
        lordId: castle.lordId,
        day: game.time.day,
      }
    : null;
});

/** Normal queued administration; regaining control does not require current direct control. */
export function CastleControlPane({
  castleId,
  onCommand = dispatchCommand,
}: {
  castleId: CastleId;
  onCommand?: (command: Command) => CommandDispatchResult | void;
}) {
  const game = useStore(store, (state) => state.game);
  const panel = useUIStore((state) => state.panelStack.at(-1));
  const model = useCachedGameSelector(selectModel, castleId);
  const owner = useMemo(
    () => ({ game, panel, castle: game?.castles[castleId], live: true }),
    [game, panel, castleId],
  );
  const mounted = useRef<typeof owner | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const action = useMemo(() => ({ owner, model, consumed: false }), [owner, model]);
  const currentAction = useRef(action);
  useLayoutEffect(() => {
    currentAction.current = action;
    setFeedback(null);
  }, [action]);
  useLayoutEffect(() => {
    owner.live = true;
    mounted.current = owner;
    const offUI = uiStore.subscribe((next) => {
      if (owner.panel && !next.panelStack.includes(owner.panel)) owner.live = false;
    });
    const offGame = store.subscribe((next) => {
      if (next.game !== owner.game) owner.live = false;
    });
    return () => {
      owner.live = false;
      if (mounted.current === owner) mounted.current = null;
      offUI();
      offGame();
    };
  }, [owner]);
  if (!game || !model) return null;
  const owns = () => {
    const state = store.getState();
    const ui = uiStore.getState();
    const castle = game.castles[castleId];
    return (
      mounted.current === owner &&
      owner.live &&
      currentAction.current === action &&
      state.game === game &&
      game.meta.playerClanId === model.clanId &&
      castle !== undefined &&
      castle === owner.castle &&
      castle.ownerClanId === model.ownerClanId &&
      castle.directControl === model.directControl &&
      castle.corpsId === model.corpsId &&
      castle.lordId === model.lordId &&
      game.time.day === model.day &&
      state.session.screen === 'main' &&
      state.session.fatalError === null &&
      !state.session.viewportBlocked &&
      game.meta.gameOver === null &&
      ui.modal === null &&
      document.querySelector('[data-ui-dialog]') === null &&
      (owner.panel ? ui.panelStack.at(-1) === owner.panel : ui.panelStack.length === 0)
    );
  };
  const pending = () =>
    getQueuedPlayerCommands(game).some(
      (command) => command.type === 'setCastleControl' && command.castleId === castleId,
    );
  const command = (directControl: boolean): Extract<Command, { type: 'setCastleControl' }> => ({
    type: 'setCastleControl',
    clanId: model.clanId,
    castleId,
    directControl,
  });
  const send = (directControl: boolean) => {
    if (!owns() || action.consumed || pending() || directControl === model.directControl) return;
    const cmd = command(directControl);
    const verdict = validateCommand(game, cmd);
    if (!verdict.ok) {
      setFeedback(t(verdict.reasonKey, verdict.params));
      return;
    }
    action.consumed = true;
    let result: CommandDispatchResult | void;
    try {
      result = onCommand(cmd);
    } catch (error) {
      if (owns()) action.consumed = false;
      throw error;
    }
    if (!owns()) return;
    if (result && !result.ok) {
      action.consumed = false;
      setFeedback(t(result.reason, result.params));
    } else setFeedback(t('ui.castle.controlPending'));
  };
  return (
    <section className={styles.root} aria-label={t('ui.castle.controlTitle')}>
      <h3>{t('ui.castle.controlTitle')}</h3>
      <p className={styles.note}>{t('ui.castle.controlNote')}</p>
      <div className={styles.actions}>
        {([true, false] as const).map((direct) => {
          const verdict = validateCommand(game, command(direct));
          const label = t(direct ? 'ui.castle.controlDirect' : 'ui.castle.controlDelegated');
          return (
            <div className={styles.choice} key={String(direct)}>
              <button
                type="button"
                aria-pressed={model.directControl === direct}
                disabled={pending() || model.directControl === direct || !verdict.ok}
                onClick={() => send(direct)}
              >
                {label}
              </button>
              {!verdict.ok && <small>{t(verdict.reasonKey, verdict.params)}</small>}
            </div>
          );
        })}
      </div>
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
