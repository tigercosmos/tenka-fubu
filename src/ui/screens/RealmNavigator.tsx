import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import type { GameState } from '@core/state/gameState';
import type { ArmyId } from '@core/state/ids';
import { selectMapStaticModel, selectMapViewModel } from '@core/state/selectors';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../components';
import { uiStore, type ModalInstance, type Selection, type MarchDraft } from '../hooks/uiStore';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import { armyWorldPos } from '../map/dirty';
import { mapHoverLines } from '../map/mapHoverContent';
import styles from './RealmNavigator.module.css';

const selectRows = makeCachedSelector((game) => {
  const model = selectMapViewModel(game);
  return [
    ...model.castles.map((c) => ({
      kind: 'castle' as const,
      id: c.id,
      name: game.castles[c.id]!.name,
    })),
    ...model.districts.map((d) => ({
      kind: 'district' as const,
      id: d.id,
      name: game.districts[d.id]!.name,
    })),
    ...model.armies.map((a) => ({
      kind: 'army' as const,
      id: a.id,
      name: game.officers[game.armies[a.id as ArmyId]!.leaderId]?.name ?? a.id,
    })),
  ].map((row) => ({ ...row, lines: [...(mapHoverLines(game, row.kind, row.id) ?? [])] }));
});
type Row = ReturnType<typeof selectRows>[number];
const pageSize = 20;
const identities = new WeakMap<object, number>();
let nextIdentity = 0;
function sessionId(game: GameState) {
  let id = identities.get(game);
  if (id === undefined) identities.set(game, (id = ++nextIdentity));
  return id;
}
export interface MarchTargetNavigation {
  draft: MarchDraft;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** DOM alternative to current map subjects; no command dispatch or extra intelligence. */
export function RealmNavigator({
  modal,
  onFocus,
  target,
}: {
  modal: ModalInstance;
  onFocus: (pos: { x: number; y: number }, game: GameState) => void;
  target?: MarchTargetNavigation;
}) {
  const game = useStore(store, (s) => s.game);
  if (game === null) return null;
  return (
    <OwnedNavigator
      key={`${sessionId(game)}:${modal.params.token}`}
      game={game}
      modal={modal}
      onFocus={onFocus}
      {...(target ? { target } : {})}
    />
  );
}
function OwnedNavigator({
  game,
  modal,
  onFocus,
  target,
}: {
  game: GameState;
  modal: ModalInstance;
  onFocus: (pos: { x: number; y: number }, game: GameState) => void;
  target?: MarchTargetNavigation;
}) {
  const rows = useCachedGameSelector(selectRows);
  const [search, setSearch] = useState(''),
    [kind, setKind] = useState('all'),
    [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0),
    [invalid, setInvalid] = useState(false);
  const body = useRef<HTMLDivElement>(null),
    searchInput = useRef<HTMLInputElement>(null);
  const flush = useRef<() => void>(() => {}),
    life = useRef(0);
  const sameGeneration = useCallback((generation: number) => life.current === generation, []);
  const owner = useMemo(
    () => ({
      game,
      modal,
      clanId: game.meta.playerClanId,
      revision,
      signature: JSON.stringify(modal),
      revoked: false,
      draft: target?.draft,
      closeTarget: target?.onClose,
    }),
    [game, modal, revision, target?.draft, target?.onClose],
  );
  const active = useRef<typeof owner | null>(null);
  const selectedOwner = useRef<typeof owner | null>(null);
  const validSession = useCallback(() => {
    const current = store.getState();
    return (
      current.game === game &&
      game.meta.playerClanId === owner.clanId &&
      current.session.screen === 'main' &&
      !current.session.fatalError &&
      !current.session.viewportBlocked &&
      uiStore.getState().modal === modal &&
      JSON.stringify(modal) === owner.signature &&
      (owner.draft === undefined || uiStore.getState().marchDraft === owner.draft)
    );
  }, [game, modal, owner.signature, owner.clanId, owner.draft]);
  useLayoutEffect(() => {
    const generation = ++life.current;
    if (owner.revoked) {
      setRevision((v) => v + 1);
      return;
    }
    active.current = owner;
    const revoke = () => {
      if (owner.revoked) return;
      owner.revoked = true;
      setInvalid(true);
      owner.closeTarget?.();
      if (owner.draft === undefined)
        uiStore.getState().actions.closeOwnedModal(modal, { resume: false, expectedGame: game });
    };
    const check = () => {
      if (!validSession()) revoke();
    };
    const unsubGame = store.subscribe(check),
      unsubUI = uiStore.subscribe(check);
    const native = body.current?.closest('[data-ui-dialog]');
    const inspect = (records: MutationRecord[]) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const dialogs = [
            ...(node.matches('[data-ui-dialog]') ? [node] : []),
            ...node.querySelectorAll('[data-ui-dialog]'),
          ];
          if (dialogs.some((d) => d !== native)) revoke();
        }
        for (const node of record.removedNodes)
          if (native && (node === native || (node instanceof Element && node.contains(native))))
            revoke();
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    flush.current = () => inspect(observer.takeRecords());
    return () => {
      unsubGame();
      unsubUI();
      observer.disconnect();
      owner.revoked = true;
      if (active.current === owner) active.current = null;
      flush.current = () => {};
      queueMicrotask(() => {
        if (sameGeneration(generation)) owner.closeTarget?.();
        if (sameGeneration(generation) && owner.draft === undefined)
          uiStore.getState().actions.closeOwnedModal(modal, { resume: false, expectedGame: game });
      });
    };
  }, [owner, game, modal, validSession, sameGeneration]);
  const owns = () => {
    flush.current();
    const native = body.current?.closest('[data-ui-dialog]');
    return (
      !owner.revoked &&
      active.current === owner &&
      validSession() &&
      native !== undefined &&
      native !== null &&
      document
        .querySelectorAll('[data-ui-dialog]')
        .item(document.querySelectorAll('[data-ui-dialog]').length - 1) === native
    );
  };
  const close = () => {
    if (!owns()) return;
    if (target) target.onClose();
    else uiStore.getState().actions.closeOwnedModal(modal, { expectedGame: game });
  };
  const subjects = rows.map((row) =>
    row.kind === 'castle'
      ? game.castles[row.id]
      : row.kind === 'district'
        ? game.districts[row.id]
        : game.armies[row.id as ArmyId],
  );
  const select = (row: Row) => {
    if (!owns() || selectedOwner.current === owner) return;
    const index = rows.indexOf(row),
      subject = subjects[index];
    const current =
      row.kind === 'castle'
        ? game.castles[row.id]
        : row.kind === 'district'
          ? game.districts[row.id]
          : game.armies[row.id as ArmyId];
    if (!subject || current !== subject) return;
    const ownsRow = () =>
      owns() &&
      (row.kind === 'castle'
        ? game.castles[row.id]
        : row.kind === 'district'
          ? game.districts[row.id]
          : game.armies[row.id as ArmyId]) === subject;
    const map = selectMapViewModel(game),
      graph = selectMapStaticModel(game).graph;
    const projected = map.armies.find((a) => a.id === row.id);
    const position =
      row.kind === 'army'
        ? projected
          ? armyWorldPos(projected, graph)
          : null
        : graph.nodes.get(row.id)?.pos;
    const available =
      row.kind === 'castle'
        ? map.castles.some((c) => c.id === row.id)
        : row.kind === 'district'
          ? map.districts.some((d) => d.id === row.id)
          : projected !== undefined;
    if (!available || !position) return;
    selectedOwner.current = owner;
    if (target) {
      if (row.kind !== 'army') target.onPick(row.id);
      return;
    }
    const selection: Selection = { kind: row.kind, id: row.id };
    store.getState().actions.select(selection);
    if (!ownsRow()) return;
    uiStore.getState().actions.setSelection(selection);
    if (!ownsRow()) return;
    onFocus(position, game);
    if (ownsRow()) close();
  };
  const needle = search.trim().toLocaleLowerCase();
  const filtered = rows.filter(
    (row) =>
      (kind === 'all' || kind === row.kind) &&
      (!target || row.kind !== 'army') &&
      [row.name, ...row.lines].join(' ').toLocaleLowerCase().includes(needle),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    currentPage = Math.min(page, pages - 1);
  return (
    <Dialog
      open={!invalid && uiStore.getState().modal === modal}
      title={t('ui.realm.title')}
      size="lg"
      onClose={close}
      initialFocusRef={searchInput}
    >
      <div ref={body} className={styles.body} data-testid="realm-navigator">
        {target && <p>{t('ui.march.pickTarget')}</p>}
        <div className={styles.filters}>
          <label>
            {t('ui.realm.search')}
            <input
              ref={searchInput}
              type="search"
              value={search}
              onChange={(e) => {
                if (owns()) {
                  setSearch(e.target.value);
                  setPage(0);
                }
              }}
            />
          </label>
          <label>
            {t('ui.realm.kind')}
            <select
              value={kind}
              onChange={(e) => {
                if (owns()) {
                  setKind(e.target.value);
                  setPage(0);
                }
              }}
            >
              {(target ? ['all', 'castle', 'district'] : ['all', 'castle', 'district', 'army']).map(
                (value) => (
                  <option key={value} value={value}>
                    {t(`ui.realm.${value}`)}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <ul className={styles.list}>
          {filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row) => (
            <li key={`${row.kind}:${row.id}`}>
              <button
                type="button"
                aria-label={t('ui.realm.choose', { name: row.name })}
                onClick={() => select(row)}
              >
                <strong>{row.name}</strong>
                <span>{t(`ui.realm.${row.kind}`)}</span>
                <small>{row.lines.join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
        {filtered.length === 0 && <p role="status">{t('ui.realm.empty')}</p>}
        <nav className={styles.pages} aria-label={t('ui.realm.title')}>
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => {
              if (owns()) setPage(currentPage - 1);
            }}
          >
            {t('ui.realm.previous')}
          </button>
          <span aria-live="polite">{t('ui.realm.page', { page: currentPage + 1, pages })}</span>
          <button
            type="button"
            disabled={currentPage + 1 >= pages}
            onClick={() => {
              if (owns()) setPage(currentPage + 1);
            }}
          >
            {t('ui.realm.next')}
          </button>
        </nav>
      </div>
    </Dialog>
  );
}
