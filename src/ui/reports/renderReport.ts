import type { GameEvent } from '@core/state/events';
import type { GameState } from '@core/state/gameState';
import type { ArmyId, CastleId, ClanId, MapNodeId, OfficerId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';

function clanName(game: GameState, id: ClanId): string {
  return game.clans[id]?.name ?? id;
}

function nodeName(game: GameState, id: MapNodeId): string {
  return game.castles[id as CastleId]?.name ?? game.districts[id as never]?.name ?? id;
}

function officerName(game: GameState, id: OfficerId): string {
  return game.officers[id]?.name ?? '武將';
}

interface ArmyEventRef {
  armyId: ArmyId;
  /** Stable event snapshot; newly emitted M4 events carry this even after the Army is deleted. */
  leaderId?: OfficerId;
}

function armyLeader(game: GameState, ref: ArmyEventRef): string {
  if (ref.leaderId !== undefined) return game.officers[ref.leaderId]?.name ?? ref.leaderId;
  const army = game.armies[ref.armyId];
  if (army !== undefined) return game.officers[army.leaderId]?.name ?? ref.armyId;
  const assigned = Object.values(game.officers).find((officer) => officer.armyId === ref.armyId);
  return assigned?.name ?? '我軍';
}

function battlePlace(game: GameState, id: string): string {
  const nodeId = game.battles[id as never]?.nodeId ?? game.fieldCombats[id]?.nodeId;
  return nodeId === undefined ? '戰場' : nodeName(game, nodeId);
}

/** Raw military GameEvent → localized, player-perspective report title. */
export function renderReport(
  event: GameEvent,
  game: GameState,
  player: ClanId = game.meta.playerClanId,
): string | null {
  switch (event.type) {
    case 'economy.income':
      return t('report.economy.income', {
        month: (Math.floor(event.day / 30) % 12) + 1,
        gold: event.gold,
      });
    case 'economy.harvest':
      return t('report.economy.harvest', { food: event.totalFood });
    case 'economy.upkeepUnpaid':
      return t('report.economy.salaryUnpaid');
    case 'economy.foodShortage':
      return t('report.economy.castleStarving', { castle: nodeName(game, event.castleId) });
    case 'economy.granaryOverflow':
      return t('report.economy.granaryOverflow', {
        castle: nodeName(game, event.castleId),
        food: event.food,
      });
    case 'facility.completed':
      return t('report.build.done', {
        castle: nodeName(game, event.castleId),
        facility: t(`term.facility.${event.facilityTypeId.slice(4)}`),
      });
    case 'policy.autoRevoked':
      return t('report.policy.autoRevoked', { name: t(`${event.policyId}.name`) });
    case 'transport.arrived':
      return t('report.transport.arrived', { castle: nodeName(game, event.toCastleId) });
    case 'transport.looted':
      if (event.ownerClanId === player) {
        return t('report.transport.looted', {
          place: nodeName(game, event.nodeId),
          clan: clanName(game, event.byClanId),
        });
      }
      return event.byClanId === player
        ? t('report.transport.lootGain', { place: nodeName(game, event.nodeId) })
        : null;
    case 'uprising.started':
      return t('report.uprising.started', { district: nodeName(game, event.districtId) });
    case 'uprising.ended':
      return t(
        event.resolved === 'suppressed' ? 'report.uprising.suppressed' : 'report.uprising.subsided',
        { district: nodeName(game, event.districtId) },
      );
    case 'officer.promoted':
      return t('report.officer.promoted', {
        name: officerName(game, event.officerId),
        rank: t(`term.rank.${event.newRank}`),
      });
    case 'officer.loyaltyLow':
      return t('report.officer.loyaltyLow', { name: officerName(game, event.officerId) });
    case 'clan.succession':
      return t(
        game.officers[event.deceasedId]?.status === 'captive'
          ? 'report.clan.successionCaptured'
          : 'report.clan.succession',
        {
          oldLeader: officerName(game, event.deceasedId),
          newLeader: officerName(game, event.heirId),
        },
      );
    case 'army.departed':
      return t('report.army.departed', {
        leader: armyLeader(game, event),
        castle: nodeName(game, event.originCastleId),
      });
    case 'army.arrived':
      return t('report.army.arrived', {
        leader: armyLeader(game, event),
        place: nodeName(game, event.nodeId),
      });
    case 'army.returned':
      return t('report.army.returned', {
        leader: armyLeader(game, event),
        castle: nodeName(game, event.castleId),
      });
    case 'army.starving': {
      const leader = armyLeader(game, event);
      return t('report.army.noFood', { army: `${leader}隊` });
    }
    case 'army.blocked': {
      const leader = armyLeader(game, event);
      return t('report.army.blocked', { army: `${leader}隊`, place: nodeName(game, event.nodeId) });
    }
    case 'army.routed': {
      const leader = armyLeader(game, event);
      return t('report.field.rout', { army: `${leader}隊` });
    }
    case 'district.subjugated':
      if (event.toClanId === player) {
        return t('report.army.subjugated', {
          leader: armyLeader(game, event),
          district: nodeName(game, event.districtId),
        });
      }
      return event.fromClanId === player
        ? t('report.army.districtLost', {
            district: nodeName(game, event.districtId),
            clan: clanName(game, event.toClanId),
          })
        : null;
    case 'battle.started':
      return t('report.field.begin', {
        a: clanName(game, event.attackerClanId),
        b: clanName(game, event.defenderClanId),
        place: nodeName(game, event.nodeId),
      });
    case 'battle.kassenAvailable':
      return t('report.battle.available', { place: battlePlace(game, event.battleId) });
    case 'battle.ended': {
      const place = nodeName(game, event.nodeId);
      if (event.winnerClanId === null) return t('report.field.resolved', { place });
      if (event.winnerClanId === player) {
        const loser = event.attackerClanId === player ? event.defenderClanId : event.attackerClanId;
        return t('report.battle.won', {
          winner: clanName(game, player),
          place,
          loser: clanName(game, loser),
        });
      }
      if (event.attackerClanId === player || event.defenderClanId === player) {
        return t('report.battle.lost', {
          loser: clanName(game, player),
          place,
          winner:
            event.winnerClanId === null ? t('ui.common.none') : clanName(game, event.winnerClanId),
        });
      }
      return t('report.field.resolved', { place });
    }
    case 'awe.triggered':
      if (event.level === 'small') return t('report.battle.awe.small');
      if (event.level === 'medium') return t('report.battle.awe.medium');
      if (event.level === 'large')
        return t('report.battle.awe.large', { clan: clanName(game, event.clanId) });
      return null;
    case 'siege.started':
      return t('report.siege.begin', {
        castle: nodeName(game, event.castleId),
        clan: clanName(game, event.attackerClanId),
      });
    case 'siege.relief':
      return t('report.siege.relief', { castle: nodeName(game, event.castleId) });
    case 'siege.ended':
      return t(event.fallen ? 'report.siege.fallen' : 'report.siege.repelled', {
        castle: nodeName(game, event.castleId),
      });
    case 'command.rejected':
      return t(event.reasonKey, event.params);
    case 'clan.destroyed':
      return t('report.clan.destroyed', { clanName: clanName(game, event.clanId) });
    case 'victory.tenkabitoProgress':
      return t('report.victory.tenkabitoProgress', { months: event.months });
    case 'policy.enacted':
    case 'policy.revoked':
    case 'conscript.completed':
    case 'proposal.resolved':
    case 'time.monthStart':
    case 'time.seasonStart':
    case 'game.victory':
    case 'game.defeat':
      return null;
    default:
      // Domains scheduled after M4 remain intentionally absent instead of leaking internal event names.
      return null;
  }
}
