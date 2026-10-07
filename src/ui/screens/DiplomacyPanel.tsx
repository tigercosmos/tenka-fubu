import { useState } from 'react';
import { BAL } from '@core/balance';
import {
  evaluateProposal,
  getTrust,
  getSentiment,
  workCostMultiplier,
  pactTrustCost,
} from '@core/index';
import type { DiplomacyActionKind, DiploMission } from '@core/state/gameState';
import type { ClanId, OfficerId } from '@core/state/ids';
import { formatNumber, t } from '@i18n/zh-TW';
import { TabView } from '../components';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { useUIStore } from '../hooks/uiStore';
import { M6Panel } from './M6Panel';
import { CourtPage } from './CourtPage';
import styles from './M6Panel.module.css';

const kinds: DiplomacyActionKind[] = [
  'proposeAlliance',
  'proposeMarriage',
  'proposeCeasefire',
  'demandVassal',
  'offerVassal',
  'requestReinforce',
];

export function DiploWork({ target }: { target: DiploMission['target'] }) {
  const model = useM6View();
  const [executorId, setExecutorId] = useState<OfficerId | ''>('');
  const mission = model.missions.find(
    (item) => item.fromClanId === model.playerClanId && item.target === target,
  );
  const cost = useGameSelector((game) =>
    Math.round(
      (target === 'court'
        ? BAL.courtWorkMonthlyCost
        : target === 'shogunate'
          ? BAL.shogunateWorkMonthlyCost
          : BAL.diplomacyWorkMonthlyCost) * workCostMultiplier(game, model.playerClanId),
    ),
  );
  const officers = model.officers.filter(
    (officer) => officer.status === 'serving' && officer.clanId === model.playerClanId,
  );
  return (
    <section className={styles.card}>
      <h3>{t('ui.diplomacy.assignWork')}</h3>
      <p>{t('ui.diplomacy.monthlyCost', { gold: cost })}</p>
      {mission !== undefined ? (
        <>
          <p>
            {model.officers.find((officer) => officer.id === mission.officerId)?.name} ·{' '}
            {t('ui.diplomacy.workMonths', {
              months: Math.floor((model.day - mission.startDay) / 30),
            })}
          </p>
          <CommandAction
            command={{ type: 'stopDiploWork', clanId: model.playerClanId, target }}
            label={t('ui.diplomacy.stopWork')}
          />
        </>
      ) : (
        <>
          <label>
            {t('ui.diplomacy.workOfficer')}
            <select
              value={executorId}
              onChange={(event) => setExecutorId(event.currentTarget.value as OfficerId)}
            >
              <option value="">{t('ui.common.select')}</option>
              {officers.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name}
                </option>
              ))}
            </select>
          </label>
          <CommandAction
            command={{
              type: 'startDiploWork',
              clanId: model.playerClanId,
              target,
              executorId: executorId as OfficerId,
            }}
            label={t('ui.diplomacy.startWork')}
          />
        </>
      )}
    </section>
  );
}

