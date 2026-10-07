import { useState } from 'react';
import { BAL } from '@core/balance';
import { getPlotSuccessRate, plotMonthlyProgress } from '@core/index';
import type { Plot } from '@core/state/gameState';
import { traitModifier } from '@core/traits';
import type { ClanId, OfficerId, CastleId } from '@core/state/ids';
import type { PlotKind } from '@core/state/enums';
import type { CmdStartPlot } from '@core/commands/types';
import { t } from '@i18n/zh-TW';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { useUIStore } from '../hooks/uiStore';
import { M6Panel } from './M6Panel';
import styles from './M6Panel.module.css';

function ActivePlot({
  plot,
  playerClanId,
  targetName,
}: {
  plot: Plot;
  playerClanId: ClanId;
  targetName: (id: string | null) => string;
}) {
  const [chance, monthlyProgress] = useGameSelector(
    (game) => [getPlotSuccessRate(game, plot), plotMonthlyProgress(game, plot)] as const,
  );
  return (
    <article className={styles.card}>
      <h4>
        {t(`term.plot.${plot.kind}`)} · {targetName(plot.targetCastleId ?? plot.targetOfficerId)}
      </h4>
      <p>
        {targetName(plot.officerId)} · {Math.floor(plot.progress)}%
      </p>
      <progress value={plot.progress} max={100} aria-label={t('ui.plot.progress')} />
      <p>
        {t('ui.plot.chance', { chance: Math.round(chance * 100) })}
        {monthlyProgress > 0 && (
          <>
            {' '}
            ·{' '}
            {t('ui.diplomacy.remaining', {
              months: Math.ceil((BAL.plotProgressMax - plot.progress) / monthlyProgress),
            })}
          </>
        )}
      </p>
      <CommandAction
        command={{ type: 'cancelPlot', clanId: playerClanId, plotId: plot.id }}
        label={t('cmd.plot.cancel')}
        confirmation={t('ui.plot.cancelConfirm')}
      />
    </article>
  );
}

