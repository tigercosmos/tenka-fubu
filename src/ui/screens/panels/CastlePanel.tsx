import { useMemo, useState, type ReactElement } from 'react';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import { BAL } from '@core/balance';
import type { Command } from '@core/commands/types';
import { validateBuildFacility } from '@core/commands/domesticCommands';
import { castleFoodCap, castleMaxSoldiers } from '@core/domestic';
import { FACILITIES, FACILITY_DEFS } from '@core/facilities';
import type { CastleId, DistrictId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { NumberSlider, Panel, TabView } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { uiStore } from '@ui/hooks/uiStore';
import styles from './CastlePanel.module.css';

type Dispatch = (command: Command) => CommandDispatchResult | void;
type TabId = 'overview' | 'domestic' | 'military' | 'transport';

export interface CastlePanelProps {
  castleId: CastleId;
  onClose?: () => void;
  onOpenDistrict?: (districtId: DistrictId) => void;
  onOpenMarch?: (castleId: CastleId) => void;
  onCommand?: Dispatch;
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className={styles.meter}>
      <span>{label}</span>
      <progress value={Math.min(value, max)} max={Math.max(1, max)} aria-label={label} />
      <strong>{t('ui.common.currentMax', { current: value, max })}</strong>
    </div>
  );
}

const selectCastlePanelModel = makeCachedSelector((game, castleId: CastleId) => {
  const castle = game.castles[castleId];
  if (castle === undefined) return null;
  const clan = game.clans[castle.ownerClanId];
  const lord = castle.lordId === null ? null : game.officers[castle.lordId];
  const districts = castle.districtIds.flatMap((id) => {
    const district = game.districts[id];
    if (district === undefined) return [];
    const steward = district.stewardId === null ? null : game.officers[district.stewardId];
    return [
      {
        id,
        name: district.name,
        kokudaka: district.kokudaka,
        publicOrder: district.publicOrder,
        stewardName: steward?.name ?? null,
      },
    ];
  });
  const officers = Object.values(game.officers)
    .filter((officer) => officer.status === 'serving' && officer.locationCastleId === castle.id)
    .map((officer) => ({
      id: officer.id,
      name: officer.name,
      ldr: officer.ldr,
      val: officer.val,
      int: officer.int,
      pol: officer.pol,
      rank: officer.rank,
      armyId: officer.armyId,
    }));
  const friendlyCastles = Object.values(game.castles)
    .filter(
      (candidate) => candidate.ownerClanId === game.meta.playerClanId && candidate.id !== castle.id,
    )
    .map((candidate) => ({ id: candidate.id, name: candidate.name }));
  const activeArmies = Object.values(game.armies)
    .filter((army) => army.originCastleId === castle.id && army.clanId === castle.ownerClanId)
    .map((army) => ({
      id: army.id,
      soldiers: army.soldiers,
      leaderName: game.officers[army.leaderId]?.name ?? army.id,
      target: army.targetNodeId,
    }));
  const buildableFacilities = new Set(
    FACILITY_DEFS.filter(
      (def) =>
        validateBuildFacility(game, {
          type: 'buildFacility',
          clanId: game.meta.playerClanId,
          castleId,
          facilityTypeId: def.id,
        }).ok,
    ).map((def) => def.id),
  );
  return {
    castle: {
      id: castle.id,
      name: castle.name,
      tier: castle.tier,
      ownerClanId: castle.ownerClanId,
      durability: castle.durability,
      maxDurability: castle.maxDurability,
      soldiers: castle.soldiers,
      food: castle.food,
      morale: castle.morale,
      facilities: [...castle.facilities],
      buildQueue: castle.buildQueue.map((order) => ({ ...order })),
      conscriptPolicy: castle.conscriptPolicy,
    },
    clanName: clan?.name ?? castle.ownerClanId,
    playerClanId: game.meta.playerClanId,
    maxSoldiers: castleMaxSoldiers(game, castle),
    foodCap: castleFoodCap(castle),
    lord:
      lord === undefined || lord === null
        ? null
        : {
            id: lord.id,
            name: lord.name,
            ldr: lord.ldr,
            val: lord.val,
            int: lord.int,
            pol: lord.pol,
          },
    districts,
    officers,
    friendlyCastles,
    activeArmies,
    buildableFacilities,
  };
});

