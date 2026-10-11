// Saved intents are untrusted JSON, not necessarily currently legal orders.
// Entity existence, ownership, resources, cooldowns and debugMode belong to next-tick validation.
import type { Command, CommandType } from '../commands/types';
import {
  CAPTIVE_ACTION_VALUES,
  CONSCRIPT_POLICY_VALUES,
  CORPS_DIRECTIVE_VALUES,
  DEVELOP_FOCUS_VALUES,
  PACT_KIND_VALUES,
  PLOT_KIND_VALUES,
  REWARD_TIER_VALUES,
  SIEGE_MODE_VALUES,
} from '../state/enums';
import type { DiplomacyActionKind } from '../state/gameState';

type Check = (value: unknown) => boolean;
type Shapes = {
  [T in CommandType]: {
    [K in Exclude<keyof Extract<Command, { type: T }>, 'type' | 'clanId'>]: Check;
  };
};
const id: Check = (value) => typeof value === 'string' && value.length > 0;
const bool: Check = (value) => typeof value === 'boolean';
const integer: Check = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive: Check = (value) => integer(value) && (value as number) > 0;
// Debug grants intentionally retain their existing finite-number contract (03 §3.9.2),
// including signed/fractional grants; this guard does not invent a new cheat policy.
const finite: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const ids: Check = (value) => Array.isArray(value) && Array.from(value).every(id);
const values =
  (choices: readonly string[]): Check =>
  (value) =>
    typeof value === 'string' && choices.includes(value);
const DIPLOMACY_ACTIONS = [
  'proposeAlliance',
  'proposeCeasefire',
  'proposeMarriage',
  'demandVassal',
  'offerVassal',
  'requestReinforce',
] as const satisfies readonly DiplomacyActionKind[];
// Both discriminants and required fields are compile-time exhaustive against Command.
const SHAPES = {
  grantFief: { districtId: id, officerId: nullable(id) },
  setDevelopFocus: { districtId: id, focus: values(DEVELOP_FOCUS_VALUES) },
  buildFacility: { castleId: id, facilityTypeId: id },
  cancelBuild: { castleId: id, queueIndex: integer },
  demolishFacility: { castleId: id, facilityTypeId: id },
  setConscriptPolicy: { castleId: id, policy: values(CONSCRIPT_POLICY_VALUES) },
  transport: { fromCastleId: id, toCastleId: id, soldiers: integer, gold: integer, food: integer },
  recallTransport: { transportId: id },
  tradeRice: { castleId: id, mode: values(['buy', 'sell']), amount: positive },
  enactPolicy: { policyId: id },
  revokePolicy: { policyId: id },
  appointLord: { castleId: id, officerId: nullable(id) },
  setCastleControl: { castleId: id, directControl: bool },
  march: {
    originCastleId: id,
    leaderId: id,
    deputyIds: ids,
    soldiers: positive,
    food: integer,
    targetNodeId: id,
  },
  setArmyTarget: { armyId: id, targetNodeId: id },
  recallArmy: { armyId: id },
  returnArmyToCastle: { armyId: id, destinationCastleId: id },
  depositGarrison: { armyId: id, castleId: id, soldiers: integer, food: integer },
  setAutoReturn: { armyId: id, enabled: bool },
  startKassen: { fieldCombatId: id },
  battleMove: { battleId: id, unitId: id, targetJinId: id },
  battleAttack: { battleId: id, unitId: id, targetUnitId: id },
  battleTactic: { battleId: id, unitId: id, tacticId: id, targetUnitId: nullable(id) },
  battleDelegate: { battleId: id, unitId: id, enabled: bool },
  setSiegeMode: { siegeId: id, mode: values(SIEGE_MODE_VALUES) },
  useBetrayal: { siegeId: id },
  recruitRonin: { officerId: id, executorId: id },
  rewardOfficer: { officerId: id, tier: values(REWARD_TIER_VALUES) },
  handleCaptive: { officerId: id, action: values(CAPTIVE_ACTION_VALUES), executorId: nullable(id) },
  promoteRank: { officerId: id },
  startDiploWork: { target: id, executorId: id },
  stopDiploWork: { target: id },
  proposePact: {
    targetClanId: id,
    kind: values(DIPLOMACY_ACTIONS),
    reinforceAgainstClanId: nullable(id),
  },
  respondPact: { proposalId: id, accept: bool },
  breakPact: { targetClanId: id, kind: values(PACT_KIND_VALUES) },
  requestCourtRank: {},
  requestMediation: { targetClanId: id },
  requestShogunateTitle: {},
  nominateShogun: {},
  startPlot: {
    kind: values(PLOT_KIND_VALUES),
    executorId: id,
    targetClanId: id,
    targetOfficerId: nullable(id),
    targetCastleId: nullable(id),
    investGold: integer,
  },
  cancelPlot: { plotId: id },
  createCorps: {
    corpsLeaderId: id,
    castleIds: ids,
    directive: values(CORPS_DIRECTIVE_VALUES),
    targetNodeId: nullable(id),
  },
  setCorpsDirective: {
    corpsId: id,
    directive: values(CORPS_DIRECTIVE_VALUES),
    targetNodeId: nullable(id),
  },
  assignCastleToCorps: { castleId: id, corpsId: nullable(id) },
  dissolveCorps: { corpsId: id },
  resolveProposal: { proposalId: id, accept: bool },
  invokeTaimei: { taimeiId: id },
  resolveEventChoice: { eventId: id, choiceIndex: integer },
  debugSkipDays: { days: positive },
  debugGrant: { gold: nullable(finite), food: nullable(finite), castleId: nullable(id) },
} satisfies Shapes;

/** Structural guard for all commands; intentionally independent of GameState/current legality. */
export function isCommandShape(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  if (
    !Object.hasOwn(command, 'type') ||
    !Object.hasOwn(command, 'clanId') ||
    !id(command.clanId) ||
    typeof command.type !== 'string' ||
    !Object.hasOwn(SHAPES, command.type)
  )
    return false;
  const shape: Record<string, Check> = SHAPES[command.type as CommandType];
  // Authority is trusted out-of-band metadata, never an imported command field.
  if (
    Object.keys(command).some(
      (key) => key !== 'type' && key !== 'clanId' && !Object.hasOwn(shape, key),
    )
  )
    return false;
  return Object.entries(shape).every(
    ([key, check]) => Object.hasOwn(command, key) && check(command[key]),
  );
}

/** Bare saved player queue: no AI authority, no deduplication of legitimate repeated intents. */
export function validateSavedPendingCommands(
  value: unknown,
  playerClanId: string,
): value is Command[] {
  return (
    id(playerClanId) &&
    Array.isArray(value) &&
    Array.from(value).every((command) => isCommandShape(command) && command.clanId === playerClanId)
  );
}
