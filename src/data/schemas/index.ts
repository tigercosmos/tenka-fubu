// 匯出全部 schema 與型別。
// 規格：plan/14-scenario-data.md §4（全部子章節）。單一出口，供 tools/validate.ts（M2-2）、
// builder 資料側（M2-8）、劇本 index.ts（M2-9 起）與測試共用。
export * from './common';
export * from './province';
export * from './castle';
export * from './district';
export * from './diplomacy';
export * from './clan';
export * from './officer';
export * from './event';
export * from './trait';
export * from './tactic';
export * from './policy';
export * from './persona';
export * from './road';
export * from './scenario';