export function PlotPanel() {
  const model = useM6View();
  const params = useUIStore(
    (state) => [...state.panelStack].reverse().find((panel) => panel.id === 'plot')?.params,
  );
  const actions = useUIStore((state) => state.actions);
  const [kind, setKind] = useState<PlotKind>((params?.kind as PlotKind) ?? 'poach');
  const [clanId, setClanId] = useState<ClanId | ''>((params?.targetClanId as ClanId) ?? '');
  const [targetId, setTargetId] = useState(params?.targetId ?? '');
  const [rumorCastle, setRumorCastle] = useState(false);
  const [executorId, setExecutorId] = useState<OfficerId | ''>('');
  const [gold, setGold] = useState(params?.kind === 'betrayal' ? BAL.plotBetrayalMinInvestGold : 0);
  const castleMode = kind === 'betrayal' || (kind === 'rumor' && rumorCastle);
  const command: CmdStartPlot = {
    type: 'startPlot',
    clanId: model.playerClanId,
    kind,
    executorId: executorId as OfficerId,
    targetClanId: clanId as ClanId,
    targetOfficerId: castleMode ? null : (targetId as OfficerId) || null,
    targetCastleId: castleMode ? (targetId as CastleId) || null : null,
    investGold: gold,
  };
  const chance = useGameSelector((game) => getPlotSuccessRate(game, command));
  const monthlyCost = useGameSelector((game) =>
    Math.round(
      BAL.plotMonthlyCost *
        (kind === 'betrayal' ? BAL.plotBetrayalCostMult : 1) *
        (game.officers[executorId as OfficerId]
          ? traitModifier(game.officers[executorId as OfficerId]!, 'plot.costMult').mult
          : 1),
    ),
  );
  const plots = model.plots.filter((plot) => plot.ownerClanId === model.playerClanId);
  const targetName = (id: string | null) =>
    model.officers.find((officer) => officer.id === id)?.name ??
    model.castles.find((castle) => castle.id === id)?.name ??
    t('ui.common.noData');
  return (
    <M6Panel
      title={t('ui.plot.title')}
      testId="plot-panel"
      onClose={() => actions.closePanelById('plot')}
    >
      <h3>{t('ui.plot.active', { count: plots.length })}</h3>
      <div className={styles.list}>
        {plots.map((plot) => (
          <ActivePlot
            key={plot.id}
            plot={plot}
            playerClanId={model.playerClanId}
            targetName={targetName}
          />
        ))}
      </div>
      {model.castles
        .filter(
          (castle) =>
            castle.betrayalReadyClanId === model.playerClanId &&
            castle.betrayalReadyUntilDay >= model.day,
        )
        .map((castle) => (
          <article className={styles.card} key={castle.id}>
            <h4>
              {castle.name} · {t('ui.plot.ready')}
            </h4>
            <p>{t('ui.plot.markerUntil', { day: castle.betrayalReadyUntilDay })}</p>
            {model.sieges
              .filter((siege) => siege.castleId === castle.id)
              .map((siege) => (
                <CommandAction
                  key={siege.id}
                  command={{ type: 'useBetrayal', clanId: model.playerClanId, siegeId: siege.id }}
                  label={t('cmd.plot.activate')}
                />
              ))}
          </article>
        ))}
      <h3>{t('ui.plot.new')}</h3>
      <div className={styles.form}>
        <fieldset>
          <legend>{t('ui.plot.kind')}</legend>
          {(['poach', 'rumor', 'betrayal'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="plot-kind"
                value={value}
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  setTargetId('');
                  setGold(value === 'betrayal' ? BAL.plotBetrayalMinInvestGold : 0);
                }}
              />
              {t(`term.plot.${value}`)}
            </label>
          ))}
        </fieldset>
        <label>
          {t('ui.plot.targetClan')}
          <select
            value={clanId}
            onChange={(event) => {
              setClanId(event.currentTarget.value as ClanId);
              setTargetId('');
            }}
          >
            <option value="">{t('ui.common.select')}</option>
            {model.clans
              .filter((clan) => clan.id !== model.playerClanId)
              .map((clan) => (
                <option key={clan.id} value={clan.id}>
                  {clan.name}
                </option>
              ))}
          </select>
        </label>
        {kind === 'rumor' && (
          <label>
            <input
              type="checkbox"
              checked={rumorCastle}
              onChange={(event) => {
                setRumorCastle(event.currentTarget.checked);
                setTargetId('');
              }}
            />
            {t('ui.plot.castleMode')}
          </label>
        )}
        <label>
          {t('ui.plot.target')}
          <select value={targetId} onChange={(event) => setTargetId(event.currentTarget.value)}>
            <option value="">{t('ui.common.select')}</option>
            {(castleMode
              ? model.castles.filter((castle) => castle.ownerClanId === clanId)
              : model.officers.filter(
                  (officer) => officer.clanId === clanId && officer.status === 'serving',
                )
            ).map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('ui.plot.executor')}
          <select
            value={executorId}
            onChange={(event) => setExecutorId(event.currentTarget.value as OfficerId)}
          >
            <option value="">{t('ui.common.select')}</option>
            {model.officers
              .filter(
                (officer) => officer.clanId === model.playerClanId && officer.status === 'serving',
              )
              .map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t('ui.plot.investGold')}
          {kind === 'rumor' ? (
            <input type="number" value={0} readOnly />
          ) : (
            <select value={gold} onChange={(event) => setGold(Number(event.currentTarget.value))}>
              {(kind === 'betrayal'
                ? BAL.plotBetrayalInvestGoldOptions
                : BAL.plotPoachInvestGoldOptions
              ).map((amount) => (
                <option key={amount} value={amount}>
                  {amount}
                </option>
              ))}
            </select>
          )}
        </label>
        <p>
          {t('ui.diplomacy.monthlyCost', {
            gold: monthlyCost,
          })}{' '}
          · {t('ui.plot.chance', { chance: Math.round(chance * 100) })}
        </p>
        <CommandAction
          command={command}
          label={t('cmd.plot.start')}
          onSubmitted={() => {
            setTargetId('');
            setGold(0);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setTargetId('');
            setExecutorId('');
            setGold(kind === 'betrayal' ? BAL.plotBetrayalMinInvestGold : 0);
          }}
        >
          {t('ui.common.cancel')}
        </button>
      </div>
    </M6Panel>
  );
}
