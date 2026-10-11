import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { dispatchCommand, getQueuedPlayerCommands, type CommandDispatchResult } from '@app/bridge';
import { store } from '@app/store';
import { settingsStore } from '@app/settings/runtime';
import { validateCommand } from '@core/index';
import type { GameState } from '@core/state/gameState';
import type { ArmyId, CastleId, DistrictId } from '@core/state/ids';
import { uiStore, useUIStore } from './uiStore';

export interface KassenOffer {
  fieldCombatId: string;
  place: string;
  clans: string;
  troops: number;
  queued: boolean;
}

let nextOwner = 0;

/** FieldCombat is authoritative: available-event battleId is fc.*, not a tactical BattleId. */
function offersFor(game: GameState): KassenOffer[] {
  // Only one tactical battle may start; reserve that slot across ALL encounters.
  const queued = getQueuedPlayerCommands(game).some((cmd) => cmd.type === 'startKassen');
  return Object.values(game.fieldCombats)
    .sort((a, b) => a.startedDay - b.startedDay || a.id.localeCompare(b.id))
    .filter(
      (combat) =>
        validateCommand(game, {
          type: 'startKassen',
          clanId: game.meta.playerClanId,
          fieldCombatId: combat.id,
        }).ok,
    )
    .map((combat) => ({
      fieldCombatId: combat.id,
      place:
        game.castles[combat.nodeId as CastleId]?.name ??
        game.districts[combat.nodeId as DistrictId]?.name ??
        combat.nodeId,
      clans: [...combat.sideA.clanIds, ...combat.sideB.clanIds]
        .map((id) => game.clans[id]?.name ?? id)
        .join('、'),
      troops: [...combat.sideA.armyIds, ...combat.sideB.armyIds].reduce(
        (total, id) => total + (game.armies[id]?.soldiers ?? 0),
        0,
      ),
      queued,
    }));
}

/** Session-owned, dismissible FIFO offers. Declining does not discard the encounter. */
export function useKassenOffers() {
  const game = useStore(store, (state) => state.game);
  const tick = useStore(store, (state) => state.tickSeq);
  const pending = useStore(store, (state) => state.session.pendingCommandCount);
  const screen = useUIStore((state) => state.screen);
  const modal = useUIStore((state) => state.modal);
  const automatic = useStore(settingsStore, (state) => state.settings.autoPause.battle);
  const session = useMemo(
    () => ({ game, owner: `kassen-offer-${++nextOwner}`, seen: new Set<string>() }),
    [game],
  );
  const offers = useMemo(() => {
    // GameState mutates in place; both publication and pending queue revision invalidate reads.
    void tick;
    void pending;
    return game === null ? [] : offersFor(game);
  }, [game, tick, pending]);
  const isOwned = (value: typeof modal) =>
    value?.id === 'battlePrompt' && value.params.kassenOwner === session.owner;

  const openOffer = useCallback(
    (fieldCombatId: string): boolean => {
      if (
        game === null ||
        store.getState().game !== game ||
        uiStore.getState().screen !== 'main' ||
        game.meta.gameOver !== null ||
        store.getState().session.fatalError !== null ||
        store.getState().session.viewportBlocked
      )
        return false;
      const offer = offersFor(game).find((item) => item.fieldCombatId === fieldCombatId);
      if (offer === undefined || offer.queued) return false;
      const ui = uiStore.getState();
      if (
        [ui.modal, ...ui.modalQueue].some(
          (item) =>
            item?.id === 'battlePrompt' &&
            item.params.fieldCombatId === fieldCombatId &&
            item.params.kassenOwner === session.owner,
        )
      )
        return false;
      session.seen.add(fieldCombatId);
      ui.actions.enqueueModal({
        id: 'battlePrompt',
        params: {
          fieldCombatId,
          kassenOwner: session.owner,
        },
        pausesTime: true,
      });
      return true;
    },
    [game, session],
  );

  useEffect(() => {
    const current = uiStore.getState();
    const eligible = new Set(
      offers.filter((offer) => !offer.queued).map((offer) => offer.fieldCombatId),
    );
    const stale = (item: typeof modal) =>
      item?.id === 'battlePrompt' &&
      (item.params.kassenOwner !== session.owner || !eligible.has(item.params.fieldCombatId ?? ''));
    if (current.modalQueue.some(stale))
      uiStore.setState({ modalQueue: current.modalQueue.filter((item) => !stale(item)) });
    if (stale(uiStore.getState().modal)) {
      // A replaced game must not inherit the previous session's restoration claim.
      if (uiStore.getState().modal?.params.kassenOwner !== session.owner)
        uiStore.setState({ restoreSpeedOnQueueDrain: false });
      uiStore.getState().actions.closeModal();
    }
    if (game === null || screen !== 'main' || !automatic || game.meta.gameOver !== null) return;
    for (const offer of offers) {
      if (!offer.queued && !session.seen.has(offer.fieldCombatId)) openOffer(offer.fieldCombatId);
    }
    // The session set deliberately prevents Escape/decline from immediately re-opening an offer.
  }, [game, tick, pending, screen, automatic, session, offers, openOffer]);

  const declineOffer = (fieldCombatId: string): void => {
    const current = uiStore.getState().modal;
    if (
      store.getState().game === game &&
      isOwned(current) &&
      current?.params.fieldCombatId === fieldCombatId
    ) {
      session.seen.add(fieldCombatId);
      uiStore.getState().actions.closeModal();
    }
  };
  const acceptOffer = (fieldCombatId: string): CommandDispatchResult => {
    const current = uiStore.getState().modal;
    if (
      game === null ||
      store.getState().game !== game ||
      uiStore.getState().screen !== 'main' ||
      store.getState().session.viewportBlocked ||
      store.getState().session.fatalError !== null ||
      !isOwned(current) ||
      current?.params.fieldCombatId !== fieldCombatId ||
      offersFor(game).find((offer) => offer.fieldCombatId === fieldCombatId && !offer.queued) ===
        undefined
    )
      return { ok: false, reason: 'cmd.reject.invalidTarget' };
    const result = dispatchCommand({
      type: 'startKassen',
      clanId: game.meta.playerClanId,
      fieldCombatId,
    });
    if (result.ok) declineOffer(fieldCombatId);
    return result;
  };
  return {
    activeOffer: isOwned(modal)
      ? (offers.find((offer) => offer.fieldCombatId === modal?.params.fieldCombatId) ?? null)
      : null,
    openOffer,
    acceptOffer,
    declineOffer,
    manualEntry: (armyId: string): KassenOffer | null => {
      if (game === null || game.armies[armyId as ArmyId]?.clanId !== game.meta.playerClanId)
        return null;
      return (
        offers.find((offer) => {
          const combat = game.fieldCombats[offer.fieldCombatId];
          return (
            combat !== undefined &&
            [...combat.sideA.armyIds, ...combat.sideB.armyIds].includes(armyId as ArmyId)
          );
        }) ?? null
      );
    },
  };
}
