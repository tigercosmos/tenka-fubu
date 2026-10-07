import type { GameState } from '@core/state/gameState';
import { getSentiment, getTrust, isAtWar } from '@core/index';

/** Detached UI projection: forms never hold or mutate canonical state objects. */
export function selectM6View(game: GameState) {
  return {
    playerClanId: game.meta.playerClanId,
    day: game.time.day,
    year: game.time.year,
    month: game.time.month,
    relations: Object.values(game.clans)
      .filter((clan) => clan.alive && clan.id !== game.meta.playerClanId)
      .map((clan) => ({
        id: clan.id,
        name: clan.name,
        sentiment: getSentiment(game, clan.id, game.meta.playerClanId),
        trust: getTrust(game, game.meta.playerClanId, clan.id),
        war: isAtWar(game, game.meta.playerClanId, clan.id),
      }))
      .sort((a, b) => b.sentiment - a.sentiment || a.id.localeCompare(b.id)),
    diplomacyRows: Object.values(game.diplomacy.rows).map((row) => ({
      a: row.a,
      b: row.b,
      pacts: row.pacts.map((pact) => ({ ...pact })),
    })),
    clans: Object.values(game.clans)
      .filter((clan) => clan.alive)
      .map((clan) => ({ ...clan, taimei: { ...clan.taimei } })),
    officers: Object.values(game.officers)
      .filter((officer) => officer.hasComeOfAge && officer.status !== 'dead')
      .map((officer) => ({
        id: officer.id,
        name: officer.name,
        clanId: officer.clanId,
        status: officer.status,
        locationCastleId: officer.locationCastleId,
        armyId: officer.armyId,
        capturedByClanId: officer.capturedByClanId,
        loyalty: officer.loyalty,
        rank: officer.rank,
        spouseId: officer.spouseId,
      })),
    castles: Object.values(game.castles).map((castle) => ({
      id: castle.id,
      name: castle.name,
      ownerClanId: castle.ownerClanId,
      lordId: castle.lordId,
      betrayalReadyClanId: castle.betrayalReadyClanId,
      betrayalReadyUntilDay: castle.betrayalReadyUntilDay,
    })),
    districts: Object.values(game.districts).map((district) => ({
      id: district.id,
      name: district.name,
      ownerClanId: district.ownerClanId,
      stewardId: district.stewardId,
    })),
    missions: game.diplomacy.missions.map((mission) => ({ ...mission })),
    plots: game.diplomacy.plots.map((plot) => ({ ...plot })),
    envoys: game.diplomacy.pendingProposals
      .filter((proposal) => proposal.toClanId === game.meta.playerClanId)
      .map((proposal) => ({
        ...proposal,
        marriageOfficerIds:
          proposal.marriageOfficerIds === null ? null : [...proposal.marriageOfficerIds],
      })),
    proposals: Object.values(game.proposals)
      .filter(
        (proposal) => proposal.clanId === game.meta.playerClanId && proposal.status === 'pending',
      )
      .sort((a, b) => a.createdDay - b.createdDay || a.id.localeCompare(b.id))
      .map((proposal) => ({
        ...proposal,
        command: structuredClone(proposal.command),
        summaryParams: { ...proposal.summaryParams },
      })),
    courtFavor: game.court.courtFavor[game.meta.playerClanId] ?? 0,
    shogunateFavor: game.court.shogunateFavor[game.meta.playerClanId] ?? 0,
    shogunateExists: game.court.shogunateExists,
    patronClanId: game.court.patronClanId,
    sieges: Object.values(game.sieges).map((siege) => ({ id: siege.id, castleId: siege.castleId })),
  };
}
