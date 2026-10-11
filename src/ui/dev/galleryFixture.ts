import { createIsolatedGameStore } from '@app/dev/createIsolatedGameStore';
import { buildGameState } from '@core/index';
import type { Castle, Clan, Officer } from '@core/state/gameState';
import type { CastleId, ClanId, OfficerId, ProvinceId, SiegeId } from '@core/state/ids';

export const GALLERY_CLAN = 'clan.gallery' as ClanId;
export const GALLERY_CASTLE = 'castle.gallery' as CastleId;
export const GALLERY_OFFICER = 'off.gallery' as OfficerId;
export const GALLERY_BRANCH = 'castle.gallery-branch' as CastleId;
export const GALLERY_LOW_LOYALTY = 'off.gallery-low-loyalty' as OfficerId;

/** Pure presentation-only entities: never registered with bridge, saves, a game loop or live store. */
export function createGalleryStore() {
  const clan: Clan = {
    id: GALLERY_CLAN,
    name: '展示家',
    leaderId: GALLERY_OFFICER,
    homeCastleId: GALLERY_CASTLE,
    gold: 1200,
    rewardGoldSpentThisMonth: 0,
    prestige: 800,
    courtRank: 'none',
    shogunateTitle: 'none',
    colorIndex: 5,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  };
  const officer: Officer = {
    id: GALLERY_OFFICER,
    name: '展示武將',
    clanId: GALLERY_CLAN,
    status: 'serving',
    ldr: 110,
    val: 92,
    int: 76,
    pol: 88,
    statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
    statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
    traits: [],
    rank: 'karo',
    merit: 1000,
    loyalty: 100,
    kinship: 'kin',
    spouseId: null,
    birthYear: 1520,
    deathYear: 1590,
    hasComeOfAge: true,
    debutYear: 1535,
    debutClanId: GALLERY_CLAN,
    debutCastleId: GALLERY_CASTLE,
    locationCastleId: GALLERY_CASTLE,
    armyId: null,
    capturedByClanId: null,
    scheduledDeath: { year: 1590, month: 1 },
    captiveRetryOn: null,
    recruitRetryOn: null,
    rewardGiftsThisYear: 0,
    stalledPromotionMonths: 0,
  };
  const castle: Castle = {
    id: GALLERY_CASTLE,
    name: '展示本城',
    tier: 'main',
    provinceId: 'prov.gallery' as ProvinceId,
    coastal: false,
    pos: { x: 1000, y: 1000 },
    ownerClanId: GALLERY_CLAN,
    lordId: GALLERY_OFFICER,
    directControl: true,
    corpsId: null,
    durability: 700,
    maxDurability: 1000,
    soldiers: 2400,
    food: 6000,
    foodFrac: 0,
    riceTradedThisMonth: 0,
    morale: 80,
    conscriptPolicy: 'mid',
    facilities: [],
    buildQueue: [],
    districtIds: [],
    betrayalReadyClanId: null,
    betrayalReadyUntilDay: 0,
    betrayalImmunityUntilDay: 0,
    betrayalReadyTargetClanId: null,
    betrayalReadyTargetLordId: null,
  };
  const game = buildGameState({
    scenarioId: 'gallery',
    appVersion: 'dev',
    seed: 42,
    startDay: 90,
    playerClanId: GALLERY_CLAN,
    difficulty: 'normal',
    clans: [],
    officers: [],
    castles: [],
    districts: [],
    provinces: [],
    roads: [],
    personas: {},
    clanPersonaIds: {},
  });
  game.clans[GALLERY_CLAN] = clan;
  game.officers[GALLERY_OFFICER] = officer;
  game.castles[GALLERY_CASTLE] = castle;
  game.castles[GALLERY_BRANCH] = {
    ...castle,
    id: GALLERY_BRANCH,
    name: '展示支城',
    tier: 'branch',
    lordId: null,
    durability: 200,
    maxDurability: 500,
  };
  game.officers[GALLERY_LOW_LOYALTY] = {
    ...officer,
    id: GALLERY_LOW_LOYALTY,
    name: '低忠誠展示武將',
    loyalty: 20,
    kinship: 'tozama',
  };
  const siegeId = 'siege.gallery' as SiegeId;
  game.sieges[siegeId] = {
    id: siegeId,
    castleId: GALLERY_BRANCH,
    attackerClanId: GALLERY_CLAN,
    attackerArmyIds: [],
    mode: 'encircle',
    startDay: 90,
    interrupted: false,
    betrayalUsed: false,
  };
  return createIsolatedGameStore(game);
}
