import type { GameState } from '../../state/gameState';
import type { AiSink } from './types';
import { updateStewardFocuses } from './stewardAi';
import { runDomesticCouncil } from './council';
import { validateCommand } from '../../commands/validate';
import type { Command } from '../../commands/types';
import type { ExecutionAuthority } from '../../commands/authority';

/** Monthly only; direct player districts have no 'auto' field in canonical 02 and stay untouched. */
export function runDelegation(state: GameState, sink: AiSink): void {
  if (state.time.dayOfMonth !== 1) return;
  updateStewardFocuses(state, sink);
  const clanId = state.meta.playerClanId;
  const castles = Object.values(state.castles).filter((castle) => {
    const lord = castle.lordId === null ? undefined : state.officers[castle.lordId];
    return (
      castle.ownerClanId === clanId &&
      !castle.directControl &&
      castle.corpsId === null &&
      lord?.hasComeOfAge &&
      lord.status === 'serving' &&
      lord.clanId === clanId
    );
  });
  if (!castles.length) return;
  const route = (command: Command, authority: ExecutionAuthority): ExecutionAuthority => {
    const castleId =
      command.type === 'transport'
        ? command.toCastleId
        : command.type === 'setDevelopFocus'
          ? state.districts[command.districtId]?.castleId
          : 'castleId' in command
            ? command.castleId
            : null;
    return castleId ? { kind: 'castle', clanId, castleId } : authority;
  };
  const routed: AiSink = {
    record: (intent) => sink.record({ ...intent, layer: 'castle' }),
    canEnqueue(command, authority) {
      const context = route(command, authority);
      return sink.canEnqueue?.(command, context) ?? validateCommand(state, command, context);
    },
    enqueue(command, authority) {
      return sink.enqueue(command, route(command, authority));
    },
  };
  runDomesticCouncil(
    state,
    { clanId, corpsId: null, castleIds: castles.map((c) => c.id), targetNodeId: null },
    routed,
    {
      rewards: false,
      policies: false,
      authority: { kind: 'castle', clanId, castleId: castles[0]!.id },
    },
  );
}