export function CastlePanel({
  castleId,
  onClose,
  onOpenDistrict,
  onOpenMarch,
  onCommand = dispatchCommand,
}: CastlePanelProps): ReactElement | null {
  const model = useCachedGameSelector(selectCastlePanelModel, castleId);
  const [tab, setTab] = useState<TabId>('overview');
  const [showBuildMenu, setShowBuildMenu] = useState(false);
  const [transportTo, setTransportTo] = useState('');
  const [transportFood, setTransportFood] = useState(0);
  const [transportSoldiers, setTransportSoldiers] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const builtIds = useMemo(
    () => new Set(model?.castle.facilities ?? []),
    [model?.castle.facilities],
  );
  if (model === null) return null;
  const owned = model.castle.ownerClanId === model.playerClanId;
  const slotCount = model.castle.tier === 'main' ? BAL.facilitySlotsMain : BAL.facilitySlotsBranch;
  const daysOfFood =
    model.castle.soldiers > 0
      ? Math.floor(
          model.castle.food /
            Math.max(1, (model.castle.soldiers * BAL.garrisonFoodPerSoldierMonthly) / 30),
        )
      : Infinity;

  const submit = (command: Command) => {
    const result = onCommand(command);
    setFeedback(result && !result.ok ? result.reason : null);
  };
  const openDistrict = (districtId: DistrictId) => {
    if (onOpenDistrict) return onOpenDistrict(districtId);
    uiStore.getState().actions.setSelection({ kind: 'district', id: districtId });
    uiStore.getState().actions.openPanel('district', { districtId });
  };
  const close = onClose ?? (() => uiStore.getState().actions.closePanelById('castle'));
  const openMarch = () => {
    if (onOpenMarch) return onOpenMarch(castleId);
    uiStore.getState().actions.setMarchDraft({
      originCastleId: castleId,
      leaderOfficerId: null,
      subOfficerIds: [],
      soldiers: 0,
      food: 0,
      targetNodeId: null,
      previewPath: null,
      previewDays: null,
      phase: 'compose',
      errorKey: null,
    });
    uiStore
      .getState()
      .actions.enqueueModal({ id: 'march', params: { castleId }, pausesTime: false });
  };

  const tabs = [
    { id: 'overview', label: t('ui.castle.tab.overview') },
    { id: 'domestic', label: t('ui.castle.tab.domestic'), disabled: !owned },
    { id: 'military', label: t('ui.castle.tab.military'), disabled: !owned },
    { id: 'transport', label: t('ui.castle.tab.transport'), disabled: !owned },
  ];

  return (
    <aside className={styles.anchor} data-testid="castle-panel">
      <Panel
        title={t('ui.castle.title', {
          castle: model.castle.name,
          clan: model.clanName,
          tier: model.castle.tier === 'main' ? t('ui.castle.mainSuffix') : '',
        })}
        onClose={close}
        variant="ornate"
      >
        <TabView tabs={tabs} activeId={tab} onChange={(id) => setTab(id as TabId)} keepMounted>
          <TabView.Pane id="overview">
            <div className={styles.page}>
              <section>
                <h3>{t('ui.castle.lord')}</h3>
                {model.lord ? (
                  <p>{t('ui.castle.lordStats', model.lord)}</p>
                ) : (
                  <p>{t('ui.castle.vacant')}</p>
                )}
              </section>
              <Meter
                label={t('ui.castle.durability')}
                value={model.castle.durability}
                max={model.castle.maxDurability}
              />
              <Meter
                label={t('ui.castle.soldiers')}
                value={model.castle.soldiers}
                max={model.maxSoldiers}
              />
              <Meter label={t('ui.castle.food')} value={model.castle.food} max={model.foodCap} />
              <p>
                {Number.isFinite(daysOfFood)
                  ? t('ui.castle.foodDays', { days: daysOfFood })
                  : t('ui.castle.foodDaysInfinite')}
              </p>
              <Meter label={t('ui.castle.morale')} value={model.castle.morale} max={100} />
              <section>
                <h3>{t('ui.castle.districtCount', { count: model.districts.length })}</h3>
                <div className={styles.list}>
                  {model.districts.map((district) => (
                    <button
                      type="button"
                      key={district.id}
                      onClick={() => openDistrict(district.id)}
                    >
                      <span>{district.name}</span>
                      <span>{t('ui.castle.districtKokudaka', { value: district.kokudaka })}</span>
                      <span>{t('ui.castle.securityShort', { value: district.publicOrder })}</span>
                      <span>
                        {district.stewardName
                          ? t('ui.castle.stewardName', { name: district.stewardName })
                          : t('ui.district.direct')}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h3>{t('ui.castle.garrisonCount', { count: model.officers.length })}</h3>
                <p>
                  {model.officers.map((officer) => officer.name).join('・') || t('ui.common.none')}
                </p>
              </section>
            </div>
          </TabView.Pane>
          <TabView.Pane id="domestic">
            <div className={styles.page}>
              <section>
                <h3>{t('ui.castle.facilitySlots', { count: slotCount })}</h3>
                <div className={styles.slots}>
                  {Array.from({ length: slotCount }, (_, index) => {
                    const id = model.castle.facilities[index];
                    const queued = model.castle.buildQueue[index - model.castle.facilities.length];
                    return (
                      <button
                        type="button"
                        key={index}
                        onClick={() => {
                          if (!id && !queued) setShowBuildMenu(true);
                        }}
                        disabled={Boolean(id || queued)}
                      >
                        {id ? (
                          t(FACILITIES[id]?.nameKey ?? id)
                        ) : queued ? (
                          <>
                            {t(FACILITIES[queued.facilityTypeId]?.nameKey ?? queued.facilityTypeId)}
                            <small>{t('ui.facility.daysLeft', { days: queued.daysLeft })}</small>
                          </>
                        ) : (
                          <>
                            <strong>{t('ui.common.add')}</strong>
                            <small>{t('ui.facility.slotVacant')}</small>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
              {showBuildMenu && (
                <section>
                  <h3>{t('ui.castle.buildMenu')}</h3>
                  <div className={styles.buildList}>
                    {FACILITY_DEFS.filter(
                      (def) =>
                        !builtIds.has(def.id) &&
                        !model.castle.buildQueue.some((order) => order.facilityTypeId === def.id),
                    ).map((def) => (
                      <button
                        type="button"
                        key={def.id}
                        disabled={!model.buildableFacilities.has(def.id)}
                        onClick={() =>
                          submit({
                            type: 'buildFacility',
                            clanId: model.playerClanId,
                            castleId,
                            facilityTypeId: def.id,
                          })
                        }
                      >
                        <span>{t(def.nameKey)}</span>
                        <span>{t('ui.common.goldAmount', { value: def.costGold })}</span>
                        <span>{t('ui.common.dayAmount', { value: def.buildDays })}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h3>{t('ui.conscript.policy')}</h3>
                <div className={styles.policyRow}>
                  {(['low', 'mid', 'high'] as const).map((policy) => (
                    <label key={policy}>
                      <input
                        type="radio"
                        name="conscript"
                        checked={model.castle.conscriptPolicy === policy}
                        onChange={() =>
                          submit({
                            type: 'setConscriptPolicy',
                            clanId: model.playerClanId,
                            castleId,
                            policy,
                          })
                        }
                      />
                      {t(`term.conscript.${policy}`)}
                    </label>
                  ))}
                </div>
              </section>
            </div>
          </TabView.Pane>
          <TabView.Pane id="military">
            <div className={styles.page}>
              <Meter
                label={t('ui.castle.soldiers')}
                value={model.castle.soldiers}
                max={model.maxSoldiers}
              />
              <Meter label={t('ui.castle.morale')} value={model.castle.morale} max={100} />
              <button type="button" className={styles.primary} onClick={openMarch}>
                {t('ui.castle.deploy')}
              </button>
              <section>
                <h3>{t('ui.castle.availableOfficers', { count: model.officers.length })}</h3>
                {model.officers.map((officer) => (
                  <p key={officer.id}>
                    {t('ui.castle.officerStats', {
                      name: officer.name,
                      ldr: officer.ldr,
                      val: officer.val,
                    })}
                  </p>
                ))}
              </section>
              <section>
                <h3>{t('ui.castle.armiesInTransit', { count: model.activeArmies.length })}</h3>
                {model.activeArmies.map((army) => (
                  <p key={army.id}>
                    {t('ui.castle.armyRow', {
                      name: army.leaderName,
                      soldiers: army.soldiers,
                      target: army.target ?? t('ui.common.none'),
                    })}
                  </p>
                ))}
              </section>
            </div>
          </TabView.Pane>
          <TabView.Pane id="transport">
            <div className={styles.page}>
              <label>
                {t('ui.transport.destination', { from: model.castle.name })}
                <select
                  aria-label={t('ui.transport.destination', { from: model.castle.name })}
                  value={transportTo}
                  onChange={(event) => setTransportTo(event.currentTarget.value)}
                >
                  <option value="">{t('ui.common.choose')}</option>
                  {model.friendlyCastles.map((castle) => (
                    <option value={castle.id} key={castle.id}>
                      {castle.name}
                    </option>
                  ))}
                </select>
              </label>
              <NumberSlider
                label={t('ui.castle.food')}
                min={0}
                max={model.castle.food}
                step={100}
                value={transportFood}
                unit={t('term.unit.koku')}
                onChange={setTransportFood}
              />
              <p>{t('ui.transport.goldCentral')}</p>
              <NumberSlider
                label={t('ui.castle.soldiers')}
                min={0}
                max={model.castle.soldiers}
                step={100}
                value={transportSoldiers}
                unit={t('term.unit.people')}
                onChange={setTransportSoldiers}
              />
              <button
                type="button"
                className={styles.primary}
                disabled={!transportTo || transportFood + transportSoldiers === 0}
                onClick={() =>
                  submit({
                    type: 'transport',
                    clanId: model.playerClanId,
                    fromCastleId: castleId,
                    toCastleId: transportTo as CastleId,
                    soldiers: transportSoldiers,
                    gold: 0,
                    food: transportFood,
                  })
                }
              >
                {t('ui.transport.execute')}
              </button>
            </div>
          </TabView.Pane>
        </TabView>
        {feedback && (
          <p role="alert" className={styles.error}>
            {t(feedback)}
          </p>
        )}
      </Panel>
    </aside>
  );
}
