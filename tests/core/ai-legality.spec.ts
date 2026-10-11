import { describe, expect, it } from 'vitest';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { envelopeAuthority } from '../../src/core/commands/authority';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { validateState } from '../../src/core/state/invariants';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';
import { buildMiniState } from '../fixtures/mini';
import { buildFullState } from '../helpers/fullState';
import { S1560_LOADED_REGIONS } from '../../src/data/scenarios/s1560/meta';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';

describe('M7 A2 slow production-world AI command legality', () => {
  // Expands with the production loader. Until all nine regions exist this is partial-world evidence.
  it.each(['normal', 'hard'] as const)(
    'validates every autonomous command for12months in all loaded regions (%s)',
    async (difficulty) => {
      const state = await buildFullState({ allAi: true, difficulty });
      expect(state.ai.allAi).toBe(true);
      expect(state.meta.difficulty).toBe(difficulty);
      expect(new Set(Object.values(state.provinces).map(({ region }) => region))).toEqual(
        new Set(S1560_LOADED_REGIONS),
      );
      const engine = await loadScenarioEventEngine('s1560');
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      const initialDay = state.time.day;
      const actors = new Set<string>();
      let applied = 0;
      let monthStarts = 0;
      for (let day = 0; day < 360; day++) {
        enqueuePendingAiOrders(state, queue);
        const envelopes = queue.drain();
        const shadow = structuredClone(state);
        for (const envelope of envelopes) {
          const authority = envelopeAuthority(envelope);
          expect(
            validateCommand(shadow, envelope.command, authority, { eventEngine: engine }),
            `${difficulty} day${day} ${envelope.command.type}`,
          ).toEqual({ ok: true });
          applyCommand(shadow, envelope.command, () => {}, authority, { eventEngine: engine });
        }
        const result = advanceDay(state, envelopes, { eventEngine: engine });
        expect(result.events.filter(({ type }) => type === 'command.rejected')).toEqual([]);
        expect(state.ai.intentLog.filter(({ kind }) => kind === 'error.invalidCommand')).toEqual(
          [],
        );
        expect(validateState(state), `${difficulty} day${state.time.day}`).toEqual([]);
        expect(state.events.pendingChoiceEventId).toBeNull();
        expect(state.meta.gameOver).toBeNull();
        for (const { command } of result.appliedCommands) {
          applied++;
          if ('clanId' in command && typeof command.clanId === 'string') actors.add(command.clanId);
        }
        monthStarts += result.events.filter(({ type }) => type === 'time.monthStart').length;
      }
      expect(state.time.day - initialDay).toBe(360);
      expect(monthStarts).toBe(12);
      expect(applied).toBeGreaterThan(0);
      for (const clan of Object.values(state.clans))
        if (clan.alive) expect(actors.has(clan.id), `${clan.id} participates`).toBe(true);
    },
    30_000,
  );
});

describe('M7 A1 miniature AI command legality', () => {
  it('runs a declared-war four-castle all-AI miniature for24months through genuine marches and sieges', () => {
    const state = buildMiniState({ allAi: true });
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).lastHostileDay = state.time.day;
    for (const clan of Object.values(state.clans)) clan.gold = 20000;
    for (const castle of Object.values(state.castles)) castle.food = 20000;
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const actors = new Set<string>(),
      events = new Map<string, number>();
    let marches = 0;
    const start = state.time.day;
    for (let day = 0; day < 720; day++) {
      for (const order of state.ai.pendingOrders.splice(0))
        queue.enqueue(order.command, state.time.day, order.authority);
      const envelopes = queue.drain(),
        shadow = structuredClone(state);
      for (const envelope of envelopes) {
        const authority = envelopeAuthority(envelope);
        expect(
          validateCommand(shadow, envelope.command, authority),
          `war prospect day${day}`,
        ).toEqual({ ok: true });
        applyCommand(shadow, envelope.command, () => {}, authority);
      }
      const result = advanceDay(state, envelopes);
      expect(
        result.events.filter((event) => event.type === 'command.rejected'),
        `war hardreject day${day}`,
      ).toEqual([]);
      expect(
        state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand'),
        `war sinkreject day${day}`,
      ).toEqual([]);
      expect(validateState(state), `war invariants day${day}`).toEqual([]);
      expect(state.meta.gameOver).toBeNull();
      for (const envelope of result.appliedCommands) {
        actors.add(envelope.command.clanId);
        if (envelope.command.type === 'march') marches++;
      }
      for (const event of result.events) events.set(event.type, (events.get(event.type) ?? 0) + 1);
    }
    expect(state.time.day - start).toBe(720);
    expect(actors).toEqual(new Set([CLAN_ALPHA, CLAN_BETA]));
    expect(marches).toBeGreaterThanOrEqual(2);
    for (const type of [
      'army.departed',
      'army.arrived',
      'siege.started',
      'siege.ended',
      'district.subjugated',
    ])
      expect(events.get(type) ?? 0, type).toBeGreaterThan(0);
    expect(events.get('time.monthStart')).toBe(24);
  });
  it.each(['normal', 'hard'] as const)(
    'queues both clans for24months with zero sink or next-tick rejections (%s)',
    (difficulty) => {
      const state = buildTinyState();
      state.ai.allAi = true;
      state.meta.difficulty = difficulty;
      // This long-running two-clan fixture is initially allied: victory must not truncate the24-month workload.
      ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
        kind: 'alliance',
        startDay: state.time.day,
        endDay: state.time.day + 720,
        vassalClanId: null,
      });
      for (const clan of Object.values(state.clans)) clan.gold = 20000;
      for (const castle of Object.values(state.castles)) castle.food = 20000;
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1),
        kinds = new Set<string>(),
        actors = new Set<string>();
      const initialDay = state.time.day;
      let applied = 0;
      for (let day = 0; day < 720; day++) {
        for (const order of state.ai.pendingOrders.splice(0))
          queue.enqueue(order.command, state.time.day, order.authority);
        const envelopes = queue.drain(),
          shadow = structuredClone(state);
        for (const envelope of envelopes) {
          const authority = envelopeAuthority(envelope),
            result = validateCommand(shadow, envelope.command, authority);
          expect(result, `prospectivehardvalidation day${day} ${envelope.command.type}`).toEqual({
            ok: true,
          });
          applyCommand(shadow, envelope.command, () => {}, authority);
        }
        const result = advanceDay(state, envelopes);
        expect(
          result.events.filter((event) => event.type === 'command.rejected'),
          `hardreject day${day}`,
        ).toEqual([]);
        expect(
          state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand'),
          `sinkreject day${day}`,
        ).toEqual([]);
        expect(validateState(state), `invariants day${day}`).toEqual([]);
        expect(state.meta.gameOver, `unexpectedterminalday${day}`).toBeNull();
        for (const envelope of result.appliedCommands) {
          applied++;
          kinds.add(envelope.command.type);
          actors.add(envelope.command.clanId);
        }
      }
      expect(state.time.day - initialDay).toBe(720);
      expect(applied).toBeGreaterThanOrEqual(24);
      expect(actors).toEqual(new Set([CLAN_ALPHA, CLAN_BETA]));
      expect(kinds.size).toBeGreaterThanOrEqual(3);
    },
  );
});
