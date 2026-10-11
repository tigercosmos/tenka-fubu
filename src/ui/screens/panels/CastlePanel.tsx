import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { getTransportPreviews, getTransportOrders } from '@app/transportBridge';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  hasQueuedTransportRecall,
  type CommandDispatchResult,
} from '@app/bridge';
import { validateCommand } from '@core/commands/validate';
import { treasuryForCastle } from '@core/commands/treasury';
import { BAL } from '@core/balance';
import { createMarchDraft, marchOfficerEligible } from '../marchDraft';
import type { Command } from '@core/commands/types';
import {
  validateBuildFacility,
  validateRecallTransport,
  validateAppointLord,
} from '@core/commands/domesticCommands';
import { castleFoodCap, castleMaxSoldiers } from '@core/domestic';
import { FACILITIES, FACILITY_DEFS } from '@core/facilities';
import type { ArmyId, CastleId, DistrictId, OfficerId } from '@core/state/ids';
import type { Army, GameState } from '@core/state/gameState';
import { t } from '@i18n/zh-TW';
import { ConfirmDialog, NumberSlider, Panel, TabView } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { uiStore, useUIStore, type ModalInstance } from '@ui/hooks/uiStore';
import styles from './CastlePanel.module.css';
import { RiceTradePane } from './RiceTradePane';
import { CastleControlPane } from './CastleControlPane';
import { CastleLordDismissPane } from './CastleLordDismissPane';
import { UI } from '../../uiConstants';

type Dispatch = (command: Command) => CommandDispatchResult | void;
type TabId = 'overview' | 'domestic' | 'military' | 'transport';

interface BuildRequest {
  game: GameState;
  command: Extract<Command, { type: 'buildFacility' }>;
  token: string;
}

type RemovalCommand = Extract<Command, { type: 'demolishFacility' | 'cancelBuild' }>;
interface RemovalRequest {
  game: GameState;
  command: RemovalCommand;
  token: string;
  name: string;
  order: GameState['castles'][CastleId]['buildQueue'][number] | null;
}
function matchesRemoval(modal: ModalInstance | null, request: RemovalRequest): boolean {
  return (
    modal?.id === 'confirm' &&
    modal.params.owner === 'castleFacilityRemoval' &&
    modal.params.token === request.token &&
    modal.params.castleId === request.command.castleId
  );
}
function removeRemoval(request: RemovalRequest): void {
  const ui = uiStore.getState();
  const active = matchesRemoval(ui.modal, request);
  uiStore.setState({
    modalQueue: ui.modalQueue.filter((item) => !matchesRemoval(item, request)),
    ...(active && store.getState().game !== request.game
      ? { restoreSpeedOnQueueDrain: false }
      : {}),
  });
  if (matchesRemoval(uiStore.getState().modal, request)) uiStore.getState().actions.closeModal();
}

function matchesBuildRequest(modal: ModalInstance | null, request: BuildRequest): boolean {
  return (
    modal?.id === 'confirm' &&
    modal.params.owner === 'castleBuild' &&
    modal.params.token === request.token &&
    modal.params.castleId === request.command.castleId
  );
}

function removeBuildRequest(request: BuildRequest): void {
  const ui = uiStore.getState();
  const ownsActive = matchesBuildRequest(ui.modal, request);
  uiStore.setState({
    modalQueue: ui.modalQueue.filter((modal) => !matchesBuildRequest(modal, request)),
    ...(ownsActive && store.getState().game !== request.game
      ? { restoreSpeedOnQueueDrain: false }
      : {}),
  });
  if (matchesBuildRequest(uiStore.getState().modal, request))
    uiStore.getState().actions.closeModal();
}

export interface CastlePanelProps {
  castleId: CastleId;
  onClose?: () => void;
  onOpenDistrict?: (districtId: DistrictId) => void;
  onOpenMarch?: (castleId: CastleId, selectedOfficerIds?: readonly OfficerId[]) => void;
  onSelectArmy?: (armyId: ArmyId, expectedArmy: Readonly<Army>) => void;
  onCommand?: Dispatch;
  initialTab?: TabId;
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
      marchEligible: marchOfficerEligible(game, castle.id, officer.id),
    }));
  const activeArmies = Object.values(game.armies)
    .filter((army) => army.originCastleId === castle.id && army.clanId === game.meta.playerClanId)
    .map((army) => ({
      id: army.id,
      identity: army,
      soldiers: army.soldiers,
      leaderName: game.officers[army.leaderId]?.name ?? army.id,
      target:
        army.targetNodeId === null
          ? null
          : (game.castles[army.targetNodeId as CastleId]?.name ??
            game.districts[army.targetNodeId as DistrictId]?.name ??
            army.targetNodeId),
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
    marchControllable: createMarchDraft(game, castle.id, []) !== null,
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
    localAdultRoninCount: Object.values(game.officers).filter(
      (officer) =>
        officer.status === 'ronin' && officer.hasComeOfAge && officer.locationCastleId === castleId,
    ).length,
    activeArmies,
    buildableFacilities,
  };
});

const selectTransportRoutes = makeCachedSelector((game, castleId: CastleId, enabled: boolean) =>
  enabled ? getTransportPreviews(game, game.meta.playerClanId, castleId) : [],
);
const selectTransportOrders = makeCachedSelector((game, castleId: CastleId, enabled: boolean) =>
  enabled ? getTransportOrders(game, game.meta.playerClanId, castleId) : [],
);

