import type { CourtRank, PactKind, Region, ShogunateTitle } from '../../state/enums';
import type { CastleId, ClanId, DistrictId, EventId, OfficerId, ProvinceId } from '../../state/ids';

/** Declarative references; unbound symbols are never guessed from the player clan. */
export type ClanRef = ClanId | '$clan';
export type CastleRef = CastleId | '$castle';
export type DistrictRef = DistrictId | '$district';
export type RegionRef = Region | '$region';
/** Structured concatenation for plan10 §3.6; literal legacy keys retain their meaning. */
export type EventFlagKey =
  string | { prefix: string; clanId: ClanRef; year?: 'current' | undefined };
export type RegionEffect =
  | { op: 'scaleCastleDurability'; pct: number }
  | { op: 'addDistrictOrder'; amount: number }
  | { op: 'scalePopulation'; pct: number };

/** Region is optional so existing three-field saved bindings remain valid. */
export interface EventBinding {
  clanId: ClanId | null;
  castleId: CastleId | null;
  districtId: DistrictId | null;
  region?: Region | null;
}

/** Pure predicates only: probability belongs to EventTrigger, never the condition AST. */
export type EventCondition =
  | { kind: 'clanAlive'; clanId: ClanRef }
  | { kind: 'clanIsPlayer'; clanId: ClanRef; value: boolean }
  | { kind: 'clanGoldAtLeast'; clanId: ClanRef; value: number }
  | { kind: 'prestigeAtLeast'; clanId: ClanRef; value: number }
  | { kind: 'castleCountAtLeast'; clanId: ClanRef; count: number }
  | { kind: 'kokudakaShareAtLeast'; clanId: ClanRef; percent: number }
  | { kind: 'clanOwnsCoastalCastle'; clanId: ClanRef }
  | { kind: 'ownsProvince'; clanId: ClanRef; provinceId: ProvinceId }
  | { kind: 'castleOwner'; castleId: CastleRef; clanId: ClanRef }
  | { kind: 'districtPopulationAtLeast'; districtId: DistrictRef; value: number }
  | { kind: 'officerAlive'; officerId: OfficerId }
  | { kind: 'officerServes'; officerId: OfficerId; clanId: ClanRef }
  | { kind: 'officerIsLeader'; officerId: OfficerId; clanId: ClanRef }
  | { kind: 'officerInProvinces'; officerId: OfficerId; provinceIds: readonly ProvinceId[] }
  | { kind: 'atWar'; a: ClanRef; b: ClanRef }
  | { kind: 'pactExists'; a: ClanRef; b: ClanRef; pact: PactKind }
  | { kind: 'shogunateExists'; value: boolean }
  | { kind: 'shogunateTitleAtLeast'; clanId: ClanRef; title: ShogunateTitle }
  | { kind: 'courtRankAtLeast'; clanId: ClanRef; rank: CourtRank }
  | { kind: 'flag'; key: EventFlagKey; min: number }
  | { kind: 'eventFired'; eventId: EventId }
  | { kind: 'not'; cond: EventCondition }
  | { kind: 'any'; conds: readonly EventCondition[] };

export type EventHookKind = 'castleFallen' | 'clanDestroyed' | 'leaderDied' | 'battleEnded';
export interface EventHookSignal {
  kind: EventHookKind;
  day: number;
  clanIds: ClanId[];
  castleId: CastleId | null;
  officerId: OfficerId | null;
  winnerClanId: ClanId | null;
  playerInvolved: boolean;
}

/** Canonical plan10 §3.3. Ref aliases expose the generic bindings described in §3.2.3. */
export type EffectOp =
  | { op: 'addGold'; clanId: ClanRef; amount: number }
  | { op: 'addFood'; castleId: CastleRef; amount: number }
  | { op: 'addSoldiers'; castleId: CastleRef; amount: number }
  | { op: 'loseCastleSoldiersPct'; castleId: CastleRef; pct: number }
  | { op: 'reduceClanSoldiersPct'; clanId: ClanRef; pct: number }
  | { op: 'addPrestige'; clanId: ClanRef; amount: number }
  | { op: 'addLoyalty'; officerId: OfficerId; amount: number }
  | { op: 'addClanLoyalty'; clanId: ClanRef; amount: number }
  | { op: 'addMerit'; officerId: OfficerId; amount: number }
  | { op: 'transferOfficer'; officerId: OfficerId; toClanId: ClanId }
  | { op: 'makeRonin'; officerId: OfficerId }
  | { op: 'killOfficer'; officerId: OfficerId; cause: 'age' | 'battle' | 'execution' }
  | { op: 'renameOfficer'; officerId: OfficerId; name: string }
  | { op: 'addSentiment'; from: ClanRef; to: ClanRef; amount: number }
  | { op: 'addTrust'; from: ClanRef; to: ClanRef; amount: number }
  | { op: 'declareWar'; a: ClanRef; b: ClanRef }
  | {
      op: 'signPact';
      a: ClanRef;
      b: ClanRef;
      pact: PactKind;
      months: number | null;
      vassalClanId: ClanId | null;
    }
  | { op: 'breakPact'; a: ClanRef; b: ClanRef; pact: PactKind }
  | { op: 'transferCastle'; castleId: CastleRef; toClanId: ClanId }
  | { op: 'renameCastle'; castleId: CastleRef; name: string }
  | { op: 'renameClan'; clanId: ClanRef; name: string }
  | { op: 'addCastleMorale'; castleId: CastleRef; amount: number }
  | { op: 'addClanCastlesMorale'; clanId: ClanRef; amount: number }
  | { op: 'addCastleDurability'; castleId: CastleRef; amount: number }
  | { op: 'scaleCastleDurability'; castleId: CastleRef; pct: number }
  | { op: 'addDistrictOrder'; districtId: DistrictRef; amount: number }
  | { op: 'addClanOrder'; clanId: ClanRef; amount: number }
  | { op: 'scalePopulation'; districtId: DistrictRef; pct: number }
  | { op: 'affectRegion'; region: RegionRef; effects: RegionEffect[] }
  | { op: 'addCourtFavor'; clanId: ClanRef; amount: number }
  | { op: 'grantCourtRank'; clanId: ClanRef; rank: CourtRank }
  | { op: 'grantShogunateTitle'; clanId: ClanRef; title: ShogunateTitle }
  | { op: 'endShogunate' }
  | { op: 'setFlag'; key: EventFlagKey; value: number };

export interface ScenarioDate {
  year: number;
  month: number;
  day: number;
}
export type EventTargetKind =
  'fixed' | 'player' | 'eachClan' | 'randomDistrict' | 'randomRegionClan';
export interface EventTrigger {
  from: ScenarioDate | null;
  to: ScenarioDate | null;
  check: 'monthStart' | 'harvest' | 'hook';
  hooks: EventHookKind[];
  conditions: EventCondition[];
  probability: number;
  once: boolean;
  cooldownDays: number;
  cooldownKey: string | null;
}
export interface EventCutscene {
  title: string;
  body: string;
  monClanId: ClanRef | null;
}
export interface EventChoice {
  label: string;
  conditions: EventCondition[];
  effects: EffectOp[];
  aiWeight: number;
}
export interface EventDef {
  id: EventId;
  kind: 'historical' | 'generic';
  priority: number;
  trigger: EventTrigger;
  // ClanRef extends the §4.1 ClanId[] annotation to represent §3.6 ownerCandidates=[$clan].
  ownerCandidates: ClanRef[];
  target: EventTargetKind;
  cutscene: EventCutscene;
  choices: EventChoice[];
  effects: EffectOp[];
}