function ClanDetail({ targetId }: { targetId: ClanId }) {
  const model = useM6View();
  const target = model.clans.find((clan) => clan.id === targetId);
  const [against, setAgainst] = useState<ClanId | ''>('');
  const trust = useGameSelector((game) => getTrust(game, model.playerClanId, targetId));
  const sentiment = useGameSelector((game) => getSentiment(game, targetId, model.playerClanId));
  const pacts = (() => {
    const row = model.diplomacyRows.find(
      (row) =>
        (row.a === model.playerClanId && row.b === targetId) ||
        (row.b === model.playerClanId && row.a === targetId),
    );
    return row?.pacts ?? [];
  })();
  const scores = useGameSelector((game) =>
    kinds.map((kind) => evaluateProposal(game, model.playerClanId, targetId, kind)),
  );
  const actions = useUIStore((state) => state.actions);
  if (target === undefined) return null;
  return (
    <section>
      <h3>{target.name}</h3>
      <p>
        {t('ui.diplomacy.leader', {
          name: model.officers.find((officer) => officer.id === target.leaderId)?.name ?? '',
        })}
      </p>
      <p>
        {t('ui.diplomacy.trust')} {formatNumber(Math.floor(trust))} / 100 ·{' '}
        {t('ui.diplomacy.sentiment')} {formatNumber(Math.floor(sentiment))}
      </p>
      <h3>{t('ui.diplomacy.pacts')}</h3>
      {pacts.length === 0 && <p>{t('ui.diplomacy.pactNone')}</p>}
      {pacts.map((pact) => (
        <div className={styles.card} key={pact.kind}>
          {pact.kind === 'marriage' &&
            model.officers
              .filter(
                (officer) =>
                  officer.clanId === model.playerClanId &&
                  model.officers.some(
                    (spouse) => spouse.id === officer.spouseId && spouse.clanId === targetId,
                  ),
              )
              .map((officer) => (
                <p key={officer.id}>
                  {t('ui.envoy.marriage', {
                    names: [
                      officer.name,
                      model.officers.find((spouse) => spouse.id === officer.spouseId)?.name ?? '',
                    ].join('、'),
                  })}
                </p>
              ))}
          <p>
            {t(`term.pact.${pact.kind}`)} ·{' '}
            {pact.endDay === null
              ? t('ui.diplomacy.permanent')
              : t('ui.diplomacy.remaining', {
                  months: Math.ceil(Math.max(0, pact.endDay - model.day) / 30),
                })}
            {pact.vassalClanId !== null && (
              <>
                {' '}
                ·{' '}
                {t('ui.diplomacy.vassalClan', {
                  name: model.clans.find((clan) => clan.id === pact.vassalClanId)?.name ?? '',
                })}
              </>
            )}
          </p>
          <CommandAction
            command={{
              type: 'breakPact',
              clanId: model.playerClanId,
              targetClanId: targetId,
              kind: pact.kind,
            }}
            label={t('cmd.diplomacy.breakPact')}
            confirmation={t('cmd.diplomacy.breakPactConfirm', {
              clan: target.name,
              pact: t(`term.pact.${pact.kind}`),
            })}
          />
        </div>
      ))}
      <DiploWork key={targetId} target={targetId} />
      <label>
        {t('ui.diplomacy.reinforceAgainst')}
        <select
          value={against}
          onChange={(event) => setAgainst(event.currentTarget.value as ClanId)}
        >
          <option value="">{t('ui.common.select')}</option>
          {model.clans
            .filter((clan) => clan.id !== model.playerClanId && clan.id !== targetId)
            .map((clan) => (
              <option key={clan.id} value={clan.id}>
                {clan.name}
              </option>
            ))}
        </select>
      </label>
      <div className={styles.actions}>
        {kinds.map((kind, index) => (
          <div key={kind}>
            <p>
              {t('ui.diplomacy.trust')} −{pactTrustCost(kind)}
              {kind === 'proposeMarriage' && (
                <>
                  {' '}
                  · {t('ui.court.gold')} {BAL.goldCostMarriage}
                </>
              )}
            </p>
            {(kind === 'proposeAlliance' || kind === 'proposeCeasefire') && (
              <p>
                {t('ui.diplomacy.remaining', {
                  months: kind === 'proposeAlliance' ? BAL.allianceMonths : BAL.ceasefireMonths,
                })}
              </p>
            )}
            {kind === 'proposeMarriage' && <p>{t('ui.diplomacy.permanent')}</p>}
            {kind !== 'requestReinforce' && (
              <p>
                {t(
                  `ui.diplomacy.outlook.${scores[index]! >= BAL.dipAcceptThreshold ? 'high' : scores[index]! >= BAL.dipAcceptThreshold / 2 ? 'mid' : 'low'}`,
                )}
              </p>
            )}
            <CommandAction
              command={{
                type: 'proposePact',
                clanId: model.playerClanId,
                targetClanId: targetId,
                kind,
                reinforceAgainstClanId:
                  kind === 'requestReinforce' ? (against as ClanId) || null : null,
              }}
              label={t(`cmd.diplomacy.${kind}`)}
            />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => actions.openPanel('plot', { targetClanId: targetId })}>
        {t('ui.plot.title')}
      </button>
    </section>
  );
}

export function DiplomacyPanel() {
  const model = useM6View();
  const actions = useUIStore((state) => state.actions);
  const [tab, setTab] = useState('clans');
  const others = model.clans.filter((clan) => clan.id !== model.playerClanId);
  const [targetId, setTargetId] = useState<ClanId | undefined>(others[0]?.id);
  const relations = model.relations;
  return (
    <M6Panel
      title={t('ui.diplomacy.title')}
      testId="diplomacy-panel"
      onClose={() => actions.closePanelById('diplomacy')}
    >
      <TabView
        tabs={[
          { id: 'clans', label: t('ui.diplomacy.clans') },
          { id: 'court', label: t('ui.court.title') },
          { id: 'shogunate', label: t('ui.shogunate.title') },
        ]}
        activeId={tab}
        onChange={setTab}
      >
        <TabView.Pane id="clans">
          <div className={styles.columns}>
            <div className={styles.list}>
              {relations.map((clan) => (
                <button
                  type="button"
                  key={clan.id}
                  aria-pressed={clan.id === targetId}
                  onClick={() => setTargetId(clan.id)}
                >
                  {clan.name} · {t('ui.diplomacy.sentiment')} {Math.floor(clan.sentiment)} ·{' '}
                  {t('ui.diplomacy.trust')} {Math.floor(clan.trust)}{' '}
                  {clan.war && t('ui.diplomacy.atWar')}
                </button>
              ))}
            </div>
            {targetId !== undefined && <ClanDetail key={targetId} targetId={targetId} />}
          </div>
        </TabView.Pane>
        <TabView.Pane id="court">
          <CourtPage target="court" />
        </TabView.Pane>
        <TabView.Pane id="shogunate">
          <CourtPage target="shogunate" />
        </TabView.Pane>
      </TabView>
    </M6Panel>
  );
}
