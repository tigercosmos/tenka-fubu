import { t } from '@i18n/zh-TW';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import type { CastleId } from '@core/state/ids';
import { REJECT_REASONS } from '@core/commands/reasons';
import { useM6View } from '../hooks/useM6View';
import { useUIStore } from '../hooks/uiStore';
import { M6Panel } from './M6Panel';
import styles from './RecruitPanel.module.css';

export function RecruitPanel({ castleId }: { castleId?: CastleId }) {
  const game = useStore(store, (state) => state.game);
  const model = useM6View();
  const actions = useUIStore((state) => state.actions);
  const panel = useUIStore((state) => state.panelStack.find((item) => item.id === 'ronin'));
  const castle = castleId === undefined ? undefined : game?.castles[castleId];
  const owner = useMemo(() => ({ game, castleId, castle, panel }), [game, castleId, castle, panel]);
  const activeOwner = useRef<typeof owner | null>(null);
  useLayoutEffect(() => {
    activeOwner.current = owner;
    return () => {
      if (activeOwner.current === owner) activeOwner.current = null;
    };
  }, [owner]);
  const ownsScope = () => {
    const current = store.getState();
    return (
      activeOwner.current === owner &&
      game !== null &&
      current.game === game &&
      useUIStore.getState().panelStack.find((item) => item.id === 'ronin') === panel &&
      current.session.screen === 'main' &&
      current.session.fatalError === null &&
      useUIStore.getState().modal === null &&
      document.querySelector('[data-ui-dialog]') === null &&
      !current.session.viewportBlocked &&
      game.meta.gameOver === null &&
      (castleId === undefined ||
        (game.castles[castleId] === castle && castle?.ownerClanId === game.meta.playerClanId))
    );
  };
  const officers = model.officers.filter((officer) =>
    castleId === undefined
      ? officer.status === 'ronin' ||
        (officer.status === 'captive' && officer.capturedByClanId === model.playerClanId)
      : castle?.ownerClanId === model.playerClanId &&
        officer.status === 'ronin' &&
        officer.locationCastleId === castleId,
  );
  const unavailable =
    castleId === undefined
      ? null
      : castle === undefined
        ? REJECT_REASONS.invalidTarget
        : castle.ownerClanId !== model.playerClanId
          ? REJECT_REASONS.notOwner
          : null;
  return (
    <div className={styles.anchor}>
      <M6Panel
        title={t(castleId === undefined ? 'ui.recruit.title' : 'ui.castle.roninTitle')}
        testId="recruit-panel"
        onClose={() => {
          if (
            activeOwner.current !== owner ||
            store.getState().game !== game ||
            useUIStore.getState().panelStack.find((item) => item.id === 'ronin') !== panel
          )
            return;
          activeOwner.current = null;
          actions.closePanelById('ronin');
        }}
      >
        <div className={styles.list}>
          {unavailable !== null ? (
            <p role="alert">{t(unavailable)}</p>
          ) : (
            officers.length === 0 && (
              <p>{t(castleId === undefined ? 'ui.common.noData' : 'ui.castle.roninEmpty')}</p>
            )
          )}
          {officers.map((officer) => {
            const source = game?.officers[officer.id];
            return (
              <button
                type="button"
                key={officer.id}
                className={styles.card}
                onClick={() => {
                  if (
                    !ownsScope() ||
                    source === undefined ||
                    game?.officers[officer.id] !== source ||
                    !source.hasComeOfAge ||
                    source.status !== officer.status ||
                    source.locationCastleId !== officer.locationCastleId ||
                    (castleId !== undefined &&
                      (source.status !== 'ronin' || source.locationCastleId !== castleId)) ||
                    (source.status === 'captive' && source.capturedByClanId !== model.playerClanId)
                  )
                    return;
                  if (officer.status === 'captive')
                    actions.enqueueModal({
                      id: 'captive',
                      params: { officerId: officer.id },
                      pausesTime: true,
                    });
                  else actions.openPanel('officerDetail', { officerId: officer.id });
                }}
              >
                <span className={styles.name}>{officer.name}</span>
                {' · '}
                <span className={styles.status}>
                  {t(officer.status === 'captive' ? 'ui.captive.title' : 'ui.recruit.ronin')}
                </span>
                {' · '}
                <span className={styles.location}>
                  {model.castles.find((castle) => castle.id === officer.locationCastleId)?.name ??
                    t('ui.common.noData')}
                </span>
              </button>
            );
          })}
        </div>
      </M6Panel>
    </div>
  );
}
