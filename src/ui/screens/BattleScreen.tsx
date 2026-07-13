import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { BAL } from '@core/balance';
import type { BattleId, TacticId } from '@core/state/ids';
import {
  dispatchBattleOrder,
  getBattleTacticOptions,
  runBattleTick,
  type BattleCommand,
} from '@app/battleBridge';
import { store } from '@app/store';
import { t } from '@i18n/zh-TW';
import { useGameSelector } from '../hooks/useGameSelector';
import { ProgressBar } from '../components/ProgressBar/ProgressBar';
import styles from './BattleScreen.module.css';

export interface BattleScreenProps {
  battleId: BattleId;
  onExit: () => void;
  onRetreat: () => void;
}

type BattleSpeed = 'paused' | 'x1' | 'x2' | 'x5';
const SPEED_FACTOR: Record<BattleSpeed, number> = { paused: 0, x1: 1, x2: 2, x5: 5 };

export function BattleScreen({ battleId, onExit, onRetreat }: BattleScreenProps): ReactElement {
  const battleTick = useGameSelector((game) => game.battles[battleId]?.tick ?? -1);
  const game = store.getState().game;
  const battle = game?.battles[battleId];
  const [speed, setSpeed] = useState<BattleSpeed>('paused');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [pendingTacticId, setPendingTacticId] = useState<TacticId | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

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
  const availableTactics = useMemo(() => {
    if (selectedUnit === undefined) return [];
    return getBattleTacticOptions(battleId, selectedUnit.id);
  }, [battleId, selectedUnit]);
  const battleResolved = battle?.result !== null;

  useEffect(() => {
    if (battleResolved || speed === 'paused') return undefined;
    const delay = Math.max(50, BAL.kassenTickMs / SPEED_FACTOR[speed]);
    const timer = window.setInterval(() => {
      const result = runBattleTick(battleId);
      setLogs((current) => [
        ...current.slice(-49),
        t('ui.battle.logLine', {
          tick: result.tick,
          text: t('ui.battle.logProgressed'),
        }),
      ]);
      if (result.resolved) setSpeed('paused');
    }, delay);
    return () => window.clearInterval(timer);
  }, [battleId, battleResolved, speed]);

  if (battle === undefined) {
    return <main data-testid="screen-battle">{t('ui.battle.missing')}</main>;
  }

  const issue = (order: BattleCommand) => dispatchBattleOrder(battleId, order);
  const selectEnemy = (targetUnitId: string) => {
    if (selectedUnit === undefined) return;
    if (pendingTacticId !== null) {
      issue({
        kind: 'tactic',
        unitId: selectedUnit.id,
        tacticId: pendingTacticId,
        targetUnitId,
      });
      setPendingTacticId(null);
      return;
    }
    issue({ kind: 'attack', unitId: selectedUnit.id, targetUnitId });
  };
  const issueTactic = (tacticId: TacticId) => {
    if (selectedUnit === undefined) return;
    const definition = availableTactics.find((candidate) => candidate.id === tacticId);
    if (definition?.needsTarget) {
      setPendingTacticId(tacticId);
      return;
    }
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
    <main className={styles.screen} data-testid="screen-battle">
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
            aria-pressed={speed === option}
            aria-label={
              option === 'paused' ? t('ui.speed.aria.pause') : t(`ui.speed.aria.${option}`)
            }
            onClick={() => setSpeed(option)}
          >
            {option === 'paused' ? '⏸' : `×${option.slice(1)}`}
          </button>
        ))}
        <button type="button" onClick={toggleAllDelegation}>
          {t('cmd.battle.delegateAll')}：
          {controllablePlayerUnits.every((unit) => unit.delegated)
            ? t('ui.battle.delegateOn')
            : t('ui.battle.delegateOff')}
        </button>
        {game?.meta.debugMode && (
          <button type="button" data-testid="battle-retreat" onClick={onRetreat}>
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
              aria-pressed={unit.id === selectedUnit?.id}
              disabled={unit.routed || unit.exited || unit.troops <= 0}
              onClick={() => setSelectedUnitId(unit.id)}
            >
              <strong>{store.getState().game?.officers[unit.generalId]?.name ?? unit.id}</strong>
              <span>{t('ui.battle.troops', { count: unit.troops })}</span>
              <ProgressBar
                value={unit.morale}
                max={100}
                label={t('ui.battle.morale', { value: unit.morale })}
              />
              <small>
                {unit.routed
                  ? t('ui.battle.unit.routed')
                  : unit.moveTargetJinId === null
                    ? t('ui.battle.unit.idle')
                    : t('ui.battle.unit.moving')}
              </small>
            </button>
          ))}
        </aside>

        <section className={styles.battlefield} aria-label={t('ui.battle.battlefield')}>
          {battle.jins.map((jin) => {
            const enemiesHere = enemyUnits.filter(
              (unit) => unit.jinId === jin.id && !unit.routed && unit.troops > 0,
            );
            return (
              <div
                key={jin.id}
                className={`${styles.jin} ${jin.isHonjin ? styles.honjin : ''}`}
                data-owner={jin.owner}
                style={{ gridColumn: jin.col + 1, gridRow: jin.row + 1 }}
              >
                <button
                  type="button"
                  className={styles.jinButton}
                  data-testid={`battle-jin-${jin.id}`}
                  onClick={() => {
                    if (selectedUnit !== undefined && enemiesHere.length === 0) {
                      issue({ kind: 'move', unitId: selectedUnit.id, targetJinId: jin.id });
                    }
                  }}
                >
                  {jin.isHonjin ? t('ui.battle.honjin') : jin.id}
                  <small>
                    {t('ui.battle.flag', { value: Math.max(0, Math.round(jin.flagPower)) })}
                  </small>
                </button>
                {enemiesHere.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    className={styles.enemyUnit}
                    aria-label={t('ui.battle.enemyTroops', { count: unit.troops })}
                    onClick={() => selectEnemy(unit.id)}
                  >
                    {t('ui.battle.enemyTroops', { count: unit.troops })}
                  </button>
                ))}
              </div>
            );
          })}
        </section>

        <aside className={styles.log} aria-live="polite">
          <h2>{t('ui.battle.log')}</h2>
          <ol>
            {logs.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ol>
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
                disabled={playerSaihai < definition.saihaiCost || cooldown > 0}
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
        <section className={styles.result} role="dialog" aria-modal="true">
          <h2>
            {battle.result.winnerSide === playerSide
              ? t('ui.battle.victory')
              : t('ui.battle.defeat')}
          </h2>
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
          <button type="button" onClick={onExit}>
            {t('ui.battle.returnStrategy')}
          </button>
        </section>
      )}
    </main>
  );
}
