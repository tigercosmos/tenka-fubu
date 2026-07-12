// M3-5：05 §4 的內政資料結構 readiness 與內建型錄契約。

import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from '../../src/core/facilities';
import { POLICY_DEFS } from '../../src/core/policies';
import { isFacilityTypeId, isPolicyId } from '../../src/core/state/ids';
import { zDistrict } from '../../src/data/schemas/district';

describe('domestic definition catalogs', () => {
  it('contains the 16 unique facilities from 05 §3.4.2', () => {
    expect(FACILITY_DEFS).toHaveLength(16);
    expect(new Set(FACILITY_DEFS.map((def) => def.id))).toHaveLength(16);
    expect(FACILITY_DEFS.every((def) => isFacilityTypeId(def.id))).toBe(true);

    const byId = new Map<string, (typeof FACILITY_DEFS)[number]>(
      FACILITY_DEFS.map((def) => [def.id, def]),
    );
    expect(byId.get('fac.komedoiya')?.requiresFacility).toBe('fac.ichi');
    expect(byId.get('fac.shagekijo')?.requiresFacility).toBe('fac.kajiba');
    expect(byId.get('fac.nanbanji')).toMatchObject({
      requiresCoastal: true,
      requiresPolicy: 'pol.nanban',
      exclusiveWith: 'fac.jisha',
    });
    expect(byId.get('fac.jisha')?.exclusiveWith).toBe('fac.nanbanji');
    expect(FACILITY_DEFS.filter((def) => def.mainCastleOnly).map((def) => def.id)).toEqual([
      'fac.hyojosho',
      'fac.inkyo',
      'fac.gakumonjo',
    ]);
  });

  it('contains the 12 unique policies and their special unlock contracts', () => {
    expect(POLICY_DEFS).toHaveLength(12);
    expect(new Set(POLICY_DEFS.map((def) => def.id))).toHaveLength(12);
    expect(POLICY_DEFS.every((def) => isPolicyId(def.id))).toBe(true);

    const byId = new Map<string, (typeof POLICY_DEFS)[number]>(
      POLICY_DEFS.map((def) => [def.id, def]),
    );
    expect(byId.get('pol.nanban')).toMatchObject({
      unlockPrestige: 400,
      unlockEvent: 'evt.nanban-visit',
      requiresFacility: 'fac.minato',
      upkeepGold: 120,
      exclusiveWith: 'pol.jishahogo',
    });
    expect(byId.get('pol.kakishuchu')).toMatchObject({
      unlockPrestige: 700,
      unlockEvent: 'evt.teppo-denrai',
      requiresFacility: 'fac.shagekijo',
    });
    expect(byId.get('pol.enkokinko')?.unlockCourtRank).toBe('ju5ge');

    for (const def of POLICY_DEFS) {
      if (def.exclusiveWith === null) continue;
      expect(byId.get(def.exclusiveWith)?.exclusiveWith).toBe(def.id);
    }
  });
});

describe('district domestic scenario schema', () => {
  it('accepts and preserves the three current/cap pairs', () => {
    const district = zDistrict.parse({
      id: 'dist.owari-kasugai',
      name: '春日井郡',
      castleId: 'castle.kiyosu',
      pos: { x: 100, y: 200 },
      kokudaka: 8_000,
      kokudakaCap: 12_000,
      commerce: 600,
      commerceCap: 1_000,
      population: 9_000,
      populationCap: 15_000,
    });

    expect(district).toMatchObject({
      kokudaka: 8_000,
      kokudakaCap: 12_000,
      commerce: 600,
      commerceCap: 1_000,
      population: 9_000,
      populationCap: 15_000,
      developFocus: 'agri',
    });
  });
});
