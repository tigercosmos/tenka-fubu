import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { BAL } from '@core/balance';
import { UI } from '../uiConstants';
import type { BattleId, TacticId } from '@core/state/ids';
import type { BattleState, BattleUnit, GameState } from '@core/state/gameState';
import {
  dispatchBattleOrder,
  getBattleTacticOptions,
  runBattleTick,
  getBattleUnitActivity,
  type BattleCommand,
} from '@app/battleBridge';
import { store } from '@app/store';
import { classifyHotkey, isNativeControlTarget, isTypingTarget } from '@app/hotkeys';
import { t } from '@i18n/zh-TW';
import { useGameSelector } from '../hooks/useGameSelector';
import { ProgressBar } from '../components/ProgressBar/ProgressBar';
import { uiStore, useUIStore } from '../hooks/uiStore';
import { useViewportBlocked } from '@ui/viewport';
import { BattleCanvasHost } from '../battle/BattleCanvasHost';
import { Dialog } from '../components/Dialog/Dialog';
import { useStore } from 'zustand';
import {
  appendBattleLogRows,
  battleUnitLabel,
  isBattleLogNearBottom,
  projectBattleLog,
  type BattleLogRow,
} from '../battle/battleLog';
import styles from './BattleScreen.module.css';
import { formatBattleActivity } from '../battle/battleActivity';

export interface BattleScreenProps {
  battleId: BattleId;
  onExit: () => void;
  onRetreat: () => void;
  suspendForSystemPanel?: boolean;
}

type BattleSpeed = 'paused' | 'x1' | 'x2' | 'x5';
const SPEED_FACTOR: Record<BattleSpeed, number> = { paused: 0, x1: 1, x2: 2, x5: 5 };
const EMPTY_LOGS: readonly BattleLogRow[] = [];

