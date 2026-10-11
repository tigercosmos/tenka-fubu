import { describe, expect, it } from 'vitest';
import { TOKENS_NUM } from '../styles/tokens';
import { LABEL_STYLE, labelTextStyle, sharedLabelTextStyle } from './labelStyle';

describe('restrained geographic ink and parchment labels', () => {
  it('keeps each actual ink/halo pair above normal text contrast without opacity tricks', () => {
    const luminance = (color: number) => {
      const channels = [16, 8, 0].map((shift) => {
        const s = ((color >> shift) & 255) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    for (const spec of [LABEL_STYLE.province, LABEL_STYLE.district, LABEL_STYLE.road]) {
      expect((luminance(spec.halo) + 0.05) / (luminance(spec.fill) + 0.05)).toBeGreaterThan(4.5);
      expect(spec.alpha).toBe(1);
      expect(spec.size).toBeGreaterThanOrEqual(12);
    }
  });
  it.each([
    [LABEL_STYLE.province, TOKENS_NUM.ink700, TOKENS_NUM.washi300, 1.5],
    [LABEL_STYLE.district, TOKENS_NUM.ink900, TOKENS_NUM.washi200, 1.5],
    [LABEL_STYLE.road, TOKENS_NUM.ink900, TOKENS_NUM.washi300, 1.5],
  ] as const)(
    'produces role-specific ink with thin warm outlines %#',
    (spec, fill, halo, width) => {
      const style = sharedLabelTextStyle(spec);
      expect(style.fill).toBe(fill);
      expect(style.stroke).toMatchObject({
        color: halo,
        width,
        join: 'round',
      });
      expect(spec.alpha).toBe(1);
    },
  );
  it('retains subordinate province hierarchy without weakening its ink/halo definition', () => {
    expect(LABEL_STYLE.province.alpha).toBe(1);
    expect(labelTextStyle(LABEL_STYLE.province)).toMatchObject({
      fill: TOKENS_NUM.ink700,
      stroke: { color: TOKENS_NUM.washi300, width: 1.5, join: 'round' },
    });
    expect(LABEL_STYLE.province).toMatchObject({ size: 18, letterSpacing: 2 });
    expect(LABEL_STYLE.district).toMatchObject({ size: 12, gap: 14 });
    expect(LABEL_STYLE.road.size).toBe(12);
  });
  it('uses stable actual shared TextStyle identities and preserves unrelated castle styles', () => {
    for (const spec of [LABEL_STYLE.province, LABEL_STYLE.district, LABEL_STYLE.road]) {
      const style = sharedLabelTextStyle(spec);
      expect(style).toBe(sharedLabelTextStyle({ ...spec }));
      expect(style.fill).toBe(spec.fill);
      expect(style.fontSize).toBe(spec.size);
    }
    expect(LABEL_STYLE.mainCastle).toEqual({
      size: 15,
      fill: TOKENS_NUM.ink900,
      halo: TOKENS_NUM.washi100,
      haloW: 3,
      gap: 20,
    });
    expect(LABEL_STYLE.branchCastle).toEqual({
      size: 13,
      fill: TOKENS_NUM.ink900,
      halo: TOKENS_NUM.washi100,
      haloW: 3,
      gap: 16,
    });
  });
});
