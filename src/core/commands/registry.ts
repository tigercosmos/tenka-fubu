// Command 驗證器／套用函式註冊表（validator/apply registry）。
// 規格：plan/03-game-loop.md §3.3.2（Validator 簽名）／§3.3.3（apply 原子性）／§3.3.4（擴充規則：
// 「登錄驗證器與 apply 函式」）／§4.2（ValidationResult）。
//
// 設計：註冊表以 CommandType 為鍵映射 { validate, apply }。M1-6 骨架僅登錄 03 專有的 debug 指令；
// 佇列型策略指令（05/06/07/08/10）之 handler 待各系統里程碑登錄（未登錄者由 validateCommand 回
// notImplemented 拒絕、不崩潰，見 §8-D14）。合戰內指令 battleMove/battleAttack/battleTactic/
// battleDelegate 不走提交佇列（§3.3.4），恆不登錄本表。

import type { GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import type { Command, CommandType, ValidationResult } from './types';
import {
  applyDebugGrant,
  applyDebugSkipDays,
  validateDebugGrant,
  validateDebugSkipDays,
} from './debugCommands';
import * as domestic from './domesticCommands';
import * as officers from './officerCommands';

/** tick 事件匯流排回呼：各步以此追加 GameEvent（03 §3.2.1）。 */
export type EmitFn = (event: GameEvent) => void;

/** 驗證器（03 §3.3.2）：純函式，禁改 state／消費亂數／讀 UI（§3.5.4 禁令 2）。 */
export type Validator<C extends Command> = (state: Readonly<GameState>, cmd: C) => ValidationResult;

/** 套用函式（03 §3.3.3）：僅於驗證通過後呼叫；就地修改 state、原子（全有或全無）、不得再失敗。 */
export type Applier<C extends Command> = (state: GameState, cmd: C, emit: EmitFn) => void;

export interface CommandHandler<C extends Command> {
  validate: Validator<C>;
  apply: Applier<C>;
}

/** CommandType → 其對應 Command 成員介面（discriminated union 反查）。 */
export type CommandByType = { [T in CommandType]: Extract<Command, { type: T }> };

/** 對 Command 全集操作之 handler（登錄表內部型別）；分派正確性由 cmd.type 判別保證。 */
type AnyHandler = CommandHandler<Command>;

/**
 * 型別安全登錄 helper：綁定單一 CommandType 之 validator/apply。
 * 各 handler 依其 narrowed 型別撰寫，存入以 Command 全集為介面的登錄表時需一次 cast——
 * correlated-union（函式參數逆變）之限制收斂於本單點，分派時 cmd.type 判別保證取到相符 handler。
 */
function defineHandler<T extends CommandType>(
  validate: Validator<CommandByType[T]>,
  apply: Applier<CommandByType[T]>,
): AnyHandler {
  return { validate, apply } as unknown as AnyHandler;
}

/** debug 指令型別集合（03 §3.9）；供 gameOver 中央閘門例外判定（validate.ts）。 */
const DEBUG_COMMAND_TYPES: ReadonlySet<CommandType> = new Set<CommandType>([
  'debugSkipDays',
  'debugGrant',
]);

/** 是否為 debug 指令（03 §3.9）：勝敗已判定時仍可套用（10 §5 例外）。 */
export function isDebugCommand(cmd: Command): boolean {
  return DEBUG_COMMAND_TYPES.has(cmd.type);
}

/** CommandType → handler 登錄表（M1-6 僅 debug 指令；擴充見檔頭與 §8-D14）。 */
const HANDLERS: Partial<Record<CommandType, AnyHandler>> = {
  grantFief: defineHandler<'grantFief'>(domestic.validateGrantFief, domestic.applyGrantFief),
  setDevelopFocus: defineHandler<'setDevelopFocus'>(
    domestic.validateSetDevelopFocus,
    domestic.applySetDevelopFocus,
  ),
  buildFacility: defineHandler<'buildFacility'>(
    domestic.validateBuildFacility,
    domestic.applyBuildFacility,
  ),
  cancelBuild: defineHandler<'cancelBuild'>(
    domestic.validateCancelBuild,
    domestic.applyCancelBuild,
  ),
  demolishFacility: defineHandler<'demolishFacility'>(
    domestic.validateDemolishFacility,
    domestic.applyDemolishFacility,
  ),
  setConscriptPolicy: defineHandler<'setConscriptPolicy'>(
    domestic.validateSetConscriptPolicy,
    domestic.applySetConscriptPolicy,
  ),
  transport: defineHandler<'transport'>(domestic.validateTransport, domestic.applyTransport),
  recallTransport: defineHandler<'recallTransport'>(
    domestic.validateRecallTransport,
    domestic.applyRecallTransport,
  ),
  tradeRice: defineHandler<'tradeRice'>(domestic.validateTradeRice, domestic.applyTradeRice),
  enactPolicy: defineHandler<'enactPolicy'>(
    domestic.validateEnactPolicy,
    domestic.applyEnactPolicy,
  ),
  revokePolicy: defineHandler<'revokePolicy'>(
    domestic.validateRevokePolicy,
    domestic.applyRevokePolicy,
  ),
  appointLord: defineHandler<'appointLord'>(
    domestic.validateAppointLord,
    domestic.applyAppointLord,
  ),
  setCastleControl: defineHandler<'setCastleControl'>(
    domestic.validateSetCastleControl,
    domestic.applySetCastleControl,
  ),
  promoteRank: defineHandler<'promoteRank'>(
    officers.validatePromoteRank,
    officers.applyPromoteRank,
  ),
  debugSkipDays: defineHandler<'debugSkipDays'>(validateDebugSkipDays, applyDebugSkipDays),
  debugGrant: defineHandler<'debugGrant'>(validateDebugGrant, applyDebugGrant),
};

/** 取指定 CommandType 之 handler；未登錄回 undefined（呼叫端據此判 notImplemented / fail-fast）。 */
export function getHandler(type: CommandType): AnyHandler | undefined {
  return HANDLERS[type];
}
