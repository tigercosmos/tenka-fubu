import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ClanId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../../ui/components';
import { EventModal } from '../../ui/screens/EventModal';
import { store } from '../store';
import { getSessionEventEngine, resolvePendingEventChoice } from '../bridge';
import { buildPendingEventModalVM, type EventPresentationOptions } from './eventViewModel';
import { getEventPresentationOptions } from './presentationMetadata';
import { useUIStore } from '../../ui/hooks/uiStore';
import {
  acknowledgeEventPresentation,
  getEventPresentationSnapshot,
  subscribeEventPresentations,
} from './eventPresentationQueue';

export interface EventModalHostProps {
  enabled: boolean;
  animateText: boolean;
  onExportCurrent: () => void | Promise<void>;
  presentation?: EventPresentationOptions;
  renderMon?: (clanId: ClanId) => ReactNode;
}

/** App-only presentation: accepted decisions still run through the canonical command queue. */
export function EventModalHost({
  enabled,
  animateText,
  onExportCurrent,
  presentation,
  renderMon,
}: EventModalHostProps) {
  // Session initialization publishes store state even when the day and game identity are unchanged.
  const snapshot = useStore(store);
  const game = snapshot.game;
  const eventId = game?.events.pendingChoiceEventId ?? null;
  const modal = useUIStore((state) => state.modal);
  const presentations = useSyncExternalStore(
    subscribeEventPresentations,
    getEventPresentationSnapshot,
    getEventPresentationSnapshot,
  );
  const queued =
    modal?.id === 'event'
      ? presentations.find((entry) => String(entry.id) === modal.params.presentationId)
      : undefined;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setError(null);
    setBusy(false);
  }, [game, eventId, queued?.id]);
  if (!enabled || game === null || game.meta.gameOver !== null) return null;
  const metadata =
    eventId === null
      ? {}
      : getEventPresentationOptions(
          eventId,
          game.events.pendingChoiceBinding ?? { clanId: null, castleId: null, districtId: null },
        );
  const options: EventPresentationOptions = {
    ...metadata,
    ...presentation,
    presentation: { ...metadata.presentation, ...presentation?.presentation },
  };
  const mandatory = queued?.kind === 'pending' && queued.eventId === eventId;
  const result = mandatory
    ? buildPendingEventModalVM(game, getSessionEventEngine(), options)
    : queued?.kind === 'resolved'
      ? queued.result
      : null;
  if (result === null) return null;
  const continuePresentation = () => {
    if (!mandatory && queued) acknowledgeEventPresentation(queued.id);
  };
  if (!result.ok) {
    return (
      <Dialog
        open
        title={t('ui.event.unavailableTitle')}
        dismissible={!mandatory}
        closeOnBackdrop={!mandatory}
        onClose={continuePresentation}
        focusScopeKey={eventId ?? `presentation:${queued?.id}`}
        footer={
          <>
            <button
              type="button"
              onClick={() =>
                void Promise.resolve()
                  .then(onExportCurrent)
                  .catch(() => {})
              }
            >
              {t('ui.save.exportCurrent')}
            </button>
            {!mandatory && (
              <button type="button" data-dialog-primary="true" onClick={continuePresentation}>
                {t('ui.event.continue')}
              </button>
            )}
          </>
        }
      >
        <div role="alert" data-testid="event-unavailable">
          {t('ui.event.unavailableMessage')}
        </div>
      </Dialog>
    );
  }
  const vm = result.vm;
  return (
    <EventModal
      key={`${vm.eventId}:${mandatory ? 'pending' : queued?.id}`}
      vm={vm}
      busy={busy}
      error={error}
      animateText={animateText}
      {...(renderMon ? { renderMon } : {})}
      onContinue={continuePresentation}
      onChoice={async (choiceIndex) => {
        const operation = ++generation.current;
        setBusy(true);
        setError(null);
        try {
          const verdict = await resolvePendingEventChoice({
            type: 'resolveEventChoice',
            clanId: game.meta.playerClanId,
            eventId: vm.eventId,
            choiceIndex,
          });
          if (
            generation.current === operation &&
            store.getState().game === game &&
            game.events.pendingChoiceEventId === vm.eventId &&
            !verdict.ok
          )
            setError(t(verdict.reason, verdict.params));
        } finally {
          if (generation.current === operation) setBusy(false);
        }
      }}
    />
  );
}
