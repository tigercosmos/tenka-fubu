import type { GameState } from '@core/state/gameState';
import type { ClanId } from '@core/state/ids';
import type { KamonSpec } from '../components/KamonIcon';
import { clanColorHex } from '../styles/tokens';

/** Display suffixes only; this does not assign clan identity or historical crests. */
export function clanShortName(name: string): string {
  return name.replace(/(?:將軍)?家$/u, '');
}

/** Presentation only: missing scenario assignments use the canonical generic ring. */
export function clanKamonSpec(
  game: GameState,
  clanId: ClanId,
  supplied?: KamonSpec,
): KamonSpec | null {
  const clan = game.clans[clanId];
  if (!clan) return null;
  return supplied ?? { shape: 'ring', fg: '#EDE4D3', bg: clanColorHex(clan.colorIndex) };
}
