// 勢力政策の内建型錄（05 §3.7.2／§4）。
// 政策效果由各機制系統套用；本檔只描述解鎖、維持費與互斥契約。

import type { CourtRank } from './state/enums';
import type { EventId, FacilityTypeId, PolicyId } from './state/ids';

export interface PolicyDef {
  id: PolicyId;
  nameKey: string;
  unlockPrestige: number;
  unlockCourtRank: CourtRank | null;
  unlockEvent: EventId | null;
  requiresFacility: FacilityTypeId | null;
  upkeepGold: number;
  exclusiveWith: PolicyId | null;
}

const policyId = (id: string): PolicyId => id as PolicyId;
const facilityId = (id: string): FacilityTypeId => id as FacilityTypeId;
const eventId = (id: string): EventId => id as EventId;

/** 05 §3.7.2 的 12 項勢力政策，順序與規格表一致。 */
export const POLICY_DEFS = [
  {
    id: policyId('pol.rakuichi'),
    nameKey: 'pol.rakuichi.name',
    unlockPrestige: 100,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 50,
    exclusiveWith: null,
  },
  {
    id: policyId('pol.kenchi'),
    nameKey: 'pol.kenchi.name',
    unlockPrestige: 300,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 100,
    exclusiveWith: null,
  },
  {
    id: policyId('pol.tenmasei'),
    nameKey: 'pol.tenmasei.name',
    unlockPrestige: 200,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 60,
    exclusiveWith: null,
  },
  {
    id: policyId('pol.jishahogo'),
    nameKey: 'pol.jishahogo.name',
    unlockPrestige: 150,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 40,
    exclusiveWith: policyId('pol.nanban'),
  },
  {
    id: policyId('pol.nanban'),
    nameKey: 'pol.nanban.name',
    unlockPrestige: 400,
    unlockCourtRank: null,
    unlockEvent: eventId('evt.nanban-visit'),
    requiresFacility: facilityId('fac.minato'),
    upkeepGold: 120,
    exclusiveWith: policyId('pol.jishahogo'),
  },
  {
    id: policyId('pol.sekisho'),
    nameKey: 'pol.sekisho.name',
    unlockPrestige: 250,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 80,
    exclusiveWith: null,
  },
  {
    id: policyId('pol.jokashuju'),
    nameKey: 'pol.jokashuju.name',
    unlockPrestige: 500,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 100,
    exclusiveWith: null,
  },
  {
    id: policyId('pol.meyasubako'),
    nameKey: 'pol.meyasubako.name',
    unlockPrestige: 100,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 30,
    exclusiveWith: null,
  },
  {
    id: policyId('pol.heinobunri'),
    nameKey: 'pol.heinobunri.name',
    unlockPrestige: 600,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 150,
    exclusiveWith: policyId('pol.goningumi'),
  },
  {
    id: policyId('pol.goningumi'),
    nameKey: 'pol.goningumi.name',
    unlockPrestige: 350,
    unlockCourtRank: null,
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 70,
    exclusiveWith: policyId('pol.heinobunri'),
  },
  {
    id: policyId('pol.kakishuchu'),
    nameKey: 'pol.kakishuchu.name',
    unlockPrestige: 700,
    unlockCourtRank: null,
    unlockEvent: eventId('evt.teppo-denrai'),
    requiresFacility: facilityId('fac.shagekijo'),
    upkeepGold: 200,
    exclusiveWith: null,
  },
  {
    id: policyId('pol.enkokinko'),
    nameKey: 'pol.enkokinko.name',
    unlockPrestige: 450,
    unlockCourtRank: 'ju5ge',
    unlockEvent: null,
    requiresFacility: null,
    upkeepGold: 90,
    exclusiveWith: null,
  },
] as const satisfies readonly PolicyDef[];

/** 依 ID 索引的型錄，供內政 selector／system 做常數時間查找。 */
export const POLICIES = Object.fromEntries(POLICY_DEFS.map((def) => [def.id, def])) as Readonly<
  Record<PolicyId, PolicyDef>
>;