export function CastlePanel({
  castleId,
  onClose,
  onOpenDistrict,
  onOpenMarch,
  onSelectArmy,
  onCommand = dispatchCommand,
  initialTab = 'overview',
}: CastlePanelProps): ReactElement | null {
  const model = useCachedGameSelector(selectCastlePanelModel, castleId);
  const game = useStore(store, (state) => state.game);
  const owningPanel = useUIStore((state) => state.panelStack.at(-1));
  const recruitOwner = useMemo(
    () => ({ game, castleId, panel: owningPanel }),
    [game, castleId, owningPanel],
  );
  const activeRecruitOwner = useRef<typeof recruitOwner | null>(null);
  const [marchSelection, setMarchSelection] = useState<{
    owner: typeof recruitOwner;
    ids: readonly OfficerId[];
  }>(() => ({ owner: recruitOwner, ids: [] }));
  const currentMarchSelection = useRef(marchSelection);
  currentMarchSelection.current = marchSelection;
  useLayoutEffect(() => {
    setMarchSelection((previous) => {
      const ids =
        previous.owner !== recruitOwner ||
        game === null ||
        createMarchDraft(game, castleId, []) === null
          ? []
          : previous.ids.filter((id) => marchOfficerEligible(game, castleId, id));
      if (previous.owner === recruitOwner && ids.length === previous.ids.length) return previous;
      const next = { owner: recruitOwner, ids };
      currentMarchSelection.current = next;
      return next;
    });
  }, [game, castleId, model, recruitOwner]);
  useLayoutEffect(() => {
    activeRecruitOwner.current = recruitOwner;
    return () => {
      if (activeRecruitOwner.current === recruitOwner) activeRecruitOwner.current = null;
    };
  }, [recruitOwner]);
  const modal = useUIStore((state) => state.modal);
  const modalQueue = useUIStore((state) => state.modalQueue);
  const buildOwner = useId();
  const buildSequence = useRef(0);
  const [buildRequest, setBuildRequest] = useState<BuildRequest | null>(null);
  const [buildFeedback, setBuildFeedback] = useState<string | null>(null);
  const currentBuildRequest = useRef<BuildRequest | null>(null);
  const [removalRequest, setRemovalRequest] = useState<RemovalRequest | null>(null);
  const currentRemoval = useRef<RemovalRequest | null>(null);
  useEffect(() => {
    if (!removalRequest) return;
    return () => removeRemoval(removalRequest);
  }, [removalRequest]);
  useEffect(() => {
    if (
      currentRemoval.current &&
      (currentRemoval.current.game !== game || currentRemoval.current.command.castleId !== castleId)
    ) {
      currentRemoval.current = null;
      setRemovalRequest(null);
    }
  }, [game, castleId]);
  useEffect(() => {
    if (
      removalRequest &&
      !matchesRemoval(modal, removalRequest) &&
      !modalQueue.some((item) => matchesRemoval(item, removalRequest))
    ) {
      currentRemoval.current = null;
      setRemovalRequest(null);
    }
  }, [removalRequest, modal, modalQueue]);
  useEffect(() => {
    if (!buildRequest) return;
    return () => removeBuildRequest(buildRequest);
  }, [buildRequest]);
  useEffect(() => {
    if (
      currentBuildRequest.current &&
      (currentBuildRequest.current.game !== game ||
        currentBuildRequest.current.command.castleId !== castleId)
    ) {
      currentBuildRequest.current = null;
      setBuildRequest(null);
    }
  }, [game, castleId]);
  useEffect(() => setBuildFeedback(null), [game, castleId]);
  useEffect(() => {
    if (
      buildRequest &&
      !matchesBuildRequest(modal, buildRequest) &&
      !modalQueue.some((queued) => matchesBuildRequest(queued, buildRequest))
    ) {
      if (currentBuildRequest.current === buildRequest) currentBuildRequest.current = null;
      setBuildRequest(null);
    }
  }, [buildRequest, modal, modalQueue]);
  const [tab, setTab] = useState<TabId>(initialTab);
  const panelRef = useRef<HTMLElement>(null);
  useStore(store, (state) => state.session.pendingCommandCount);
  const transportOrders = useCachedGameSelector(selectTransportOrders, castleId, true);
  const invalidTab =
    model !== null &&
    model.castle.ownerClanId !== model.playerClanId &&
    (tab === 'domestic' ||
      (tab === 'military' && model.activeArmies.length === 0) ||
      (tab === 'transport' && transportOrders.length === 0));
  const activeTab = invalidTab ? 'overview' : tab;
  const scrollOwner = useRef<{
    game: typeof game;
    castleId: CastleId;
    offsets: Partial<Record<TabId, number>>;
  }>({ game, castleId, offsets: {} });
  useLayoutEffect(() => {
    if (scrollOwner.current.game !== game || scrollOwner.current.castleId !== castleId)
      scrollOwner.current = { game, castleId, offsets: {} };
    const section = panelRef.current?.querySelector<HTMLElement>(':scope > section');
    if (section) section.scrollTop = scrollOwner.current.offsets[activeTab] ?? 0;
  }, [game, castleId, activeTab]);
  const selectTab = (id: TabId) => {
    if (id === activeTab) return;
    const owner = scrollOwner.current;
    if (owner.game === game && owner.castleId === castleId) {
      const section = panelRef.current?.querySelector<HTMLElement>(':scope > section');
      if (section) owner.offsets[activeTab] = section.scrollTop;
    }
    setTab(id);
  };
  useLayoutEffect(() => {
    if (!invalidTab) return;
    const panel = panelRef.current;
    const focusOwned =
      document.activeElement === document.body || panel?.contains(document.activeElement);
    setTab('overview');
    if (
      focusOwned &&
      uiStore.getState().modal === null &&
      !store.getState().session.viewportBlocked &&
      document.querySelector('[data-ui-dialog]') === null
    )
      panel?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, [invalidTab]);
  const transportRoutes = useCachedGameSelector(
    selectTransportRoutes,
    castleId,
    tab === 'transport',
  );
  const [showBuildMenu, setShowBuildMenu] = useState(false);
  const [transportTo, setTransportTo] = useState('');
  const [transportFood, setTransportFood] = useState(0);
  const [transportGold, setTransportGold] = useState(0);
  const [transportSoldiers, setTransportSoldiers] = useState(0);
  const transportRevision = useRef(0);
  const renderedTransportRevision = transportRevision.current;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lordEditing, setLordEditing] = useState(false);
  const [lordChoice, setLordChoice] = useState<OfficerId | null>(null);
  const [lordError, setLordError] = useState<string | null>(null);
  const lordButtonRef = useRef<HTMLButtonElement>(null);
  const formOwner = useRef({ game, castleId });
  const currentForm = formOwner.current.game === game && formOwner.current.castleId === castleId;
  const destination = currentForm ? transportTo : '';
  const food = currentForm ? transportFood : 0;
  const gold = currentForm ? transportGold : 0;
  const soldiers = currentForm ? transportSoldiers : 0;
  useEffect(() => {
    if (formOwner.current.game === game && formOwner.current.castleId === castleId) return;
    formOwner.current = { game, castleId };
    setTransportTo('');
    setTransportFood(0);
    setTransportGold(0);
    setTransportSoldiers(0);
    transportRevision.current += 1;
    setFeedback(null);
    setLordEditing(false);
    setLordChoice(null);
    setLordError(null);
    setTab(initialTab);
  }, [game, castleId, initialTab]);
  useLayoutEffect(() => {
    if (
      lordEditing &&
      currentForm &&
      uiStore.getState().modal === null &&
      !store.getState().session.viewportBlocked &&
      document.querySelector('[data-ui-dialog]') === null &&
      (document.activeElement === document.body || document.activeElement === lordButtonRef.current)
    )
      panelRef.current?.querySelector<HTMLSelectElement>('[data-castle-lord-select]')?.focus();
  }, [lordEditing, currentForm]);

  const builtIds = useMemo(
    () => new Set(model?.castle.facilities ?? []),
    [model?.castle.facilities],
  );
  if (model === null) return null;
  const selectedMarchIds =
    marchSelection.owner === recruitOwner
      ? marchSelection.ids.filter((id) =>
          model.officers.some((officer) => officer.id === id && officer.marchEligible),
        )
      : [];
  const ownsMarchSelection = () => {
    const current = store.getState();
    const ui = uiStore.getState();
    const panel = ui.panelStack.at(-1);
    return (
      activeRecruitOwner.current === recruitOwner &&
      currentMarchSelection.current === marchSelection &&
      current.game !== null &&
      current.game === game &&
      current.session.screen === 'main' &&
      !current.session.fatalError &&
      !current.session.viewportBlocked &&
      current.game.meta.gameOver === null &&
      ui.modal === null &&
      document.querySelector('[data-ui-dialog]') === null &&
      panel === recruitOwner.panel &&
      (panel === undefined || (panel.id === 'castle' && panel.params.castleId === castleId)) &&
      createMarchDraft(current.game, castleId, []) !== null &&
      selectedMarchIds.every((id) => marchOfficerEligible(current.game!, castleId, id))
    );
  };
  const owned = model.castle.ownerClanId === model.playerClanId;
  const domesticCastle = game?.castles[castleId];
  const domesticDay = game?.time.day;
  const ownsDomesticInteraction = () => {
    const current = store.getState();
    const ui = uiStore.getState();
    return (
      activeRecruitOwner.current === recruitOwner &&
      current.game !== null &&
      current.game === game &&
      current.game.castles[castleId] === domesticCastle &&
      current.game.time.day === domesticDay &&
      current.session.screen === 'main' &&
      current.session.fatalError === null &&
      !current.session.viewportBlocked &&
      current.game.meta.gameOver === null &&
      ui.modal === null &&
      document.querySelector('[data-ui-dialog]') === null &&
      ui.panelStack.at(-1) === recruitOwner.panel
    );
  };
  const lordCommand = {
    type: 'appointLord' as const,
    clanId: model.playerClanId,
    castleId,
    officerId: lordChoice,
  };
  const lordCandidates = model.officers.filter(
    (officer) => game && validateAppointLord(game, { ...lordCommand, officerId: officer.id }).ok,
  );
  const lordGate = game
    ? validateAppointLord(game, {
        ...lordCommand,
        officerId: lordCandidates[0]?.id ?? model.lord?.id ?? null,
      })
    : null;
  const lordValidation = game ? validateAppointLord(game, lordCommand) : null;
  const reasonOfficerId = lordChoice ?? model.lord?.id;
  const lordReason = (reason: string, params?: Record<string, string | number>) =>
    t(reason, {
      name: (reasonOfficerId ? game?.officers[reasonOfficerId]?.name : null) ?? t('ui.castle.lord'),
      ...params,
    });
  const ownsLordInteraction = () =>
    store.getState().game === game &&
    formOwner.current.game === game &&
    formOwner.current.castleId === castleId &&
    currentForm &&
    uiStore.getState().modal === null &&
    !store.getState().session.viewportBlocked &&
    document.querySelector('[data-ui-dialog]') === null;
  const closeLordEditor = () => {
    if (!ownsLordInteraction()) return;
    setLordEditing(false);
    setLordError(null);
    lordButtonRef.current?.focus();
  };
  const route = transportRoutes.find((candidate) => candidate.toCastleId === destination);
  const transportCommand = {
    type: 'transport' as const,
    clanId: model.playerClanId,
    fromCastleId: castleId,
    toCastleId: destination as CastleId,
    soldiers,
    gold,
    food,
  };
  const transportGoldAvailable = game ? (treasuryForCastle(game, castleId)?.gold ?? 0) : 0;
  const transportValidation = game === null ? null : validateCommand(game, transportCommand);
  const transportQueued = () =>
    game !== null &&
    getQueuedPlayerCommands(game).some(
      (command) =>
        command.type === 'transport' &&
        command.fromCastleId === castleId &&
        command.toCastleId === destination &&
        command.food === food &&
        command.gold === gold &&
        command.soldiers === soldiers,
    );
  const transportDisabled = !owned || !route || !transportValidation?.ok || transportQueued();
  const slotCount = model.castle.tier === 'main' ? BAL.mainCastleSlots : BAL.branchCastleSlots;
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
  const removalPending = () =>
    game &&
    getQueuedPlayerCommands(game).some(
      (cmd) =>
        (cmd.type === 'cancelBuild' || cmd.type === 'demolishFacility') &&
        cmd.castleId === castleId,
    );
  const openRemoval = (command: RemovalCommand) => {
    if (
      !game ||
      store.getState().game !== game ||
      !currentForm ||
      formOwner.current.castleId !== castleId ||
      store.getState().session.viewportBlocked ||
      currentRemoval.current ||
      removalPending()
    )
      return;
    const validation = validateCommand(game, command);
    if (!validation.ok) {
      setBuildFeedback(t(validation.reasonKey, validation.params));
      return;
    }
    const order =
      command.type === 'cancelBuild'
        ? game.castles[castleId]!.buildQueue[command.queueIndex]!
        : null;
    const facilityId =
      command.type === 'demolishFacility' ? command.facilityTypeId : order!.facilityTypeId;
    const request: RemovalRequest = {
      game,
      command,
      order,
      name: t(FACILITIES[facilityId]!.nameKey),
      token: `${buildOwner}-remove-${++buildSequence.current}`,
    };
    currentRemoval.current = request;
    setRemovalRequest(request);
    setBuildFeedback(null);
    uiStore.getState().actions.enqueueModal({
      id: 'confirm',
      params: { owner: 'castleFacilityRemoval', token: request.token, castleId },
      pausesTime: false,
    });
  };
  const finishRemoval = (request: RemovalRequest, confirm: boolean) => {
    if (
      currentRemoval.current !== request ||
      store.getState().game !== request.game ||
      formOwner.current.game !== request.game ||
      formOwner.current.castleId !== request.command.castleId ||
      !matchesRemoval(uiStore.getState().modal, request) ||
      store.getState().session.viewportBlocked
    )
      return;
    if (confirm) {
      const sameOrder =
        request.command.type !== 'cancelBuild' ||
        request.game.castles[castleId]?.buildQueue[request.command.queueIndex] === request.order;
      const validation = validateCommand(request.game, request.command);
      if (!sameOrder || removalPending()) setBuildFeedback(t('cmd.reject.invalidTarget'));
      else if (!validation.ok) setBuildFeedback(t(validation.reasonKey, validation.params));
      else submit(request.command);
    }
    currentRemoval.current = null;
    removeRemoval(request);
    setRemovalRequest(null);
  };
  const openBuild = (command: BuildRequest['command']) => {
    if (
      !game ||
      store.getState().game !== game ||
      !currentForm ||
      formOwner.current.castleId !== castleId ||
      store.getState().session.viewportBlocked
    )
      return;
    const validation = validateBuildFacility(game, command);
    if (!validation.ok) {
      setBuildFeedback(
        t(validation.reasonKey, {
          cost: FACILITIES[command.facilityTypeId]!.costGold,
          ...validation.params,
        }),
      );
      return;
    }
    if (currentBuildRequest.current) return;
    setBuildFeedback(null);
    const request = { game, command, token: `${buildOwner}-${++buildSequence.current}` };
    currentBuildRequest.current = request;
    setBuildRequest(request);
    uiStore.getState().actions.enqueueModal({
      id: 'confirm',
      params: { owner: 'castleBuild', token: request.token, castleId },
      pausesTime: false,
    });
  };
  const finishBuild = (request: BuildRequest, confirm: boolean) => {
    if (
      currentBuildRequest.current !== request ||
      store.getState().game !== request.game ||
      formOwner.current.game !== request.game ||
      formOwner.current.castleId !== request.command.castleId ||
      !matchesBuildRequest(uiStore.getState().modal, request) ||
      store.getState().session.viewportBlocked
    )
      return;
    if (confirm) {
      const validation = validateBuildFacility(request.game, request.command);
      if (!validation.ok)
        setBuildFeedback(
          t(validation.reasonKey, {
            cost: FACILITIES[request.command.facilityTypeId]!.costGold,
            ...validation.params,
          }),
        );
      else submit(request.command);
    }
    currentBuildRequest.current = null;
    removeBuildRequest(request);
    setBuildRequest(null);
  };
  const openDistrict = (districtId: DistrictId) => {
    if (onOpenDistrict) return onOpenDistrict(districtId);
    uiStore.getState().actions.setSelection({ kind: 'district', id: districtId });
    uiStore.getState().actions.openPanel('district', { districtId });
  };
  const close = () => {
    if (activeRecruitOwner.current !== recruitOwner) return;
    activeRecruitOwner.current = null;
    if (onClose) onClose();
    else uiStore.getState().actions.closePanelById('castle');
  };
  const openLocalRonin = () => {
    const current = store.getState();
    if (
      activeRecruitOwner.current !== recruitOwner ||
      current.game !== game ||
      !game ||
      current.session.screen !== 'main' ||
      current.session.fatalError ||
      current.session.viewportBlocked ||
      game.meta.gameOver !== null ||
      uiStore.getState().modal !== null ||
      document.querySelector('[data-ui-dialog]') !== null ||
      game.castles[castleId]?.ownerClanId !== game.meta.playerClanId
    )
      return;
    uiStore.getState().actions.openPanel('ronin', { castleId });
  };
  const openMarch = () => {
    if (!ownsMarchSelection()) return;
    const selected = selectedMarchIds;
    if (onOpenMarch) return onOpenMarch(castleId, selected);
    const draft = createMarchDraft(game!, castleId, selected);
    if (draft === null) return;
    uiStore.getState().actions.setMarchDraft(draft);
    if (!ownsMarchSelection() || uiStore.getState().marchDraft !== draft) {
      if (uiStore.getState().marchDraft === draft) uiStore.getState().actions.setMarchDraft(null);
      return;
    }
    uiStore
      .getState()
      .actions.enqueueModal({ id: 'march', params: { castleId }, pausesTime: false });
  };

  const tabs = [
    { id: 'overview', label: t('ui.castle.tab.overview') },
    { id: 'domestic', label: t('ui.castle.tab.domestic'), disabled: !owned },
    {
      id: 'military',
      label: t('ui.castle.tab.military'),
      disabled: !owned && model.activeArmies.length === 0,
    },
    {
      id: 'transport',
      label: t('ui.castle.tab.transport'),
      disabled: !owned && transportOrders.length === 0,
    },
  ];

  return (
    <aside
      ref={panelRef}
      className={`${styles.anchor}${activeTab === 'transport' ? ` ${styles.transportActive}` : ''}${activeTab === 'military' ? ` ${styles.militaryActive}` : ''}`}
      data-testid="castle-panel"
    >
      <Panel
        title={t('ui.castle.title', {
          castle: model.castle.name,
          clan: model.clanName,
          tier: model.castle.tier === 'main' ? t('ui.castle.mainSuffix') : '',
        })}
        onClose={close}
        variant="ornate"
      >
        {!owned && (
          <button
            type="button"
            onClick={() =>
              uiStore.getState().actions.openPanel('plot', {
                kind: 'betrayal',
                targetClanId: model.castle.ownerClanId,
                targetId: castleId,
              })
            }
          >
            {t('ui.plot.title')}
          </button>
        )}
        <TabView
          tabs={tabs}
          activeId={activeTab}
          onChange={(id) => selectTab(id as TabId)}
          keepMounted
          sticky
        >
          <TabView.Pane id="overview">
            <div className={styles.page}>
              <section>
                <h3>{t('ui.castle.lord')}</h3>
                <button
                  ref={lordButtonRef}
                  type="button"
                  aria-label={t('ui.castle.lord')}
                  aria-expanded={lordEditing && currentForm}
                  style={{ minHeight: 32 }}
                  disabled={!currentForm || !lordGate?.ok}
                  title={
                    lordGate && !lordGate.ok
                      ? lordReason(lordGate.reasonKey, lordGate.params)
                      : undefined
                  }
                  onClick={() => {
                    if (!ownsLordInteraction() || !lordGate?.ok) return;
                    setLordChoice(null);
                    setLordError(null);
                    setLordEditing(true);
                  }}
                >
                  {model.lord ? t('ui.castle.lordStats', model.lord) : t('ui.castle.vacant')}
                </button>
                {lordEditing && currentForm && (
                  <div>
                    <label>
                      {t('ui.castle.lord')}
                      <select
                        data-castle-lord-select
                        aria-label={t('ui.castle.lord')}
                        style={{ minHeight: 32 }}
                        value={lordChoice ?? ''}
                        disabled={!lordGate?.ok}
                        onChange={(event) => {
                          setLordChoice((event.currentTarget.value as OfficerId) || null);
                          setLordError(null);
                        }}
                      >
                        <option value="">{t('ui.common.select')}</option>
                        {lordCandidates.map((officer) => (
                          <option key={officer.id} value={officer.id}>
                            {officer.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      style={{ minHeight: 32 }}
                      disabled={lordChoice === null || !lordValidation?.ok}
                      title={
                        lordValidation && !lordValidation.ok
                          ? lordReason(lordValidation.reasonKey, lordValidation.params)
                          : undefined
                      }
                      onClick={() => {
                        const currentGame = store.getState().game;
                        if (!ownsLordInteraction() || !currentGame || lordChoice === null) return;
                        const validation = validateAppointLord(currentGame, lordCommand);
                        if (!validation.ok) {
                          setLordError(lordReason(validation.reasonKey, validation.params));
                          return;
                        }
                        const result = onCommand(lordCommand);
                        if (result && !result.ok) {
                          setLordError(lordReason(result.reason));
                          return;
                        }
                        closeLordEditor();
                      }}
                    >
                      {t('ui.officer.appointLord')}
                    </button>
                    <button type="button" style={{ minHeight: 32 }} onClick={closeLordEditor}>
                      {t('ui.common.cancel')}
                    </button>
                    {lordError && (
                      <p role="alert" className={styles.error}>
                        {lordError}
                      </p>
                    )}
                  </div>
                )}
              </section>
              <CastleLordDismissPane castleId={castleId} onCommand={onCommand} />
              <CastleControlPane castleId={castleId} onCommand={onCommand} />
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
            <div className={`${styles.page} ${styles.domesticPage}`}>
              {owned && (
                <section className={styles.roninSummary}>
                  <h3>{t('ui.castle.roninTitle')}</h3>
                  <p>
                    {model.localAdultRoninCount > 0
                      ? t('ui.castle.roninCount', { count: model.localAdultRoninCount })
                      : t('ui.castle.roninEmpty')}
                  </p>
                  <button type="button" onClick={openLocalRonin}>
                    {t('ui.castle.openRonin')}
                  </button>
                </section>
              )}
              <section>
                <h3>{t('ui.castle.facilitySlots', { count: slotCount })}</h3>
                <div className={styles.slots}>
                  {Array.from({ length: slotCount }, (_, index) => {
                    const id = model.castle.facilities[index];
                    const queued = model.castle.buildQueue[index - model.castle.facilities.length];
                    const removalCommand: RemovalCommand | null = id
                      ? {
                          type: 'demolishFacility',
                          clanId: model.playerClanId,
                          castleId,
                          facilityTypeId: id,
                        }
                      : queued
                        ? {
                            type: 'cancelBuild',
                            clanId: model.playerClanId,
                            castleId,
                            queueIndex: index - model.castle.facilities.length,
                          }
                        : null;
                    const removalValidation =
                      game && removalCommand ? validateCommand(game, removalCommand) : null;
                    return (
                      <button
                        type="button"
                        key={index}
                        onClick={() => {
                          if (id)
                            openRemoval({
                              type: 'demolishFacility',
                              clanId: model.playerClanId,
                              castleId,
                              facilityTypeId: id,
                            });
                          else if (queued)
                            openRemoval({
                              type: 'cancelBuild',
                              clanId: model.playerClanId,
                              castleId,
                              queueIndex: index - model.castle.facilities.length,
                            });
                          else setShowBuildMenu(true);
                        }}
                        aria-label={
                          id
                            ? `${t('ui.facility.demolish')} ${t(FACILITIES[id]?.nameKey ?? id)}`
                            : queued
                              ? `${t('ui.facility.cancelBuild')} ${t(FACILITIES[queued.facilityTypeId]?.nameKey ?? queued.facilityTypeId)}`
                              : undefined
                        }
                        disabled={Boolean(
                          removalCommand && (removalPending() || !removalValidation?.ok),
                        )}
                        title={
                          removalCommand && removalPending()
                            ? t('ui.command.pending', { count: 1 })
                            : removalValidation && !removalValidation.ok
                              ? t(removalValidation.reasonKey, removalValidation.params)
                              : undefined
                        }
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
                          openBuild({
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
                        disabled={
                          game === null ||
                          !validateCommand(game, {
                            type: 'setConscriptPolicy',
                            clanId: model.playerClanId,
                            castleId,
                            policy,
                          }).ok
                        }
                        onChange={() => {
                          if (!ownsDomesticInteraction() || game === null) return;
                          const command = {
                            type: 'setConscriptPolicy' as const,
                            clanId: model.playerClanId,
                            castleId,
                            policy,
                          };
                          const verdict = validateCommand(game, command);
                          if (!verdict.ok) return;
                          submit(command);
                        }}
                      />
                      {t(`term.conscript.${policy}`)}
                    </label>
                  ))}
                </div>
              </section>
              <RiceTradePane castleId={castleId} onCommand={onCommand} />
            </div>
          </TabView.Pane>
          <TabView.Pane id="military">
            <div className={styles.page}>
              {owned && (
                <>
                  <Meter
                    label={t('ui.castle.soldiers')}
                    value={model.castle.soldiers}
                    max={model.maxSoldiers}
                  />
                  <Meter label={t('ui.castle.morale')} value={model.castle.morale} max={100} />
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={openMarch}
                    disabled={!model.marchControllable}
                  >
                    {t('ui.castle.deploy')}
                  </button>
                  <section>
                    <h3>
                      {t('ui.castle.availableOfficers', {
                        count: model.marchControllable
                          ? model.officers.filter((officer) => officer.marchEligible).length
                          : 0,
                      })}
                    </h3>
                    {model.officers.map((officer) => (
                      <label key={officer.id} className={styles.marchOfficer}>
                        <input
                          type="checkbox"
                          checked={selectedMarchIds.includes(officer.id)}
                          disabled={
                            !model.marchControllable ||
                            !officer.marchEligible ||
                            (!selectedMarchIds.includes(officer.id) &&
                              selectedMarchIds.length >= 1 + BAL.maxDeputies)
                          }
                          onChange={() => {
                            if (
                              !ownsMarchSelection() ||
                              !marchOfficerEligible(game!, castleId, officer.id)
                            )
                              return;
                            const ids = selectedMarchIds.includes(officer.id)
                              ? selectedMarchIds.filter((id) => id !== officer.id)
                              : [...selectedMarchIds, officer.id].slice(0, 1 + BAL.maxDeputies);
                            const next = { owner: recruitOwner, ids };
                            currentMarchSelection.current = next;
                            setMarchSelection(next);
                          }}
                        />
                        {t('ui.castle.officerStats', {
                          name: officer.name,
                          ldr: officer.ldr,
                          val: officer.val,
                        })}
                        {selectedMarchIds.includes(officer.id) && (
                          <strong>
                            {t(
                              selectedMarchIds[0] === officer.id
                                ? 'ui.march.leader'
                                : 'ui.march.sub',
                            )}
                          </strong>
                        )}
                      </label>
                    ))}
                  </section>
                </>
              )}
              <section>
                <h3>{t('ui.castle.armiesInTransit', { count: model.activeArmies.length })}</h3>
                {model.activeArmies.map((army) => (
                  <button
                    type="button"
                    key={army.id}
                    data-testid={`castle-army-${army.id}`}
                    disabled={onSelectArmy === undefined}
                    style={{ minHeight: 32, minWidth: 32 }}
                    onClick={() => {
                      const current = store.getState();
                      const selected = current.game?.armies[army.id];
                      if (
                        current.game === null ||
                        current.game !== game ||
                        selected === undefined ||
                        selected !== army.identity ||
                        selected.clanId !== current.game.meta.playerClanId ||
                        selected.originCastleId !== castleId ||
                        current.session.viewportBlocked ||
                        uiStore.getState().modal !== null ||
                        document.querySelector('[data-ui-dialog]') !== null
                      )
                        return;
                      onSelectArmy?.(army.id, army.identity);
                    }}
                  >
                    {t('ui.castle.armyRow', {
                      name: army.leaderName,
                      soldiers: army.soldiers,
                      target: army.target ?? t('ui.common.none'),
                    })}
                  </button>
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
                  data-testid="transport-destination"
                  disabled={!owned}
                  value={route ? destination : ''}
                  onChange={(event) => {
                    if (event.currentTarget.value !== destination) transportRevision.current += 1;
                    setTransportTo(event.currentTarget.value);
                  }}
                >
                  <option value="">{t('ui.common.choose')}</option>
                  {transportRoutes.map((castle) => (
                    <option value={castle.toCastleId} key={castle.toCastleId}>
                      {castle.toName}
                    </option>
                  ))}
                </select>
              </label>
              <NumberSlider
                label={t('ui.castle.food')}
                min={0}
                max={model.castle.food}
                step={UI.uiMarchFoodStep}
                value={food}
                unit={t('term.unit.koku')}
                onChange={(value) => {
                  if (value !== food) transportRevision.current += 1;
                  setTransportFood(value);
                }}
              />
              <NumberSlider
                label={t('ui.hud.gold')}
                min={0}
                max={transportGoldAvailable}
                step={1}
                value={gold}
                unit={t('term.unit.gold')}
                onChange={(value) => {
                  if (value !== gold) transportRevision.current += 1;
                  setTransportGold(value);
                }}
              />
              <NumberSlider
                label={t('ui.castle.soldiers')}
                min={0}
                max={model.castle.soldiers}
                step={UI.uiMarchSoldierStep}
                value={soldiers}
                unit={t('term.unit.people')}
                onChange={(value) => {
                  if (value !== soldiers) transportRevision.current += 1;
                  setTransportSoldiers(value);
                }}
              />
              {route ? (
                <p data-testid="transport-preview">
                  {t('ui.transport.preview', {
                    days: route.estimatedDays,
                    path: route.nodeNames.join(' → '),
                  })}
                </p>
              ) : (
                <p data-testid="transport-preview">{t('ui.transport.noRoute')}</p>
              )}
              <button
                type="button"
                className={styles.primary}
                data-testid="transport-execute"
                disabled={transportDisabled}
                title={
                  transportValidation && !transportValidation.ok
                    ? t(transportValidation.reasonKey, {
                        cost:
                          transportValidation.reasonKey === 'cmd.reject.insufficientFood'
                            ? food
                            : gold,
                        count: soldiers,
                        ...transportValidation.params,
                      })
                    : undefined
                }
                onClick={() => {
                  const currentGame = store.getState().game;
                  if (
                    ownsDomesticInteraction() &&
                    formOwner.current.game === game &&
                    formOwner.current.castleId === castleId &&
                    transportRevision.current === renderedTransportRevision &&
                    !transportQueued() &&
                    route &&
                    currentGame &&
                    validateCommand(currentGame, transportCommand).ok
                  ) {
                    transportRevision.current += 1;
                    const result = onCommand(transportCommand);
                    if (
                      ownsDomesticInteraction() &&
                      transportRevision.current === renderedTransportRevision + 1
                    )
                      setFeedback(result && !result.ok ? result.reason : null);
                  }
                }}
              >
                {t('ui.transport.execute')}
              </button>
              {
                <section
                  className={styles.transportOrders}
                  aria-label={t('ui.transport.active')}
                  data-testid="transport-active-list"
                >
                  <h3>{t('ui.transport.active')}</h3>
                  {transportOrders.length === 0 && <p>{t('ui.transport.empty')}</p>}
                  {transportOrders.map((order) => {
                    const queued = hasQueuedTransportRecall(model.playerClanId, order.id);
                    const recall = {
                      type: 'recallTransport' as const,
                      clanId: model.playerClanId,
                      transportId: order.id,
                    };
                    const validation = game ? validateRecallTransport(game, recall) : null;
                    const position =
                      order.position.kind === 'node'
                        ? order.position.name
                        : order.position.kind === 'edge'
                          ? t('ui.transport.edgePosition', {
                              from: order.position.aName,
                              to: order.position.bName,
                            })
                          : t('ui.transport.unknownPosition');
                    return (
                      <article
                        key={order.id}
                        className={styles.transportOrder}
                        data-testid={`transport-order-${order.id}`}
                      >
                        <strong>
                          {order.fromName} → {order.toName}
                        </strong>
                        <p>
                          {t('ui.transport.cargo', {
                            soldiers: order.soldiers,
                            food: order.food,
                            gold: order.gold,
                          })}
                        </p>
                        <p data-testid={`transport-status-${order.id}`}>
                          {order.returning
                            ? t('ui.transport.returning')
                            : queued
                              ? t('ui.transport.recallQueued')
                              : t('ui.transport.outbound')}
                        </p>
                        <p>{t('ui.transport.position', { position })}</p>
                        <button
                          type="button"
                          data-testid={`transport-recall-${order.id}`}
                          disabled={!currentForm || queued || !order.canRecall || !validation?.ok}
                          title={
                            validation && !validation.ok
                              ? t(validation.reasonKey, validation.params)
                              : undefined
                          }
                          onClick={() => {
                            const currentGame = store.getState().game;
                            if (
                              currentGame !== game ||
                              !currentGame ||
                              currentGame.transports[order.id]?.fromCastleId !== castleId ||
                              hasQueuedTransportRecall(model.playerClanId, order.id) ||
                              !validateRecallTransport(currentGame, recall).ok
                            )
                              return;
                            submit(recall);
                          }}
                        >
                          {t('ui.transport.recall')}
                        </button>
                      </article>
                    );
                  })}
                </section>
              }
            </div>
          </TabView.Pane>
        </TabView>
        {feedback && (
          <p role="alert" className={styles.error}>
            {t(feedback)}
          </p>
        )}
        {buildFeedback && (
          <p role="alert" className={styles.error}>
            {buildFeedback}
          </p>
        )}
      </Panel>
      {removalRequest &&
        removalRequest.game === game &&
        removalRequest.command.castleId === castleId &&
        matchesRemoval(modal, removalRequest) && (
          <ConfirmDialog
            open
            danger
            title={t(
              removalRequest.command.type === 'demolishFacility'
                ? 'ui.facility.demolish'
                : 'ui.facility.cancelBuild',
            )}
            message={t(
              removalRequest.command.type === 'demolishFacility'
                ? 'ui.facility.demolishConfirm'
                : 'ui.facility.cancelConfirm',
              {
                name: removalRequest.name,
                refund: Math.floor(
                  (removalRequest.order
                    ? FACILITIES[removalRequest.order.facilityTypeId]!.costGold
                    : 0) * BAL.buildRefundRate,
                ),
              },
            )}
            onConfirm={() => finishRemoval(removalRequest, true)}
            onCancel={() => finishRemoval(removalRequest, false)}
          />
        )}
      {buildRequest &&
        buildRequest.game === game &&
        buildRequest.command.castleId === castleId &&
        matchesBuildRequest(modal, buildRequest) && (
          <ConfirmDialog
            open
            title={t('ui.castle.buildMenu')}
            message={
              <>
                <p>{t(FACILITIES[buildRequest.command.facilityTypeId]!.nameKey)}</p>
                <p>
                  {t('ui.common.goldAmount', {
                    value: FACILITIES[buildRequest.command.facilityTypeId]!.costGold,
                  })}
                </p>
                <p>
                  {t('ui.common.dayAmount', {
                    value: FACILITIES[buildRequest.command.facilityTypeId]!.buildDays,
                  })}
                </p>
              </>
            }
            onConfirm={() => finishBuild(buildRequest, true)}
            onCancel={() => finishBuild(buildRequest, false)}
          />
        )}
    </aside>
  );
}
