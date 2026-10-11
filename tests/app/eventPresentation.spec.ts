import { describe, expect, it } from 'vitest';
import { buildEventModalVM } from '../../src/app/events/eventViewModel';
import { getEventPresentationOptions } from '../../src/app/events/presentationMetadata';
import { BAL } from '../../src/core/balance';
import { REGION_VALUES } from '../../src/core/state/enums';
import type { EventId } from '../../src/core/state/ids';
import type { EventBinding } from '../../src/core/systems/events/types';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { zCanonicalEventsFile } from '../../src/data/schemas/eventDefinitions';
import eventsJson from '../../src/data/scenarios/s1560/events.json';
import { buildTinyState, CLAN_ALPHA, CASTLE_A1, DIST_A1X } from '../fixtures/tiny';

const generic = zCanonicalEventsFile
  .parse(eventsJson)
  .events.filter((def) => def.kind === 'generic');
const catalog = createRuntimeEventEngine(generic);
describe('explicit generic event presentation', () => {
  it('shows an AI-resolved merchant as continuation-only without rechecking now-unaffordable choices', () => {
    const state = buildTinyState();
    state.clans[CLAN_ALPHA]!.gold = 0;
    const def = generic.find((event) => event.id === 'evt.teppo-denrai')!;
    const binding = { clanId: CLAN_ALPHA, castleId: null, districtId: null };
    const before = structuredClone(state);
    const result = buildEventModalVM(state, def, binding, catalog, {
      ...getEventPresentationOptions(def.id, binding),
      resolved: true,
      conditionReason: () => {
        throw new Error('Resolved choices must never be evaluated');
      },
    });
    expect(result).toMatchObject({ ok: true, vm: { requiresChoice: false, choices: [] } });
    expect(state).toEqual(before);
  });
  it.each(generic)(
    'presents actual $id narrative from an explicit occurrence without fake pending state',
    (def) => {
      const state = buildTinyState();
      const binding: EventBinding =
        def.target === 'randomRegionClan'
          ? { clanId: null, castleId: null, districtId: null, region: 'tokai' }
          : { clanId: CLAN_ALPHA, castleId: CASTLE_A1, districtId: DIST_A1X };
      const before = structuredClone(state);
      const result = buildEventModalVM(
        state,
        def,
        binding,
        catalog,
        getEventPresentationOptions(def.id, binding),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.vm.title).toBe(def.cutscene.title);
      expect(result.vm.body).not.toMatch(/\{[^{}]+\}|undefined|⟦/u);
      expect(result.vm.requiresChoice).toBe(def.choices.length > 0);
      expect(result.vm.choices).toHaveLength(def.choices.length);
      if (def.id === 'evt.gen-ekibyo')
        expect(result.vm.body).toContain(state.districts[DIST_A1X]!.name);
      if (def.id === 'evt.gen-jishin') expect(result.vm.body).toContain('東海地方');
      if (def.id === 'evt.teppo-denrai')
        expect(result.vm.body).toContain(`開價${BAL.genTeppoCost}貫`);
      expect(state).toEqual(before);
      expect(state.events.pendingChoiceEventId).toBeNull();
    },
  );
  it('uses canonical cost only for the exact merchant ID and resolves all nine explicit regions', () => {
    const empty = { clanId: null, castleId: null, districtId: null };
    expect(
      getEventPresentationOptions('evt.teppo-denrai' as EventId, empty).presentation?.cost,
    ).toBe(BAL.genTeppoCost);
    expect(
      getEventPresentationOptions('evt.unrelated' as EventId, empty).presentation?.cost,
    ).toBeUndefined();
    for (const region of REGION_VALUES)
      expect(
        getEventPresentationOptions('evt.gen-jishin' as EventId, { ...empty, region }).presentation
          ?.regionName,
      ).not.toMatch(/term\.|⟦/u);
  });
  it('never derives missing region/district text from clan geography or supplied labels', () => {
    const state = buildTinyState();
    const binding = { clanId: CLAN_ALPHA, castleId: CASTLE_A1, districtId: null };
    const quake = generic.find((def) => def.id === 'evt.gen-jishin')!;
    expect(
      buildEventModalVM(state, quake, binding, catalog, {
        presentation: { regionName: '猜測地區' },
      }),
    ).toEqual({ ok: false, reason: 'unsupported-presentation', token: 'regionName' });
    const epidemic = generic.find((def) => def.id === 'evt.gen-ekibyo')!;
    expect(buildEventModalVM(state, epidemic, binding, catalog)).toEqual({
      ok: false,
      reason: 'unsupported-presentation',
      token: 'districtName',
    });
  });
});
