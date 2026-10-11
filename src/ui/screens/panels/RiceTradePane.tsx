import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, getQueuedPlayerCommands, type CommandDispatchResult } from '@app/bridge';
import { BAL } from '@core/balance';
import { castleFoodCap, facilityIsActive } from '@core/domestic';
import { treasuryForCastle } from '@core/commands/treasury';
import { validateCommand } from '@core/commands/validate';
import type { Command } from '@core/commands/types';
import type { CastleId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { uiStore, useUIStore } from '@ui/hooks/uiStore';
import styles from './RiceTradePane.module.css';

const selectModel = makeCachedSelector((game, castleId: CastleId) => {
  const castle = game.castles[castleId];
  if (!castle) return null;
  return {
    food: castle.food,
    cap: castleFoodCap(castle),
    gold: treasuryForCastle(game, castleId)?.gold ?? 0,
    remaining: Math.max(0, BAL.riceTradeCapMonthly - castle.riceTradedThisMonth),
    active: facilityIsActive(game, castle, 'fac.komedoiya'),
    clanId: game.meta.playerClanId,
    day: game.time.day,
  };
});

export function RiceTradePane({
  castleId,
  onCommand = dispatchCommand,
}: {
  castleId: CastleId;
  onCommand?: (command: Command) => CommandDispatchResult | void;
}) {
  const game = useStore(store, (s) => s.game);
  const panel = useUIStore((s) => s.panelStack.at(-1));
  const model = useCachedGameSelector(selectModel, castleId);
  const owner = useMemo(
    () => ({ game, castleId, panel, castle: game?.castles[castleId], live: true }),
    [game, castleId, panel],
  );
  const active = useRef<typeof owner | null>(null);
  const [amount, setAmount] = useState('1');
  const [feedback, setFeedback] = useState<string | null>(null);
  const revision = useRef(0);
  const submitted = useRef(false);
  const action = useMemo(() => ({ owner, amount, day: model?.day }), [owner, amount, model?.day]);
  const currentAction = useRef(action);
  useLayoutEffect(() => {
    currentAction.current = action;
    submitted.current = false;
    setFeedback(null);
  }, [action]);
  useLayoutEffect(() => {
    active.current = owner;
    owner.live = true;
    submitted.current = false;
    setAmount('1');
    setFeedback(null);
    const unsubscribe = uiStore.subscribe((next) => {
      if (owner.panel && !next.panelStack.includes(owner.panel)) owner.live = false;
    });
    return () => {
      owner.live = false;
      if (active.current === owner) active.current = null;
      unsubscribe();
    };
  }, [owner]);
  if (!game || !model) return null;
  const value = Number(amount);
  const snapshot = revision.current;
  const pending = getQueuedPlayerCommands(game).some(
    (c) => c.type === 'tradeRice' && c.castleId === castleId,
  );
  const owns = () => {
    const current = store.getState();
    const ui = uiStore.getState();
    return (
      active.current === owner &&
      owner.live &&
      current.game === game &&
      game.castles[castleId] === owner.castle &&
      current.session.screen === 'main' &&
      current.session.fatalError === null &&
      !current.session.viewportBlocked &&
      game.meta.gameOver === null &&
      ui.modal === null &&
      document.querySelector('[data-ui-dialog]') === null &&
      (owner.panel ? ui.panelStack.at(-1) === owner.panel : ui.panelStack.length === 0)
    );
  };
  const command = (mode: 'buy' | 'sell'): Extract<Command, { type: 'tradeRice' }> => ({
    type: 'tradeRice',
    clanId: model.clanId,
    castleId,
    mode,
    amount: value,
  });
  // These existing rejection labels require the actual command's cost; the rice validator
  // currently supplies no interpolation metadata. This does not change its verdict.
  const reason = (key: string, params?: Record<string, string | number>) =>
    t(key, {
      ...(key === 'cmd.reject.insufficientGold'
        ? { cost: Math.ceil(value * BAL.riceBuyRate) }
        : {}),
      ...(key === 'cmd.reject.insufficientFood' ? { cost: value } : {}),
      ...params,
    });
  const buy = validateCommand(game, command('buy'));
  const sell = validateCommand(game, command('sell'));
  const send = (mode: 'buy' | 'sell') => {
    if (
      !owns() ||
      currentAction.current !== action ||
      game.time.day !== action.day ||
      revision.current !== snapshot ||
      pending ||
      submitted.current ||
      getQueuedPlayerCommands(game).some((c) => c.type === 'tradeRice' && c.castleId === castleId)
    )
      return;
    const cmd = command(mode);
    const verdict = validateCommand(game, cmd);
    if (!verdict.ok) {
      setFeedback(reason(verdict.reasonKey, verdict.params));
      return;
    }
    submitted.current = true;
    let result: CommandDispatchResult | void;
    try {
      result = onCommand(cmd);
    } catch (error) {
      if (owns() && currentAction.current === action) submitted.current = false;
      throw error;
    }
    if (
      !owns() ||
      currentAction.current !== action ||
      game.time.day !== action.day ||
      revision.current !== snapshot
    )
      return;
    if (result && !result.ok) {
      submitted.current = false;
      setFeedback(reason(result.reason, result.params));
    } else setFeedback(t('ui.rice.pending'));
  };
  const validAmount = Number.isInteger(value) && value > 0 && value <= model.remaining;
  const overflow = validAmount ? Math.max(0, model.food + value - model.cap) : 0;
  return (
    <section className={styles.root} aria-label={t('ui.rice.title')}>
      <h3>{t('ui.rice.title')}</h3>
      <div className={styles.facts}>
        <span>{t('ui.rice.treasury', { gold: model.gold })}</span>
        <span>{t('ui.rice.stock', { food: model.food, cap: model.cap })}</span>
        <span>{t('ui.rice.remaining', { amount: model.remaining })}</span>
      </div>
      {!model.active && <p>{t('ui.rice.requiresBroker')}</p>}
      <label className={styles.amount}>
        {t('ui.rice.amount')}
        <input
          type="number"
          min={1}
          max={model.remaining}
          step={1}
          value={amount}
          onChange={(event) => {
            if (!owns() || event.target.value === amount) return;
            revision.current++;
            submitted.current = false;
            setAmount(event.target.value);
            setFeedback(null);
          }}
        />
      </label>
      {validAmount && (
        <p>
          {t('ui.rice.buyCost', { gold: Math.ceil(value * BAL.riceBuyRate) })} ·{' '}
          {t('ui.rice.sellIncome', { gold: Math.floor(value * BAL.riceSellRate) })}
        </p>
      )}
      {overflow > 0 && (
        <p className={styles.warning}>{t('ui.rice.overflow', { amount: overflow })}</p>
      )}
      <div className={styles.actions}>
        {(['buy', 'sell'] as const).map((mode) => {
          const verdict = mode === 'buy' ? buy : sell;
          return (
            <button
              key={mode}
              type="button"
              disabled={pending || !verdict.ok}
              title={!verdict.ok ? reason(verdict.reasonKey, verdict.params) : undefined}
              onClick={() => send(mode)}
            >
              {t(`cmd.rice.${mode}`)}
            </button>
          );
        })}
      </div>
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
