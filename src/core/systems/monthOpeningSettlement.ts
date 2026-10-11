import type { ClanId } from '../state/ids';

/** Actual gold flows only, bounded to monthlyIncomeAndUpkeep; not a whole-month ledger. */
export interface ClanMonthOpeningSettlement {
  readonly clanId: ClanId;
  readonly goldBefore: number;
  readonly goldAfter: number;
  /** Actual clan-wallet income, including flat grants and excluding retained corps shares. */
  readonly incomeGold: number;
  readonly retainedCorpsGold: number;
  readonly tributePaid: number;
  readonly tributeReceived: number;
  readonly salaryDue: number;
  readonly salaryPaid: number;
  readonly policyPaid: number;
}

export interface MonthOpeningSettlement {
  /** Absolute simulation day. */
  readonly day: number;
  readonly year: number;
  readonly month: number;
  readonly dayOfMonth: number;
  readonly clans: readonly ClanMonthOpeningSettlement[];
}
