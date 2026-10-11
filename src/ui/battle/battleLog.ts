import type { BattleTickEvent } from '@app/battleBridge';
import type { GameState } from '@core/state/gameState';
import type { BattleId } from '@core/state/ids';
import { hasKey, t } from '@i18n/zh-TW';
import { UI } from '../uiConstants';

export interface BattleLogRow {
  readonly id: string;
  readonly tick: number;
  readonly sequence: number;
  readonly kind: BattleTickEvent['type'];
  readonly text: string;
}

/** Battle-facing identity: friendly officer names, enemy side plus stable unit ID. */
export function battleUnitLabel(
  state: Readonly<GameState>,
  battleId: BattleId,
  id: string,
): string {
  const battle = state.battles[battleId];
  const unit = battle?.units.find((candidate) => candidate.id === id);
  if (!unit) return id;
  const playerSide =
    state.meta.playerClanId === battle?.attackerClanId
      ? 'attacker'
      : state.meta.playerClanId === battle?.defenderClanId
        ? 'defender'
        : null;
  return unit.side === playerSide
    ? (state.officers[unit.generalId]?.name ?? id)
    : `${t(`ui.battle.side.${unit.side}`)} ${id}`;
}

/** Project executing-stage facts only. Missing identities remain honest stable IDs. */
export function projectBattleLog(
  state: Readonly<GameState>,
  battleId: BattleId,
  tick: number,
  events: readonly BattleTickEvent[],
): readonly BattleLogRow[] {
  const battle = state.battles[battleId];
  const unitName = (id: string): string => battleUnitLabel(state, battleId, id);
  const jinName = (id: string): string =>
    battle?.jins.find((jin) => jin.id === id)?.isHonjin ? `${t('ui.battle.honjin')} ${id}` : id;
  const number = (value: number): string =>
    value.toLocaleString('zh-TW', { maximumFractionDigits: 3 });
  const text = (event: BattleTickEvent): string | null => {
    switch (event.type) {
      case 'move.accepted':
        return t('ui.battle.log.move', {
          unit: unitName(event.unitId),
          jin: jinName(event.targetJinId),
        });
      case 'attack.accepted':
        return t('ui.battle.log.attack', {
          unit: unitName(event.unitId),
          target: unitName(event.targetUnitId),
        });
      case 'delegation.changed':
        return t(event.enabled ? 'ui.battle.log.delegateOn' : 'ui.battle.log.delegateOff', {
          unit: unitName(event.unitId),
        });
      case 'tactic.accepted': {
        const key = `${event.tacticId}.name`;
        const tactic = hasKey(key) ? t(key) : event.tacticId;
        return event.targetUnitId === null
          ? t('ui.battle.log.tactic', { unit: unitName(event.unitId), tactic })
          : t('ui.battle.log.tacticTarget', {
              unit: unitName(event.unitId),
              target: unitName(event.targetUnitId),
              tactic,
            });
      }
      case 'unit.changed':
        if (event.troopsBefore === event.troopsAfter && event.moraleBefore === event.moraleAfter)
          return null;
        return t('ui.battle.log.changed', {
          source: t(`ui.battle.log.source.${event.source}`),
          unit: unitName(event.unitId),
          troopsBefore: number(event.troopsBefore),
          troopsAfter: number(event.troopsAfter),
          moraleBefore: number(event.moraleBefore),
          moraleAfter: number(event.moraleAfter),
        });
      case 'unit.arrived':
        return t(
          event.reason === 'move' ? 'ui.battle.log.arrived' : 'ui.battle.log.retreatArrived',
          {
            unit: unitName(event.unitId),
            from: jinName(event.fromJinId),
            to: jinName(event.toJinId),
          },
        );
      case 'unit.routed':
        return t('ui.battle.log.routed', { unit: unitName(event.unitId) });
      case 'unit.exited':
        return t('ui.battle.log.exited', { unit: unitName(event.unitId) });
      case 'flag.damaged':
        if (event.amount <= 0 || event.flagPowerBefore === event.flagPowerAfter) return null;
        return t('ui.battle.log.flag', {
          source: t(`ui.battle.log.flag.${event.source}`),
          jin: jinName(event.jinId),
          before: number(event.flagPowerBefore),
          after: number(event.flagPowerAfter),
        });
      case 'jin.captured':
        return t('ui.battle.log.captured', {
          jin: jinName(event.jinId),
          before: t(`ui.battle.side.${event.ownerBefore}`),
          after: t(`ui.battle.side.${event.ownerAfter}`),
          value: number(event.flagPower),
        });
      case 'battle.resolved': {
        const clanId =
          event.winnerSide === 'attacker' ? battle?.attackerClanId : battle?.defenderClanId;
        const winner = clanId
          ? (state.clans[clanId]?.name ?? clanId)
          : t(`ui.battle.side.${event.winnerSide}`);
        return t('ui.battle.log.resolved', {
          winner,
          attacker: number(event.attackerLosses),
          defender: number(event.defenderLosses),
          awe: t(`term.awe.${event.aweLevel}`),
        });
      }
    }
  };
  return events.flatMap((event) => {
    const body = text(event);
    return body === null
      ? []
      : [
          {
            id: `${battleId}:${tick}:${event.sequence}`,
            tick,
            sequence: event.sequence,
            kind: event.type,
            text: t('ui.battle.logLine', { tick, text: body }),
          },
        ];
  });
}

export function appendBattleLogRows(
  existing: readonly BattleLogRow[],
  batch: readonly BattleLogRow[],
  limit: number = UI.battleLogMaxRows,
): readonly BattleLogRow[] {
  if (batch.length === 0) return existing;
  const seen = new Set(existing.map((row) => row.id));
  const additions = batch.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  if (additions.length === 0) return existing;
  const count = Math.floor(limit);
  return count <= 0 ? [] : [...existing, ...additions].slice(-count);
}

export function isBattleLogNearBottom(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number,
): boolean {
  return scrollHeight - clientHeight - scrollTop <= UI.battleLogNearBottomPx;
}
