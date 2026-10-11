import type { GameSettings } from '@app/settings';
import type { LodStage } from './lod';

export type MapPresentationSettings = Pick<GameSettings, 'mapLabelDensity' | 'effectsEnabled'> & {
  /** Runtime OS preference, not persisted gameplay or settings data. */
  reducedMotion?: boolean;
};

export function mapMotionReduced(settings: MapPresentationSettings): boolean {
  return settings.reducedMotion === true || !settings.effectsEnabled;
}

/** Density affects labels only; camera scale, map nodes, hit targets and military LOD stay fixed. */
export function labelStageForDensity(
  stage: LodStage,
  density: GameSettings['mapLabelDensity'],
): LodStage {
  if (density !== 'high') return stage;
  return stage === 'far' ? 'mid' : 'near';
}

export function allowsSecondaryLabels(density: GameSettings['mapLabelDensity']): boolean {
  return density !== 'low';
}