export function BattleScreen({
  battleId,
  onExit,
  onRetreat,
  suspendForSystemPanel = false,
}: BattleScreenProps): ReactElement {
  const battleTick = useGameSelector((game) => game.battles[battleId]?.tick ?? -1);
  const game = useStore(store, (state) => state.game);
  const battle = game?.battles[battleId];
  const [speed, setSpeed] = useState<BattleSpeed>('paused');
  const viewportBlocked = useViewportBlocked();
  const modal = useUIStore((state) => state.modal);
  // Ordinary SystemMenu does not force tactical time to stop; mandatory owners do.
  const mandatoryBlocked = modal?.pausesTime === true && modal.id !== 'systemMenu';
  const lastRunningSpeed = useRef<Exclude<BattleSpeed, 'paused'>>('x1');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [tacticDraft, setTacticDraft] = useState<{
    game: GameState;
    battle: BattleState;
    actor: BattleUnit;
    tacticId: TacticId;
  } | null>(null);
  const [logs, setLogs] = useState<readonly BattleLogRow[]>([]);
  const logOwner = useRef({ game, battleId });
  const logScroller = useRef<HTMLDivElement>(null);
  const stickToLatest = useRef(true);
  const readingAnchor = useRef<{ id: string; offset: number } | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const visibleLogs =
    logOwner.current.game === game && logOwner.current.battleId === battleId ? logs : EMPTY_LOGS;
  const screenRef = useRef<HTMLElement>(null);
  const returnRef = useRef<HTMLButtonElement>(null);

  const playerSide =
    battle === undefined || game?.meta.playerClanId === battle.attackerClanId
      ? 'attacker'
      : 'defender';
  const playerUnits = battle?.units.filter((unit) => unit.side === playerSide) ?? [];
  const enemyUnits = battle?.units.filter((unit) => unit.side !== playerSide) ?? [];
  const controllablePlayerUnits = playerUnits.filter(
    (unit) => !unit.routed && !unit.exited && unit.troops > 0,
  );
  const selectedUnit =
    controllablePlayerUnits.find((unit) => unit.id === selectedUnitId) ??
    controllablePlayerUnits[0];
  const availableTactics =
    selectedUnit === undefined ? [] : getBattleTacticOptions(battleId, selectedUnit.id);
  const pendingDefinition = availableTactics.find((option) => option.id === tacticDraft?.tacticId);
  const pendingTacticId =
    tacticDraft !== null &&
    tacticDraft.game === game &&
    tacticDraft.battle === battle &&
    selectedUnit !== undefined &&
    tacticDraft.actor === selectedUnit &&
    pendingDefinition?.needsTarget === true &&
    (selectedUnit.tacticCooldowns[tacticDraft.tacticId] ?? 0) === 0 &&
    (battle?.saihai[playerSide] ?? 0) >= pendingDefinition.saihaiCost
      ? tacticDraft.tacticId
      : null;
  useEffect(() => {
    if (tacticDraft !== null && pendingTacticId === null) setTacticDraft(null);
  }, [tacticDraft, pendingTacticId]);
  const selectUnit = (unitId: string) => {
    if (unitId !== selectedUnit?.id) setTacticDraft(null);
    setSelectedUnitId(unitId);
  };
  const battleResolved = battle?.result != null;
  const controlsBlocked =
    viewportBlocked || mandatoryBlocked || suspendForSystemPanel || battleResolved;

  useLayoutEffect(() => {
    if (
      speed !== 'paused' &&
      logOwner.current.game === game &&
      logOwner.current.battleId === battleId
    )
      lastRunningSpeed.current = speed;
  }, [speed, game, battleId]);

  useEffect(() => {
    if (logOwner.current.game === game && logOwner.current.battleId === battleId) return;
    logOwner.current = { game, battleId };
    stickToLatest.current = true;
    readingAnchor.current = null;
    setLogs([]);
    setShowLatest(false);
    setSpeed('paused');
    setSelectedUnitId(null);
    setTacticDraft(null);
    lastRunningSpeed.current = 'x1';
  }, [game, battleId]);
  useLayoutEffect(() => {
    const element = logScroller.current;
    if (!element) return;
    if (stickToLatest.current) {
      element.scrollTop = element.scrollHeight;
      setShowLatest(false);
    } else if (visibleLogs.length > 0) {
      const anchor = readingAnchor.current;
      const row = anchor
        ? Array.from(element.querySelectorAll<HTMLElement>('[data-log-id]')).find(
            (candidate) => candidate.dataset.logId === anchor.id,
          )
        : undefined;
      if (row && anchor)
        element.scrollTop +=
          row.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.offset;
      setShowLatest(true);
    }
    readingAnchor.current = null;
  }, [visibleLogs]);

  useLayoutEffect(() => {
    const root = screenRef.current;
    if (!root || !battleResolved) return;
    root.setAttribute('inert', '');
    return () => root.removeAttribute('inert');
  }, [battleResolved]);

  useEffect(() => {
    if (viewportBlocked) setSpeed('paused');
  }, [viewportBlocked]);

  // Tactical speed is local: never resume or change the strategic day loop.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (store.getState().game?.battles[battleId]?.result !== null) return;
      const target = event.target instanceof HTMLElement ? event.target : document.activeElement;
      const action = classifyHotkey(event, {
        screen: 'battle',
        typing: isTypingTarget(target),
        nativeControl: isNativeControlTarget(target),
        mapBackground: false,
        hasDialog: document.querySelector('[data-ui-dialog]') !== null,
        hasModal: uiStore.getState().modal !== null,
        panelFocused: false,
        viewportBlocked:
          viewportBlocked || store.getState().session.viewportBlocked || suspendForSystemPanel,
      });
      if (action?.kind === 'speed' && battle !== undefined && !battleResolved) {
        event.preventDefault();
        setSpeed(action.speed);
      } else if (action?.kind === 'pause' && battle !== undefined && !battleResolved) {
        event.preventDefault();
        setSpeed((current) => (current === 'paused' ? lastRunningSpeed.current : 'paused'));
      } else if (action?.kind === 'blur' && target instanceof HTMLElement) {
        event.preventDefault();
        target.blur();
      } else if (action?.kind === 'escape') {
        event.preventDefault();
        uiStore.getState().actions.onEsc();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [battleId, battle, battleResolved, viewportBlocked, suspendForSystemPanel]);

  useEffect(() => {
    if (
      battleResolved ||
      speed === 'paused' ||
      viewportBlocked ||
      mandatoryBlocked ||
      suspendForSystemPanel
    )
      return undefined;
    const delay = Math.max(50, UI.kassenTickMs / SPEED_FACTOR[speed]);
    const timer = window.setInterval(() => {
      if (
        store.getState().session.viewportBlocked ||
        store.getState().game !== game ||
        store.getState().game?.battles[battleId]?.result !== null
      )
        return;
      const result = runBattleTick(battleId);
      const currentGame = store.getState().game;
      if (currentGame === game && currentGame !== null) {
        const batch = projectBattleLog(currentGame, battleId, result.tick, result.events);
        if (batch.length > 0) {
          const element = logScroller.current;
          if (element) {
            stickToLatest.current = isBattleLogNearBottom(
              element.scrollHeight,
              element.clientHeight,
              element.scrollTop,
            );
            if (!stickToLatest.current) {
              const viewport = element.getBoundingClientRect();
              const row = Array.from(element.querySelectorAll<HTMLElement>('[data-log-id]')).find(
                (candidate) => {
                  const bounds = candidate.getBoundingClientRect();
                  return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
                },
              );
              readingAnchor.current = row
                ? { id: row.dataset.logId!, offset: row.getBoundingClientRect().top - viewport.top }
                : null;
            }
          }
          setLogs((current) => appendBattleLogRows(current, batch));
        }
      }
      if (result.resolved) setSpeed('paused');
    }, delay);
    return () => window.clearInterval(timer);
  }, [
    game,
    battleId,
    battleResolved,
    speed,
    viewportBlocked,
    mandatoryBlocked,
    suspendForSystemPanel,
  ]);

  if (battle === undefined) {
    return <main data-testid="screen-battle">{t('ui.battle.missing')}</main>;
  }

  const issue = (order: BattleCommand) => {
    if (
      !viewportBlocked &&
      !store.getState().session.viewportBlocked &&
      !mandatoryBlocked &&
      !suspendForSystemPanel &&
      !battleResolved &&
      store.getState().game?.battles[battleId]?.result === null
    )
      dispatchBattleOrder(battleId, order);
  };
  const selectEnemy = (targetUnitId: string) => {
    if (selectedUnit === undefined || controlsBlocked) return;
    if (pendingTacticId !== null) {
      issue({
        kind: 'tactic',
        unitId: selectedUnit.id,
        tacticId: pendingTacticId,
        targetUnitId,
      });
      setTacticDraft(null);
      return;
    }
    issue({ kind: 'attack', unitId: selectedUnit.id, targetUnitId });
  };
  const issueTactic = (tacticId: TacticId) => {
    if (selectedUnit === undefined || controlsBlocked) return;
    const definition = availableTactics.find((candidate) => candidate.id === tacticId);
    if (definition?.needsTarget) {
      if (game !== null) setTacticDraft({ game, battle, actor: selectedUnit, tacticId });
      return;
    }
    setTacticDraft(null);
    issue({ kind: 'tactic', unitId: selectedUnit.id, tacticId, targetUnitId: null });
  };
  const toggleAllDelegation = () => {
    const enabled = controllablePlayerUnits.some((unit) => !unit.delegated);
    for (const unit of controllablePlayerUnits) {
      issue({ kind: 'toggleDelegate', unitId: unit.id, enabled });
    }
  };
  const playerSaihai = battle.saihai[playerSide];
  const attackerTroops = battle.units
    .filter((unit) => unit.side === 'attacker')
    .reduce((sum, unit) => sum + unit.troops, 0);
  const defenderTroops = battle.units
    .filter((unit) => unit.side === 'defender')
    .reduce((sum, unit) => sum + unit.troops, 0);

  return (
    <main
      ref={screenRef}
      className={styles.screen}
      data-testid="screen-battle"
      aria-hidden={battleResolved || undefined}
    >
      <header className={styles.header}>
        <h1>
          {t('ui.battle.title', {
            attacker: attackerTroops.toLocaleString(),
            defender: defenderTroops.toLocaleString(),
            tick: Math.max(0, battleTick),
          })}
        </h1>
        {(['paused', 'x1', 'x2', 'x5'] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={controlsBlocked}
            aria-pressed={speed === option}
            aria-label={
              option === 'paused' ? t('ui.speed.aria.pause') : t(`ui.speed.aria.${option}`)
            }
            onClick={() => {
              if (
                !viewportBlocked &&
                !store.getState().session.viewportBlocked &&
                !mandatoryBlocked &&
                !suspendForSystemPanel &&
                !battleResolved &&
                store.getState().game?.battles[battleId]?.result === null
              )
                setSpeed(option);
            }}
          >
            {option === 'paused' ? '⏸' : `×${option.slice(1)}`}
          </button>
        ))}
        <button type="button" disabled={controlsBlocked} onClick={toggleAllDelegation}>
          {t('cmd.battle.delegateAll')}：
          {controllablePlayerUnits.every((unit) => unit.delegated)
            ? t('ui.battle.delegateOn')
            : t('ui.battle.delegateOff')}
        </button>
        {game?.meta.debugMode && (
          <button
            type="button"
            disabled={controlsBlocked}
            data-testid="battle-retreat"
            onClick={onRetreat}
          >
            {t('ui.battle.retreat')}
          </button>
        )}
      </header>

      <section className={styles.body}>
        <aside className={styles.units}>
          <h2>{t('ui.battle.ourUnits')}</h2>
          {playerUnits.map((unit) => (
            <button
              key={unit.id}
              type="button"
              className={styles.unitCard}
              data-testid={`battle-unit-card-${unit.id}`}
              aria-pressed={unit.id === selectedUnit?.id}
              disabled={controlsBlocked || unit.routed || unit.exited || unit.troops <= 0}
              onClick={() => selectUnit(unit.id)}
            >
              <strong>{store.getState().game?.officers[unit.generalId]?.name ?? unit.id}</strong>
              <span>{t('ui.battle.troops', { count: unit.troops })}</span>
              <ProgressBar
                value={unit.morale}
                max={100}
                label={t('ui.battle.morale', { value: unit.morale })}
              />
              <small className={styles.unitStatuses}>
                {formatBattleActivity(getBattleUnitActivity(battle, unit.id)).map((status) => (
                  <span
                    key={status.kind}
                    data-battle-status={status.kind}
                    title={status.description}
                  >
                    {status.label}
                    {status.kind === 'contact' && (
                      <span className={styles.srOnly}>{status.description}</span>
                    )}
                  </span>
                ))}
              </small>
            </button>
          ))}
        </aside>

        <BattleCanvasHost
          battle={battle}
          playerSide={playerSide}
          selectedUnitId={selectedUnit?.id ?? null}
          disabled={controlsBlocked}
          unitName={(id) => {
            return game === null ? id : battleUnitLabel(game, battleId, id);
          }}
          onSelectUnit={selectUnit}
          onSelectEnemy={selectEnemy}
          onMoveJin={(id) => {
            if (
              selectedUnit !== undefined &&
              !enemyUnits.some(
                (unit) => unit.jinId === id && !unit.exited && !unit.routed && unit.troops > 0,
              )
            )
              issue({ kind: 'move', unitId: selectedUnit.id, targetJinId: id });
          }}
        />

        <aside className={styles.log}>
          <div className={styles.logHeader}>
            <h2>{t('ui.battle.log')}</h2>
            {showLatest && visibleLogs.length > 0 && (
              <button
                type="button"
                disabled={controlsBlocked}
                data-testid="battle-log-latest"
                onClick={() => {
                  const element = logScroller.current;
                  if (!element) return;
                  stickToLatest.current = true;
                  readingAnchor.current = null;
                  element.scrollTop = element.scrollHeight;
                  element.focus();
                  setShowLatest(false);
                }}
              >
                {t('ui.battle.log.latest')}
              </button>
            )}
          </div>
          <div
            ref={logScroller}
            className={styles.logScroll}
            role="log"
            aria-label={t('ui.battle.log')}
            aria-live="polite"
            aria-relevant="additions"
            aria-atomic="false"
            tabIndex={0}
            data-testid="battle-log"
            onScroll={(event) => {
              const element = event.currentTarget;
              stickToLatest.current = isBattleLogNearBottom(
                element.scrollHeight,
                element.clientHeight,
                element.scrollTop,
              );
              setShowLatest(!stickToLatest.current);
            }}
            onKeyDown={(event) => {
              if (
                [' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(
                  event.key,
                )
              )
                event.stopPropagation();
            }}
          >
            <ol data-testid="battle-log-list">
              {visibleLogs.map((row) => (
                <li
                  key={row.id}
                  data-log-id={row.id}
                  data-log-kind={row.kind}
                  data-log-tick={row.tick}
                  data-log-sequence={row.sequence}
                >
                  {row.text}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>

      <footer className={styles.tactics}>
        <ProgressBar
          value={playerSaihai}
          max={BAL.saihaiMax}
          color="gold"
          label={t('ui.battle.saihaiValue', { value: playerSaihai, max: BAL.saihaiMax })}
        />
        <div className={styles.tacticButtons} aria-label={t('cmd.battle.tactic')}>
          {availableTactics.map((definition) => {
            const cooldown = selectedUnit?.tacticCooldowns[definition.id] ?? 0;
            return (
              <button
                key={definition.id}
                type="button"
                disabled={controlsBlocked || playerSaihai < definition.saihaiCost || cooldown > 0}
                data-pending={pendingTacticId === definition.id}
                onClick={() => issueTactic(definition.id)}
              >
                {t('ui.battle.tacticButton', {
                  name: t(`${definition.id}.name`),
                  cost: definition.saihaiCost,
                })}
                {cooldown > 0 ? t('ui.battle.cooldown', { ticks: cooldown }) : ''}
              </button>
            );
          })}
        </div>
        {pendingTacticId !== null && (
          <p className={styles.targetHint}>{t('ui.battle.pickEnemyTarget')}</p>
        )}
      </footer>

      {battle.result !== null && (
        <Dialog
          open={modal === null}
          title={
            battle.result.winnerSide === playerSide ? t('ui.battle.victory') : t('ui.battle.defeat')
          }
          dismissible={false}
          closeOnBackdrop={false}
          onClose={() => {}}
          initialFocusRef={returnRef}
        >
          <div className={styles.result}>
            <p>
              {t('ui.battle.result.lossOurs', {
                count:
                  playerSide === 'attacker'
                    ? battle.result.attackerLosses
                    : battle.result.defenderLosses,
              })}
            </p>
            <p>
              {t('ui.battle.result.lossEnemy', {
                count:
                  playerSide === 'attacker'
                    ? battle.result.defenderLosses
                    : battle.result.attackerLosses,
              })}
            </p>
            <p>
              {t('ui.battle.result.awe', {
                level: t(`term.awe.${battle.result.aweLevel}`),
              })}
            </p>
            <button ref={returnRef} type="button" onClick={onExit}>
              {t('ui.battle.returnStrategy')}
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
