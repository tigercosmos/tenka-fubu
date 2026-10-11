import { describe, expect, it } from 'vitest';
import type { ClanId } from '../../src/core/state/ids';
import { clanKamonSpec, clanShortName } from '../../src/ui/reports/clanKamon';
import { clanColorHex } from '../../src/ui/styles/tokens';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

describe('scenario-independent clan crest presentation', () => {
  it('removes display suffixes without truncating or guessing a clan identity', () => {
    expect(clanShortName('足利將軍家')).toBe('足利');
    expect(clanShortName('織田家')).toBe('織田');
    expect(clanShortName('長い表示名稱')).toBe('長い表示名稱');
  });
  it('uses a generic ring and actual clan color without guessing historical assignments or mutating state', () => {
    const game = buildTinyState();
    const before = structuredClone(game);
    expect(clanKamonSpec(game, CLAN_ALPHA)).toEqual({
      shape: 'ring',
      fg: '#EDE4D3',
      bg: clanColorHex(game.clans[CLAN_ALPHA]!.colorIndex),
    });
    expect(game).toEqual(before);
  });
  it('prefers an explicit presentation spec, but never invents a missing clan', () => {
    const game = buildTinyState();
    const spec = { shape: 'petal5', fg: '#EDE4D3', bg: '#123456' } as const;
    expect(clanKamonSpec(game, CLAN_ALPHA, spec)).toBe(spec);
    expect(clanKamonSpec(game, 'clan.absent' as ClanId, spec)).toBeNull();
  });
});
