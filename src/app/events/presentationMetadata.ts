import { BAL } from '@core/balance';
import type { EventId } from '@core/state/ids';
import type { EventBinding } from '@core/systems/events/types';
import { t } from '@i18n/zh-TW';
import type { EventPresentationOptions } from './eventViewModel';

/** Explicit presentation metadata, not an interpretation of effect operations. */
export function getEventPresentationOptions(
  id: EventId,
  binding: Readonly<EventBinding>,
): EventPresentationOptions {
  return {
    presentation: {
      ...(id === 'evt.teppo-denrai' ? { cost: BAL.genTeppoCost } : {}),
      ...(binding.region != null ? { regionName: t(`term.region.${binding.region}`) } : {}),
    },
  };
}
