import { advanceBattleTick } from '../../src/core/systems/battle';
import { balanceHash, canonicalStringify, stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { buildBattleTranscriptInitialState, type BattleTranscriptFile } from './battleTranscript';

/** Test-only current execution recorder; never writes or replaces a frozen transcript. */
export function executeCurrentBattleTranscript(source: BattleTranscriptFile, reloadTick?: number) {
  const initial = buildBattleTranscriptInitialState(source.seed, source.initial.layoutId);
  let state = initial.state;
  const battleId = initial.battleId;
  const initialHash = stateHash(state);
  const initialLayout = canonicalStringify(state.battles[battleId]!.jins);
  const checkpoints: BattleTranscriptFile['checkpoints'] = [];
  const tickStates: string[] = [];
  for (let tick = 1; tick <= source.finalTick; tick++) {
    if (tick === reloadTick) {
      const decoded = decodeSave(encodeSave(state, 42));
      if (!decoded.ok) throw new Error(`native continuation rejected: ${decoded.code}`);
      state = decoded.saveFile.state;
    }
    const orders = source.entries
      .filter((entry) => entry.tick === tick)
      .map((entry) => structuredClone(entry.order));
    const result = advanceBattleTick(state, battleId, orders);
    const violations = validateState(state);
    if (violations.length) throw new Error(`tick${tick}: ${JSON.stringify(violations)}`);
    tickStates.push(canonicalStringify(state));
    if (source.checkpoints.some((checkpoint) => checkpoint.tick === tick))
      checkpoints.push({ tick, hash: stateHash(state) });
    if (result.resolved && tick !== source.finalTick)
      throw new Error(`unexpected early resolution: ${tick}`);
  }
  if (state.battles[battleId]!.result === null)
    throw new Error('current transcript did not resolve');
  const transcript: BattleTranscriptFile = {
    ...structuredClone(source),
    balanceHash: balanceHash(),
    initial: { ...source.initial, battleId, stateHash: initialHash },
    checkpoints,
    finalHash: stateHash(state),
  };
  return {
    transcript,
    tickStates,
    initialLayout,
    rng: structuredClone(state.rng),
    result: structuredClone(state.battles[battleId]!.result),
  };
}
