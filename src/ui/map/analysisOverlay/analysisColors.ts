import { TOKENS_NUM } from '@ui/styles/tokens';
import { MAPVIEW } from '../mapViewConfig';

/** Shared presentation colors; this module has no Pixi dependency. */
export const ANALYSIS_COLORS = {
  healthy: TOKENS_NUM.accentMoss,
  low: TOKENS_NUM.accentGold,
  critical: TOKENS_NUM.accentVermilion,
  sea: TOKENS_NUM.accentIndigo,
  plain: TOKENS_NUM.accentGold,
  mountain: TOKENS_NUM.accentMoss,
  neutral: MAPVIEW.colors.neutral,
} as const;
