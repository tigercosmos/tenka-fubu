import { selectM6View } from '@app/viewModels';
import { makeCachedSelector, useCachedGameSelector } from './useGameSelector';
import { useMemo } from 'react';
import { useUIStore } from './uiStore';
const cached = makeCachedSelector(selectM6View);
export function useM6View() {
  const model = useCachedGameSelector(cached);
  const queued = useUIStore((state) => state.queuedDecisionIds);
  return useMemo(
    () => ({
      ...model,
      officers: model.officers.filter(
        (item) => item.status !== 'captive' || !queued.includes(item.id),
      ),
      envoys: model.envoys.filter((item) => !queued.includes(item.id)),
      proposals: model.proposals.filter((item) => !queued.includes(item.id)),
    }),
    [model, queued],
  );
}
