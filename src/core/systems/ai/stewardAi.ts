import { BAL } from '../../balance';
import type { District, GameState } from '../../state/gameState';
import type { DevelopFocus } from '../../state/enums';
import type { AiSink } from './types';

export function pickDevFocus(district: Readonly<District>): DevelopFocus {
  const candidates: readonly DevelopFocus[] =
    district.publicOrder < BAL.aiStewardSecurityFloor
      ? ['agri', 'commerce']
      : ['agri', 'commerce', 'barracks'];
  const values: Record<DevelopFocus, [number, number]> = {
    agri: [district.kokudaka, district.kokudakaCap],
    commerce: [district.commerce, district.commerceCap],
    barracks: [district.population, district.populationCap],
  };
  let best = candidates[0] ?? 'agri';
  let bestGap = -1;
  for (const focus of candidates) {
    const [current, cap] = values[focus];
    const gap = (cap - current) / Math.max(cap, 1);
    if (gap > bestGap) {
      best = focus;
      bestGap = gap;
    }
  }
  return best;
}

export function updateStewardFocuses(state: GameState, sink?: AiSink): void {
  for (const id of Object.keys(state.districts).sort()) {
    const district = state.districts[id as keyof typeof state.districts];
    if (!district || district.stewardId === null || !sink) continue;
    const officer = state.officers[district.stewardId];
    if (
      !officer?.hasComeOfAge ||
      officer.status !== 'serving' ||
      officer.clanId !== district.ownerClanId
    )
      continue;
    const command = {
      type: 'setDevelopFocus' as const,
      clanId: district.ownerClanId,
      districtId: district.id,
      focus: pickDevFocus(district),
    };
    if (command.focus === district.developFocus) {
      sink.record({
        day: state.time.day,
        clanId: district.ownerClanId,
        layer: 'steward',
        kind: 'develop.unchanged',
        detail: { districtId: district.id },
        scores: null,
        commands: [],
      });
      continue;
    }
    const result = sink.enqueue(command, {
      kind: 'steward',
      clanId: district.ownerClanId,
      officerId: officer.id,
      districtId: district.id,
    });
    sink.record({
      day: state.time.day,
      clanId: district.ownerClanId,
      layer: 'steward',
      kind: result.ok ? 'develop.focus' : 'error.invalidCommand',
      detail: { districtId: district.id },
      scores: null,
      commands: result.ok ? [command] : [],
    });
  }
}
