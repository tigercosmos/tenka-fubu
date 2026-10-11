import { describe, expect, it } from 'vitest';
import { MAPVIEW } from './mapViewConfig';
import { LABEL_STYLE } from './labelStyle';
import { NAMEPLATE_GEOMETRY, NAMEPLATE_STYLE } from './sceneParts/nameplateStyle';
import { TOKENS_NUM } from '@ui/styles/tokens';

describe('map presentation hierarchy', () => {
  it('keeps normal terrain readable and reserves stronger tint for ownership analysis', () => {
    expect(MAPVIEW.territoryAlpha).toBeLessThan(MAPVIEW.territoryAlphaFar);
    expect(MAPVIEW.territoryAlphaFar).toBeLessThan(MAPVIEW.territoryAlphaFaction);
    expect(MAPVIEW.territoryAlpha).toBeLessThan(0.4);
    expect(MAPVIEW.colors.borderInkMix).toBeLessThan(0.5);
  });

  it('subordinates geographic labels without reducing castle typography or hit areas', () => {
    expect(LABEL_STYLE.province.alpha).toBe(1);
    expect(LABEL_STYLE.province.fill).toBe(TOKENS_NUM.ink700);
    expect(LABEL_STYLE.province.haloW).toBe(1.5);
    expect(LABEL_STYLE.road.haloW).toBeLessThan(LABEL_STYLE.mainCastle.haloW);
    expect(NAMEPLATE_GEOMETRY.main.nameSize).toBe(15);
    expect(NAMEPLATE_GEOMETRY.branch.nameSize).toBe(13);
    expect(NAMEPLATE_STYLE.shadowAlpha).toBeLessThan(0.2);
    expect(MAPVIEW.hitMinCssRadius).toBe(16);
    expect(MAPVIEW.dragTapThresholdPx).toBe(4);
  });
});
