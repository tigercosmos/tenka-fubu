// 城下施設の内建型錄（05 §3.4.2／§4）。
// 施設效果的數值與套用點分別由 BAL 與各系統擁有；本檔只描述建造契約。

import type { FacilityTypeId, PolicyId } from './state/ids';

export interface FacilityDef {
  id: FacilityTypeId;
  nameKey: string;
  costGold: number;
  buildDays: number;
  mainCastleOnly: boolean;
  requiresCoastal: boolean;
  requiresFacility: FacilityTypeId | null;
  requiresPolicy: PolicyId | null;
  exclusiveWith: FacilityTypeId | null;
}

const facilityId = (id: string): FacilityTypeId => id as FacilityTypeId;
const policyId = (id: string): PolicyId => id as PolicyId;

/** 05 §3.4.2 的 16 種城下施設，順序與規格表一致。 */
export const FACILITY_DEFS = [
  {
    id: facilityId('fac.ichi'),
    nameKey: 'term.facility.ichi',
    costGold: 200,
    buildDays: 60,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.komedoiya'),
    nameKey: 'term.facility.komedoiya',
    costGold: 250,
    buildDays: 60,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: facilityId('fac.ichi'),
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.heisha'),
    nameKey: 'term.facility.heisha',
    costGold: 300,
    buildDays: 90,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.umaya'),
    nameKey: 'term.facility.umaya',
    costGold: 400,
    buildDays: 120,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.kajiba'),
    nameKey: 'term.facility.kajiba',
    costGold: 400,
    buildDays: 120,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.shagekijo'),
    nameKey: 'term.facility.shagekijo',
    costGold: 500,
    buildDays: 120,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: facilityId('fac.kajiba'),
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.hyojosho'),
    nameKey: 'term.facility.hyojosho',
    costGold: 350,
    buildDays: 90,
    mainCastleOnly: true,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.minato'),
    nameKey: 'term.facility.minato',
    costGold: 600,
    buildDays: 150,
    mainCastleOnly: false,
    requiresCoastal: true,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.jisha'),
    nameKey: 'term.facility.jisha',
    costGold: 300,
    buildDays: 90,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: facilityId('fac.nanbanji'),
  },
  {
    id: facilityId('fac.nanbanji'),
    nameKey: 'term.facility.nanbanji',
    costGold: 500,
    buildDays: 120,
    mainCastleOnly: false,
    requiresCoastal: true,
    requiresFacility: null,
    requiresPolicy: policyId('pol.nanban'),
    exclusiveWith: facilityId('fac.jisha'),
  },
  {
    id: facilityId('fac.inkyo'),
    nameKey: 'term.facility.inkyo',
    costGold: 250,
    buildDays: 60,
    mainCastleOnly: true,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.kura'),
    nameKey: 'term.facility.kura',
    costGold: 300,
    buildDays: 90,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.toride'),
    nameKey: 'term.facility.toride',
    costGold: 350,
    buildDays: 90,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.gakumonjo'),
    nameKey: 'term.facility.gakumonjo',
    costGold: 400,
    buildDays: 120,
    mainCastleOnly: true,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.ikan'),
    nameKey: 'term.facility.ikan',
    costGold: 300,
    buildDays: 90,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
  {
    id: facilityId('fac.jokaku'),
    nameKey: 'term.facility.jokaku',
    costGold: 800,
    buildDays: 180,
    mainCastleOnly: false,
    requiresCoastal: false,
    requiresFacility: null,
    requiresPolicy: null,
    exclusiveWith: null,
  },
] as const satisfies readonly FacilityDef[];

/** 依 ID 索引的型錄，供內政 selector／system 做常數時間查找。 */
export const FACILITIES = Object.fromEntries(FACILITY_DEFS.map((def) => [def.id, def])) as Readonly<
  Record<FacilityTypeId, FacilityDef>
>;
