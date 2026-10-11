import { describe, expect, it } from 'vitest';
import { buildNewGameState, loadScenario } from '../../src/app/boot';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import { advanceDay } from '../../src/core/systems';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { canonicalStringify, stateHash } from '../../src/core/state/serialize';
import type { GameState } from '../../src/core/state/gameState';
import { validateState } from '../../src/core/state/invariants';
import type { ClanId, EventId, OfficerId } from '../../src/core/state/ids';

// 02 §3.4: diagnostic intentLog is transient and deliberately absent from saves.
const persistentState = (state: GameState) =>
  canonicalStringify({ ...state, ai: { ...state.ai, intentLog: [] } });

describe('eastern historical events on the actual production trajectory', () => {
  for (const player of ['clan.takeda', 'clan.nagao']) {
    it(`${player} reaches Kawanakajima and restores its genuine pending choice`, async () => {
      const state = buildNewGameState(await loadScenario('s1560'), {
        playerClanId: player as ClanId,
        difficulty: 'normal',
        seed: 42,
      });
      const engine = await loadScenarioEventEngine('s1560');
      const queue = new CommandQueue();
      const eventId = 'evt.kawanakajima4' as EventId;
      let ticks = 0;
      while (state.events.pendingChoiceEventId !== eventId && ticks < 660) {
        const pending = state.events.pendingChoiceEventId;
        if (pending !== null)
          queue.enqueue(
            {
              type: 'resolveEventChoice',
              clanId: state.meta.playerClanId,
              eventId: pending,
              choiceIndex: 0,
            },
            state.time.day,
          );
        enqueuePendingAiOrders(state, queue);
        const result = advanceDay(state, queue.drain(), { eventEngine: engine });
        expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
        expect(validateState(state), `day ${state.time.day}`).toEqual([]);
        expect(state.meta.gameOver).toBeNull();
        ticks++;
      }
      expect(state.events.pendingChoiceEventId).toBe(eventId);
      expect(state.time).toMatchObject({ year: 1561, month: 9, dayOfMonth: 1 });
      expect(state.events.pendingChoiceBinding?.clanId).toBe(player);
      expect(state.officers['off.nagao-kagetora' as OfficerId]!.name).toBe('上杉謙信');
      const choice = {
        type: 'resolveEventChoice' as const,
        clanId: state.meta.playerClanId,
        eventId,
        choiceIndex: 0,
      };
      expect(engine.validateChoice(state, choice)).toEqual({ ok: true });
      const decoded = decodeSave(encodeSave(state, 0, [choice]));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(`Eastern pending save rejected: ${decoded.code}`);
      const restored = decoded.saveFile.state;
      expect(persistentState(restored)).toBe(persistentState(state));
      expect(stateHash(restored)).toBe(stateHash(state));
      expect(decoded.saveFile.pendingCommands).toEqual([choice]);
      const restoredEngine = await loadScenarioEventEngine('s1560');
      for (const [current, runtime] of [
        [state, engine],
        [restored, restoredEngine],
      ] as const) {
        const commands = new CommandQueue(current.meta.lastAppliedCmdSeq + 1);
        commands.enqueue(choice, current.time.day);
        enqueuePendingAiOrders(current, commands);
        const result = advanceDay(current, commands.drain(), { eventEngine: runtime });
        expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
        expect(current.events.pendingChoiceEventId).toBeNull();
        for (const id of ['off.takeda-nobushige', 'off.yamamoto-kansuke'])
          expect(current.officers[id as OfficerId]!.status).toBe('dead');
        expect(validateState(current)).toEqual([]);
      }
      expect(persistentState(restored)).toBe(persistentState(state));
      expect(stateHash(restored)).toBe(stateHash(state));
    }, 30_000);
  }
});
