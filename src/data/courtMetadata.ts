import type { CastleId, ClanId } from '../core/state/ids';

export interface CourtMetadata {
  capitalCastleId: CastleId;
  shogunClanId: ClanId;
}
const COURTS: Readonly<Record<string, CourtMetadata>> = {
  s1560: { capitalCastleId: 'castle.nijo' as CastleId, shogunClanId: 'clan.ashikaga' as ClanId },
};
export function getCourtMetadata(scenarioId: string): CourtMetadata | null {
  return COURTS[scenarioId] ?? null;
}
