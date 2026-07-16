// Playwright 視覺回歸 gate（規格：plan/17-testing.md §3.9.3；M6-V2 任務範圍：
// `plan/18-roadmap.md` M6-V2 列——本檔只建立「固定 fixture＋截圖 harness＋三段縮放基準」，
// layer-presence smoke、dirty rebuild 計數、色弱／效能檢查與 `validate:assets` 屬 M6-V5／M6-V11，
// 尚未落地於此）。
//
// 以 `/?debug=visual-map` 載入固定 `buildVisualMapState()` fixture（`src/core/debugVisual.ts`），
// 依序切到三段鏡頭 preset（overview／operational／close；`TenkaDebugApi.setMapCameraPreset`，
// 見 `src/app/debug.ts`）並各拍一張截圖，與 repo 內固定基準比對。
//
// 平台守門：目前 repo 只承諾在「本機平台已存在對應 baseline」時才斷言 pixel diff；CI（linux）
// 尚無 baseline 前不紅燈，避免以佔位渲染畫面誤炸尚未產生基準的環境。基準以
// `npm run e2e:visual:update` 產生（見 package.json）。
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures';

// 比照 e2e/smoke.spec.ts P5：window.__tenka 僅在除錯模式下安裝（見 src/app/debug.ts
// `installDebugApi`），型別以此處內縮小宣告表達，不引入額外全域型別檔。
type DebugWindow = {
  __tenka: {
    debug: {
      waitMapIdle(frames?: number): Promise<void>;
      setMapCameraPreset(preset: 'overview' | 'operational' | 'close'): Promise<void>;
    };
  };
};

const CAMERA_PRESETS = ['overview', 'operational', 'close'] as const;

const SNAPSHOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'visual.spec.ts-snapshots',
);

// Playwright 預設 snapshotPathTemplate（未自訂 template，見 playwright.config.ts 註解）：
// `{arg}-{projectName}-{snapshotSuffix}{ext}`，`snapshotSuffix` 即 `process.platform`。
// 本 repo 只在 darwin（開發機）與 linux（CI）跑,故以此二擇一守門；win32 等其他平台一律視同
// 尚無 baseline（沿用「未設 UPDATE_VISUAL 則 skip」路徑）。
const BASELINE_PLATFORM = process.platform === 'darwin' ? 'darwin' : 'linux';
const FIRST_BASELINE = path.join(
  SNAPSHOT_DIR,
  `strategy-overview-chromium-${BASELINE_PLATFORM}.png`,
);

test.describe('M6-V2 視覺回歸（17 §3.9.3；固定 fixture 三段縮放基準）', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    // 此 Playwright 版本未曝露頂層 `reducedMotion` test option，改走
    // `contextOptions`（即 BrowserContextOptions，語意相同）。
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('overview／operational／close 三段鏡頭截圖與固定基準相符', async ({ page }) => {
    test.skip(
      !existsSync(FIRST_BASELINE) && process.env.UPDATE_VISUAL !== '1',
      `本平台（${BASELINE_PLATFORM}）尚無 visual baseline（${FIRST_BASELINE}），` +
        `執行 npm run e2e:visual:update 產生。`,
    );

    await page.goto('/?debug=visual-map');

    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // MapRenderer 於 Pixi `app.init`（async）完成後才向 debugMapBridge 登記；screen-strategy 可見與
    // fonts.ready 都不保證該登記已發生，直接呼叫 waitMapIdle 可能撞上「renderer 尚未掛載」而擲例外。
    // 以 expect.poll 反覆嘗試——成功即代表 renderer 已登記並已推進過連續 idle frame（不引入固定 sleep）。
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          try {
            await (window as unknown as DebugWindow).__tenka.debug.waitMapIdle();
            return true;
          } catch {
            return false;
          }
        }),
      )
      .toBe(true);

    for (const preset of CAMERA_PRESETS) {
      await page.evaluate(
        (p) => (window as unknown as DebugWindow).__tenka.debug.setMapCameraPreset(p),
        preset,
      );
      await expect(page).toHaveScreenshot(`strategy-${preset}.png`);
    }
  });
});
