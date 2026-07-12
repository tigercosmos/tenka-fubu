import { BAL } from '../../balance';
import type { District, GameState } from '../../state/gameState';
import type { DevelopFocus } from '../../state/enums';

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

export function updateStewardFocuses(state: GameState): void {
  for (const id of Object.keys(state.districts).sort()) {
    const district = state.districts[id as keyof typeof state.districts];
    if (district?.stewardId !== null && district !== undefined)
      district.developFocus = pickDevFocus(district);
  }
}
