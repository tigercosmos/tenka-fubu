import { useEffect, useRef } from 'react';
import { useM6View } from './useM6View';
import { uiStore } from './uiStore';
import { store } from '@app/store';
import { useStore } from 'zustand';

/** Queue persistent arrivals once; preserve the existing deferred-modal FIFO. */
export function useM6Dialogs(): void {
  const model = useM6View();
  const game = useStore(store, (state) => state.game);
  const pendingCount = useStore(store, (state) => state.session.pendingCommandCount);
  const queuedEnvoys = useRef(new Set<string>());
  const queuedProposals = useRef(new Set<string>());
  const previousGame = useRef(game);
  useEffect(() => {
    if (previousGame.current === game) return;
    previousGame.current = game;
    queuedEnvoys.current.clear();
    queuedProposals.current.clear();
    uiStore.getState().actions.clearQueuedDecisions();
  }, [game]);
  useEffect(() => {
    if (pendingCount === 0 && uiStore.getState().queuedDecisionIds.length > 0) {
      // A hard-rejected next-tick decision remains pending and must become reachable again.
      for (const id of uiStore.getState().queuedDecisionIds) {
        queuedEnvoys.current.delete(id);
        queuedProposals.current.delete(id);
      }
      uiStore.getState().actions.clearQueuedDecisions();
    }
  }, [pendingCount]);
  useEffect(() => {
    const liveEnvoys = new Set<string>(game?.diplomacy.pendingProposals.map((item) => item.id));
    const liveProposals = new Set<string>(
      Object.values(game?.proposals ?? {})
        .filter((item) => item.status === 'pending')
        .map((item) => item.id),
    );
    for (const id of queuedEnvoys.current) if (!liveEnvoys.has(id)) queuedEnvoys.current.delete(id);
    for (const id of queuedProposals.current)
      if (!liveProposals.has(id)) queuedProposals.current.delete(id);
    for (const envoy of model.envoys) {
      if (queuedEnvoys.current.has(envoy.id)) continue;
      queuedEnvoys.current.add(envoy.id);
      const state = uiStore.getState();
      if (
        state.modal?.params.proposalId === envoy.id ||
        state.modalQueue.some((modal) => modal.params.proposalId === envoy.id)
      )
        continue;
      state.actions.enqueueModal({
        id: 'envoy',
        params: { proposalId: envoy.id },
        pausesTime: true,
      });
    }
    const fresh = model.proposals.filter((proposal) => !queuedProposals.current.has(proposal.id));
    if (fresh.length === 0) return;
    for (const proposal of fresh) queuedProposals.current.add(proposal.id);
    const state = uiStore.getState();
    if (
      state.modal?.id !== 'proposalInbox' &&
      !state.modalQueue.some((modal) => modal.id === 'proposalInbox')
    )
      state.actions.enqueueModal({ id: 'proposalInbox', params: {}, pausesTime: true });
  }, [model, game]);
}
