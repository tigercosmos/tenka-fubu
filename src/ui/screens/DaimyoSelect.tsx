// 大名選擇畫面（規格：plan/11-ui-screens.md §3.2.3 縮減版；18-roadmap.md M2-19「11-T2 縮減」）。
//
// M2-19 縮減：省略全國地圖預覽（04 簡化模式）、難易度下拉／種子輸入欄——難易度固定 'normal'、
// 種子省略即隨機（比照 M1-20 `startNewDemoGame` 精神），留待後續里程碑視需要補上（11 §3.2.3 完整
// 版）。可選勢力＝目前已載入批次（東海＋近畿，18 §8-D5；含織田，18-roadmap M2-19 驗收指定大名）。
// data-testid 依 plan/17-testing.md §6.2 契約：`clan-pick-{clanId}`／`newgame-start`；根節點比照
// `screen-*` 命名慣例新增 `screen-daimyo-select`。

import { useMemo, useState, type ReactElement } from 'react';
import { t, formatNumber } from '@i18n/zh-TW';
import {
  summarizeClans,
  buildNewGameState as buildNewGameStateReal,
  getScenarioTitle,
  type NewGameOptions,
} from '@app/boot';
import type { ScenarioBundleData } from '@data/schemas';
import type { GameState } from '@core/state/gameState';
import type { ClanId } from '@core/state/ids';

export interface DaimyoSelectProps {
  /** ScenarioSelectScreen 已載入之劇本資料束。 */
  bundle: ScenarioBundleData;
  onBack: () => void;
  /** 「開始遊戲」建局完成後呼叫，交由呼叫端 `setGame` 並轉場至 MainScreen。 */
  onStart: (game: GameState) => void;
  /** 供測試替換（預設走 `src/app/boot.ts` 的真實建局，含隨機種子）。 */
  buildNewGameState?: (bundle: ScenarioBundleData, opts: NewGameOptions) => GameState;
}

export function DaimyoSelect({
  bundle,
  onBack,
  onStart,
  buildNewGameState = buildNewGameStateReal,
}: DaimyoSelectProps): ReactElement {
  const summaries = useMemo(() => summarizeClans(bundle), [bundle]);
  const [selectedClanId, setSelectedClanId] = useState<ClanId | null>(null);

  const handleStart = (): void => {
    if (selectedClanId === null) return;
    const game = buildNewGameState(bundle, { playerClanId: selectedClanId, difficulty: 'normal' });
    onStart(game);
  };

  return (
    <div
      data-testid="screen-daimyo-select"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        padding: 'var(--space-8)',
        background: 'var(--ink-900)',
        color: 'var(--washi-100)',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>
          {t('ui.daimyo.title')}
          {'　'}
          {getScenarioTitle(bundle.id)}
        </h1>
        <button type="button" data-testid="daimyo-back" onClick={onBack}>
          {t('ui.newGame.back')}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {summaries.map((s) => (
          <button
            key={s.clanId}
            type="button"
            data-testid={`clan-pick-${s.clanId}`}
            aria-pressed={selectedClanId === s.clanId}
            onClick={() => setSelectedClanId(s.clanId)}
            style={{
              textAlign: 'left',
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              border:
                selectedClanId === s.clanId ? '2px solid var(--accent-gold)' : 'var(--border-thin)',
            }}
          >
            <span style={{ fontSize: 'var(--font-size-md)' }}>{s.name}</span>
            <span>
              {t('ui.daimyo.leader')}：{s.leaderName}
            </span>
            <span>
              {t('ui.daimyo.kokudaka')}：{formatNumber(s.kokudaka)}石
            </span>
            <span>
              {t('ui.daimyo.castles')}：{s.castleCount}
              {'　'}
              {t('ui.daimyo.officers')}：{s.officerCount}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        data-testid="newgame-start"
        disabled={selectedClanId === null}
        onClick={handleStart}
        style={{ alignSelf: 'flex-end', padding: 'var(--space-3) var(--space-6)' }}
      >
        {t('ui.newGame.start')}
      </button>
    </div>
  );
}
