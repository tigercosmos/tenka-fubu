import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand } from '@app/bridge';
import type { Command } from '@core/commands/types';
import { REJECT_REASONS } from '@core/commands/reasons';
import type { OfficerId } from '@core/state/ids';
import { rewardOfficerCost, rewardOfficerLoyaltyGain } from '@core/index';
import { formatNumber, t } from '@i18n/zh-TW';
import { DataTable, Dialog, type ColumnDef } from '../components';
import { CommandAction } from '../components/CommandAction';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import { useUIStore, uiStore } from '../hooks/uiStore';
import { buildOfficerRows, sortOfficerRows } from './OfficerList';
import { RewardFiefPane } from './RewardFiefPane';
import styles from './RewardRoster.module.css';

const tiers = ['small', 'medium', 'large'] as const;
let nextSessionKey = 0;
const sessionKeys = new WeakMap<object, number>();
function sessionKeyFor(game: object) {
  let key = sessionKeys.get(game);
  if (key === undefined) {
    key = ++nextSessionKey;
    sessionKeys.set(game, key);
  }
  return key;
}
const selectRoster = makeCachedSelector((game) => ({
  playerClanId: game.meta.playerClanId,
  spent: game.clans[game.meta.playerClanId]?.rewardGoldSpentThisMonth ?? null,
  rows: sortOfficerRows(buildOfficerRows(game), { key: 'loyalty', dir: 'asc' }).map((row) => {
    const officer = game.officers[row.id]!;
    return {
      ...row,
      annualCount: officer.rewardGiftsThisYear,
      gains: tiers.map((tier) =>
        Math.min(rewardOfficerLoyaltyGain(officer, tier), 100 - officer.loyalty),
      ),
    };
  }),
}));
type RewardRow = ReturnType<typeof selectRoster>['rows'][number];

export function RewardRoster({ onClose }: { onClose: () => void }) {
  const game = useStore(store, (state) => state.game);
  const modal = useUIStore((state) => state.modal);
  const sessionKey = useMemo(() => (game === null ? 0 : sessionKeyFor(game)), [game]);
  const model = useCachedGameSelector(selectRoster);
  const [selected, setSelected] = useState<{ game: typeof game; id: OfficerId } | null>(null);
  const selectedId =
    selected?.game === game && model.rows.some((row) => row.id === selected.id)
      ? selected.id
      : null;
  const [feedback, setFeedback] = useState<{ game: typeof game; message: string } | null>(null);
  const scope = useMemo(() => ({ game, modal, selectedId }), [game, modal, selectedId]);
  const currentScope = useRef(scope);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    currentScope.current = scope;
  }, [scope]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ownsScope = () => {
    const current = store.getState();
    return (
      mounted.current &&
      currentScope.current === scope &&
      game !== null &&
      current.game === game &&
      uiStore.getState().modal === modal &&
      (modal === null || modal.id === 'rewards')
    );
  };
  const canSubmit = () => {
    const current = store.getState();
    return (
      ownsScope() &&
      game?.meta.gameOver === null &&
      current.session.screen === 'main' &&
      !current.session.viewportBlocked &&
      current.session.fatalError === null
    );
  };
  const submit = (command: Command) => {
    const result =
      canSubmit() && selectedId === null
        ? dispatchCommand(command)
        : { ok: false as const, reason: REJECT_REASONS.invalidTarget };
    if (!result.ok) setFeedback({ game, message: t(result.reason, result.params) });
    return result;
  };
  const columns: ColumnDef<RewardRow>[] = [
    { key: 'name', header: t('ui.officer.name'), width: 140, render: (row) => row.name },
    {
      key: 'loyalty',
      header: t('ui.officer.loyalty'),
      width: 64,
      render: (row) => formatNumber(row.loyalty),
    },
    {
      key: 'count',
      header: t('ui.reward.yearCount'),
      width: 100,
      render: (row) => formatNumber(row.annualCount),
    },
    ...tiers.map((tier, index): ColumnDef<RewardRow> => ({
      key: tier,
      header: t(`term.reward.${tier}`),
      width: 240,
      render: (row) => (
        <div className={styles.actionCell}>
          <CommandAction
            command={{ type: 'rewardOfficer', clanId: model.playerClanId, officerId: row.id, tier }}
            label={t('ui.officer.rewardOffer', {
              tier: t(`term.reward.${tier}`),
              gold: rewardOfficerCost(tier),
              loyalty: row.gains[index]!,
            })}
            onCommand={submit}
          />
        </div>
      ),
    })),
    {
      key: 'promote',
      header: t('cmd.officer.promote'),
      width: 80,
      render: (row) => (
        <div className={styles.actionCell}>
          <CommandAction
            command={{ type: 'promoteRank', clanId: model.playerClanId, officerId: row.id }}
            label={t('cmd.officer.promote')}
            onCommand={submit}
          />
        </div>
      ),
    },
    {
      key: 'fief',
      header: t('ui.reward.fief'),
      width: 80,
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            if (canSubmit()) setSelected({ game, id: row.id });
          }}
        >
          {t('ui.reward.fief')}
        </button>
      ),
    },
  ];
  return (
    <Dialog
      open
      size="lg"
      title={t('ui.reward.title')}
      onClose={() => {
        if (!ownsScope()) return;
        mounted.current = false;
        onClose();
      }}
      focusScopeKey={`${sessionKey}:${selectedId ?? 'roster'}`}
    >
      <div className={styles.roster} data-testid="reward-roster">
        <p>
          {model.spent === null
            ? t('ui.reward.monthSpentUnknown')
            : t('ui.reward.monthSpent', { gold: formatNumber(model.spent) })}
        </p>
        {feedback?.game === game && <p role="alert">{feedback.message}</p>}
        {selectedId === null ? (
          <DataTable
            rows={model.rows}
            columns={columns}
            rowKey={(row) => row.id}
            rowHeight={40}
            height={400}
            emptyText={t('ui.reward.empty')}
          />
        ) : (
          <RewardFiefPane
            officerId={selectedId}
            onBack={() => {
              if (canSubmit()) setSelected(null);
            }}
            canSubmit={() => canSubmit() && currentScope.current.selectedId === selectedId}
          />
        )}
      </div>
    </Dialog>
  );
}
