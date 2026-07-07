# 14 — 劇本資料（Scenario Data：s1560「桶狹間前夜」）

> 遵循 `plan/00-foundations.md`（下稱 00）。本文件是「劇本資料 schema、s1560 內容規格、
> 分區製作管線、驗證工具」的單一真相來源（00 §7）。本文件是**資料製作的施工圖**：
> 依本文件即可產出全部 `src/data/scenarios/s1560/*.json` 並以 `tools/validate.ts` 驗收。

---

## 1. 目的與範圍

本文件定義：

1. s1560 劇本全部資料檔的 **zod schema**（§4）：`provinces.json`、`castles.json`、`districts.json`、
   `roads.json`、`clans.json`、`officers/{region}.json`（9 地方分檔）、`events.json`、
   `traits.json`、`policies.json`、`tactics.json`、`personas.json`。
2. **全域校準目標**與 9 地方（Region）製作配額表（§3.2）。
3. **大名 40 家＋足利將軍家**的完整清單：當主、本城、開局城數、勢力色 `colorIndex`、
   persona、1560 開局外交關係（§3.3）。
4. **東海地方完整範例資料**（可直接入 repo 的 JSON 片段；§3.5）——後續 8 地方的施工樣板。
5. 其餘 8 地方的**製作 checklist**（§3.6）與街道／海路連通要求（§3.7）。
6. **座標製作規範**與 20 個錨點城市對照表（§3.4）。
7. **浪人程序生成**規格（§3.8；02 §3.2 將此職責指派給本文件）。
8. `tools/validate.ts` 驗證器與 `tools/stats.ts` 統計報表規格（§5）。
9. 資料製作與驗收流程：9 批次順序、每批驗收標準與人工抽查表（§3.9、§7）。

**不在**本文件範圍：實體型別最終定義（`plan/02-data-model.md`）；roads.json 欄位語意與
投影公式（`plan/04-map-and-movement.md`）；特性／政策／戰法／persona 的**效果數值**
（分別為 `plan/06`／`plan/05`／`plan/07`／`plan/09`）；事件引擎語意與各事件效果定案
（`plan/10-events-and-victory.md`）；BAL 常數定案（`plan/15-balance.md`）。

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | §8 ID 與投影、§10 劇本規模為本文件的校準來源；本文件將其細化為配額與驗證規則。 |
| `plan/02-data-model.md` | 劇本欄位是 02 實體靜態欄位的**子集**；builder（02 §7）由劇本 JSON 補齊其餘欄位。 |
| `plan/04-map-and-movement.md` | `roads.json` 格式（04 §3.4.1）、outline 驗收（04 §3.3.4）、`District.isPort` 由 04 定義；本文件產出內容並執行其驗證規則。 |
| `plan/05-domestic.md` | `policies.json` 內容 = 05 §3.7.2 政策表；`fac.*` 型錄與 `Castle.coastal` 條件見 05。 |
| `plan/06-officers.md` | `traits.json` 內容 = 06 §3.3 特性表（30 筆）＋ 07 §8-D13 戰法解鎖特性（7 筆）。 |
| `plan/07-military.md` | `tactics.json` 內容 = 07 §3.8 戰法表（12 筆）；戰法解鎖特性 id 以 07 為準。 |
| `plan/09-ai.md` | `personas.json` 五軸數值 = 09 §3.2 建議值表；勢力清單以本文件 §3.3 為真相。 |
| `plan/10-events-and-victory.md` | `events.json` 的**資料格式**由本文件定義；15 個史實事件的觸發條件與效果數值定案於 10。 |
| `plan/12-ui-components.md` | `colorIndex` 色盤公式與釘選建議（12 §3.1.3/§5.1）；定案表在本文件 §3.3。 |
| `plan/15-balance.md` | 本文件引入的 `BAL.data*`／`BAL.ronin*` 常數在 15 定案。 |
| `plan/17-testing.md` | 簡體字黑名單掃描實作定義於 17；`tools/validate.ts` 重用之。 |

---

## 3. 設計細節

### 3.1 檔案清單與載入結構

全部檔案置於 `src/data/scenarios/s1560/`，UTF-8、JSON、由 `src/data/schemas/scenario.ts`
（§4）驗證。`index.ts` 彙整匯出（01 §建置：劇本以動態 import 載入，不進主 bundle）。

| 檔案 | 內容 | 筆數目標 |
|---|---|---:|
| `provinces.json` | 國（顯示分組） | 60 |
| `castles.json` | 城（全國一檔，依 region 註解分段） | 121 |
| `districts.json` | 郡（全國一檔） | ~343 |
| `roads.json` | 街道邊（格式＝04 §3.4.1） | ~450 |
| `clans.json` | 勢力 41 家＋開局外交 | 41 |
| `officers/tokai.json` 等 9 檔 | 具名武將（含未元服者與具名浪人） | ~625 |
| `events.json` | 史實事件 | 15 |
| `traits.json` | 特性清單（manifest，§8-D1） | 37 |
| `policies.json` | 政策清單（manifest） | 13 |
| `tactics.json` | 戰法清單（manifest） | 12 |
| `personas.json` | AI persona 五軸 | 41＋`persona.default` |

武將檔案歸屬規則：武將寫入**其所屬勢力本城所在地方**的檔案；浪人寫入**寄寓城所在地方**。
builder 載入時合併 9 檔，檔案切分只為製作分批，不影響執行期。

```ts
// src/data/scenarios/s1560/index.ts
import provinces from './provinces.json';
import castles from './castles.json';
// ...其餘同構
export const s1560 = {
  id: 's1560',
  provinces, castles, districts, roads, clans, events,
  officers: [tokai, kinki, kanto, koshinetsu, hokuriku, chugoku, shikoku, kyushu, tohoku],
  catalogs: { traits, policies, tactics, personas },
} as const;
```

### 3.2 全域校準目標與 9 地方配額表

全域目標（`tools/validate.ts` 以 `BAL.data*` 常數檢查，§5.4）：

| 項目 | 目標 | 驗證常數（建議值） |
|---|---|---|
| 全國總石高 | 17,500,000～18,500,000 石（基準 18,000,000） | `BAL.dataTotalKokudakaMin/Max` = 17_500_000 / 18_500_000 |
| 城 | 115～125（基準 121；本城 ~40／支城 ~81） | `BAL.dataCastleMin/Max` = 115 / 125 |
| 郡 | 330～370（基準 343） | `BAL.dataDistrictMin/Max` = 330 / 370 |
| 每城轄郡 | 2～4 | `BAL.dataDistrictsPerCastleMin/Max` = 2 / 4 |
| 具名武將 | 550～650（基準 625 = 家臣 610＋具名浪人 15） | `BAL.dataOfficerMin/Max` = 550 / 650 |
| 勢力 | 38～42（基準 41） | `BAL.dataClanMin/Max` = 38 / 42 |
| 國 | 60（§8-D4） | `BAL.dataProvinceCount` = 60 |

**9 地方配額表**（±10% 為合格區間；地方＝`Region` enum，02 §3.3）：

| 地方 | 城 | 郡 | 石高（萬石） | 占比 | 武將 | 轄下國（60 國之歸屬） |
|---|---:|---:|---:|---:|---:|---|
| 東海 tokai | 16 | 44 | 240 | 13.3% | 95 | 駿河、遠江、三河、尾張、美濃（含飛驒）、伊勢（含志摩・伊賀） |
| 近畿 kinki | 18 | 50 | 295 | 16.4% | 90 | 山城、大和、河內、和泉、攝津、近江、紀伊、丹波（含丹後）、但馬 |
| 關東 kanto | 16 | 48 | 275 | 15.3% | 75 | 常陸、下野、上野、下總、上總（含安房）、武藏、相模、伊豆 |
| 甲信越 koshinetsu | 9 | 27 | 155 | 8.6% | 70 | 甲斐、信濃、越後 |
| 北陸 hokuriku | 10 | 28 | 135 | 7.5% | 40 | 越前（含若狹）、加賀、能登、越中 |
| 中國 chugoku | 16 | 44 | 215 | 11.9% | 75 | 因幡、伯耆、出雲、石見、播磨、備前（含美作）、備中、備後、安藝、周防、長門 |
| 四國 shikoku | 8 | 22 | 95 | 5.3% | 40 | 阿波、讚岐、伊予、土佐 |
| 九州 kyushu | 14 | 40 | 180 | 10.0% | 75 | 筑前、筑後、豐前、豐後、肥前、肥後、日向、大隅、薩摩 |
| 東北 tohoku | 14 | 40 | 210 | 11.7% | 65 | 陸奧、陸中、陸前、岩代（含磐城）、羽前、羽後 |
| **合計** | **121** | **343** | **1,800** | 100% | **625** | 60 國 |

近畿列 9 國、東北列 6 國、其餘如表，合計 60（併合與分割理由見 §8-D4）。
郡石高製作公式：`郡石高 = round(地方石高配額 × 郡權重 / Σ地方內郡權重 / 100) × 100`
（百石為最小單位；郡權重依平野／港灣／山地取 1.5／1.2／0.7）。

其他郡欄位施工公式（製作準則，非執行期公式）：

```
population    = round(kokudaka × 0.33 / 100) × 100      // 港郡另 ×1.12；全國人口約 600 萬
populationCap = round(population × 1.5 / 500) × 500
kokudakaCap   = kokudaka × 1.4（百石取整）
commerce      = 山村 120..200；一般 200..320；城下 320..480；大湊（津島/熱田/堺/博多級）480..700
commerceCap   = min(round(commerce × 1.6 / 10) × 10, 2000)   // 上限見 BAL.commerceMaxAbs（02）
publicOrder   = 60（預設）；一向宗根據地 45；大湊 65
城 soldiers    = castleMaxSoldiers（02 §5.1）× 0.4..0.7（依勢力 aggression 高低）
城 food        = soldiers × 2.5（500 石取整）
勢力 gold      = clanKokudaka / 200（百貫取整）；大商業勢力（織田/三好/大友）×1.3
```

### 3.3 勢力清單（41 家）與開局外交

40 家大名＋足利將軍家（特殊勢力，`CourtState.shogunClanId` 引用之，02 §4.12；§8-D5）。
`personaId = persona.<clan slug>`（§4.11；五軸值 = 09 §3.2 表，未列者用 `persona.default`）。
`colorIndex` 為 12 §3.1.3 色盤索引定案值（釘選色沿用 12 建議；北條 21→20 之調整見 §8-D6）。

| clanId | 家名 | 當主 | 本城 | 城 | 武將 | colorIndex | 地方 |
|---|---|---|---|---:|---:|---:|---|
| `clan.oda` | 織田家 | 織田信長 | 清洲城 | 3 | 30 | 5 | 東海 |
| `clan.imagawa` | 今川家 | 今川義元 | 駿府館 | 6 | 25 | 31 | 東海 |
| `clan.matsudaira` | 松平家 | 松平元康 | 岡崎城 | 1 | 10 | 17 | 東海 |
| `clan.saito` | 齋藤家 | 齋藤義龍 | 稻葉山城 | 3 | 15 | 9 | 東海 |
| `clan.kitabatake` | 北畠家 | 北畠具教 | 霧山御所 | 2 | 10 | 13 | 東海 |
| `clan.azai` | 淺井家 | 淺井長政 | 小谷城 | 2 | 12 | 18 | 近畿 |
| `clan.asakura` | 朝倉家 | 朝倉義景 | 一乘谷城 | 4 | 15 | 22 | 北陸 |
| `clan.rokkaku` | 六角家 | 六角義賢 | 觀音寺城 | 2 | 12 | 26 | 近畿 |
| `clan.miyoshi` | 三好家 | 三好長慶 | 芥川山城 | 9 | 30 | 35 | 近畿 |
| `clan.tsutsui` | 筒井家 | 筒井順政 | 筒井城 | 1 | 8 | 1 | 近畿 |
| `clan.hatano` | 波多野家 | 波多野晴通 | 八上城 | 2 | 8 | 7 | 近畿 |
| `clan.honganji` | 本願寺家 | 本願寺顯如 | 石山御坊 | 5 | 15 | 30 | 近畿 |
| `clan.hatakeyama` | 畠山家（能登） | 畠山義綱 | 七尾城 | 2 | 8 | 14 | 北陸 |
| `clan.jinbo` | 神保家 | 神保長職 | 富山城 | 2 | 8 | 37 | 北陸 |
| `clan.takeda` | 武田家 | 武田信玄 | 躑躅崎館 | 5 | 35 | 0 | 甲信越 |
| `clan.nagao` | 長尾家 | 長尾景虎 | 春日山城 | 6 | 35 | 24 | 甲信越 |
| `clan.hojo` | 北條家 | 北條氏康 | 小田原城 | 7 | 35 | 20 | 關東 |
| `clan.satomi` | 里見家 | 里見義堯 | 久留里城 | 2 | 10 | 8 | 關東 |
| `clan.satake` | 佐竹家 | 佐竹義昭 | 太田城 | 2 | 12 | 16 | 關東 |
| `clan.utsunomiya` | 宇都宮家 | 宇都宮廣綱 | 宇都宮城 | 2 | 8 | 4 | 關東 |
| `clan.yuki` | 結城家 | 結城晴朝 | 結城城 | 1 | 8 | 28 | 關東 |
| `clan.date` | 伊達家 | 伊達晴宗 | 米澤城 | 3 | 25 | 38 | 東北 |
| `clan.ashina` | 蘆名家 | 蘆名盛氏 | 黑川城 | 3 | 12 | 11 | 東北 |
| `clan.mogami` | 最上家 | 最上義守 | 山形城 | 2 | 10 | 19 | 東北 |
| `clan.nanbu` | 南部家 | 南部晴政 | 三戶城 | 4 | 10 | 25 | 東北 |
| `clan.ando` | 安東家 | 安東愛季 | 檜山城 | 2 | 8 | 33 | 東北 |
| `clan.mori` | 毛利家 | 毛利元就 | 吉田郡山城 | 7 | 35 | 15 | 中國 |
| `clan.amago` | 尼子家 | 尼子晴久 | 月山富田城 | 4 | 18 | 23 | 中國 |
| `clan.yamana` | 山名家 | 山名祐豐 | 此隅山城 | 3 | 8 | 3 | 中國 |
| `clan.uragami` | 浦上家 | 浦上宗景 | 天神山城 | 2 | 8 | 29 | 中國 |
| `clan.akamatsu` | 赤松家 | 赤松晴政 | 置鹽城 | 2 | 8 | 12 | 中國 |
| `clan.chosokabe` | 長宗我部家 | 長宗我部國親 | 岡豐城 | 1 | 15 | 6 | 四國 |
| `clan.kono` | 河野家 | 河野通宣 | 湯築城 | 2 | 8 | 21 | 四國 |
| `clan.saionji` | 西園寺家 | 西園寺實充 | 黑瀨城 | 1 | 6 | 32 | 四國 |
| `clan.ichijo` | 一條家 | 一條兼定 | 中村御所 | 1 | 8 | 36 | 四國 |
| `clan.shimazu` | 島津家 | 島津貴久 | 內城 | 3 | 25 | 27 | 九州 |
| `clan.otomo` | 大友家 | 大友義鎮 | 府內館 | 6 | 25 | 34 | 九州 |
| `clan.ryuzoji` | 龍造寺家 | 龍造寺隆信 | 村中城 | 2 | 12 | 10 | 九州 |
| `clan.ito` | 伊東家 | 伊東義祐 | 都於郡城 | 2 | 8 | 39 | 九州 |
| `clan.sagara` | 相良家 | 相良義陽 | 人吉城 | 1 | 6 | 2 | 九州 |
| `clan.ashikaga` | 足利將軍家 | 足利義輝 | 二條御所 | 1 | 6 | 16 | 近畿 |

城數合計 121；武將數合計 610（另＋具名浪人 15 = 625）。城數欄含跨地方領有
（長尾：越後 4＋信濃 1＋上野 2；三好：近畿 6＋阿波讚岐 3；本願寺：攝津 1＋紀伊 1＋伊勢 1＋加賀 2；
山名：但馬 2＋因幡 1；大友：豐後 2＋豐前 1＋筑前 1＋筑後 1＋肥後 1）。
41 家用 40 色，唯一重複：`clan.ashikaga` 與 `clan.satake` 共用 16（山城／常陸不相鄰；§8-D6）。

**開局外交關係**（寫入 `clans.json` 的 `diplomacy` 區塊；欄位見 §4.5）。
交戰 = `lastHostileDay: 0`（08 §3.1：atWar 由最近敵對行為推導）；
協定 `months` 為剩餘月數（builder 換算 `endDay = months × 30`）：

| 類別 | 雙方 | 參數 | 史實依據 |
|---|---|---|---|
| 同盟＋婚姻 | 武田—今川 | 同盟 48 月；婚姻無期限 | 甲相駿三國同盟（1554） |
| 同盟＋婚姻 | 武田—北條 | 同上 | 同上 |
| 同盟＋婚姻 | 今川—北條 | 同上 | 同上 |
| 婚姻 | 武田—本願寺 | 無期限 | 三條家姻戚 |
| 婚姻 | 伊達—最上 | 無期限 | 義守室為伊達氏 |
| 從屬 | 松平 →（從屬）今川 | 無期限，`vassalClanId: clan.matsudaira` | 元康寄駿府（§8-D3） |
| 交戰 | 織田—今川 | lastHostileDay 0 | 鳴海・大高攻防 |
| 交戰 | 織田—齋藤 | 同 | 道三死後敵對 |
| 交戰 | 長尾—武田 | 同 | 川中島 |
| 交戰 | 長尾—北條 | 同 | 1560 關東出兵 |
| 交戰 | 里見—北條 | 同 | 久留里攻防 |
| 交戰 | 淺井—六角 | 同 | 野良田之戰 |
| 交戰 | 毛利—尼子 | 同 | 石見銀山攻防 |
| 交戰 | 毛利—大友 | 同 | 門司城之戰 |
| 交戰 | 龍造寺—大友 | 同 | 肥前攻防 |
| 交戰 | 伊東—島津 | 同 | 飫肥攻防 |
| 交戰 | 安東—南部 | 同 | 鹿角郡爭奪 |

感情覆寫（`sentiments`；預設 50，02 §5.5）：織田—齋藤 20/20、三好—足利 30/30、
朝倉—本願寺 35/35、淺井—朝倉 80/80、長宗我部—一條 75/75、蘆名—伊達 65/65、
武田—長尾 15/15、尼子—山名 40/40、相良—島津 45/45、河野—毛利 70/70、大友—毛利 25/25。

### 3.4 座標製作規範與 20 錨點對照表

- 全部 `pos` 用 00 §8 投影公式（實作 `lonLatToWorld`，04 §3.2）由近似經緯度換算，**整數**。
- 製作流程：先查目標城／郡治所的經緯度（小數 2 位即可）→ 代入公式 → 與下表最近錨點目視
  比對相對方位 → 郡節點與所轄城距離取 40～180 world unit，避免與他節點 < 24。
- 下表 20 錨點為**驗證基準**：這些城的資料座標與表值誤差 ≤ `BAL.dataAnchorTolerance`（16）
  world unit（§5.4 檢查）。其餘城郡以錨點內插。

| # | 錨點（城） | lon | lat | x | y |
|---|---|---|---|---:|---:|
| 1 | 京都・二條御所 | 135.77 | 35.01 | 1701 | 2889 |
| 2 | 清洲城 | 136.90 | 35.20 | 1966 | 2838 |
| 3 | 那古野城 | 136.91 | 35.18 | 1968 | 2843 |
| 4 | 岡崎城 | 137.17 | 34.95 | 2029 | 2905 |
| 5 | 駿府館 | 138.38 | 34.98 | 2312 | 2897 |
| 6 | 小田原城 | 139.15 | 35.26 | 2493 | 2822 |
| 7 | 江戶城 | 139.70 | 35.68 | 2621 | 2709 |
| 8 | 躑躅崎館 | 138.57 | 35.67 | 2357 | 2712 |
| 9 | 春日山城 | 138.25 | 37.15 | 2282 | 2316 |
| 10 | 稻葉山城 | 136.78 | 35.44 | 1938 | 2774 |
| 11 | 觀音寺城 | 136.13 | 35.15 | 1786 | 2851 |
| 12 | 石山御坊 | 135.51 | 34.68 | 1641 | 2977 |
| 13 | 一乘谷城 | 136.24 | 36.02 | 1812 | 2618 |
| 14 | 米澤城 | 140.12 | 37.92 | 2720 | 2110 |
| 15 | 吉田郡山城 | 132.70 | 34.67 | 983 | 2980 |
| 16 | 月山富田城 | 133.24 | 35.38 | 1109 | 2790 |
| 17 | 湯築城 | 132.77 | 33.84 | 999 | 3202 |
| 18 | 岡豐城 | 133.64 | 33.60 | 1203 | 3266 |
| 19 | 府內館 | 131.61 | 33.24 | 728 | 3362 |
| 20 | 內城（鹿兒島） | 130.55 | 31.60 | 480 | 3801 |

（1、2、7、20 取自 04 §3.2 錨點表原值；四捨五入差 ±1 world unit 視為一致。）

### 3.5 東海地方完整範例資料（施工樣板）

以下 JSON 片段可直接放入 repo；是其餘 8 地方的**格式與密度樣板**。
涵蓋織田家、今川家、松平家全套（齋藤、北畠依 §3.6 checklist 同法補完）。

#### 3.5.1 `clans.json`（節錄：東海三家＋外交區塊示例）

```jsonc
{
  "version": 1,
  "clans": [
    { "id": "clan.oda", "name": "織田家", "leaderId": "off.oda-nobunaga",
      "homeCastleId": "castle.kiyosu", "gold": 2000, "prestige": 250,
      "courtRank": "none", "shogunateTitle": "none",
      "personaId": "persona.oda", "colorIndex": 5 },
    { "id": "clan.imagawa", "name": "今川家", "leaderId": "off.imagawa-yoshimoto",
      "homeCastleId": "castle.sunpu", "gold": 3500, "prestige": 500,
      "courtRank": "ju5ge", "shogunateTitle": "none",
      "personaId": "persona.imagawa", "colorIndex": 31 },
    { "id": "clan.matsudaira", "name": "松平家", "leaderId": "off.matsudaira-motoyasu",
      "homeCastleId": "castle.okazaki", "gold": 400, "prestige": 120,
      "courtRank": "none", "shogunateTitle": "none",
      "personaId": "persona.matsudaira", "colorIndex": 17 }
  ],
  "diplomacy": {
    "pacts": [
      { "a": "clan.imagawa", "b": "clan.takeda", "kind": "alliance", "months": 48, "vassalClanId": null },
      { "a": "clan.imagawa", "b": "clan.takeda", "kind": "marriage", "months": null, "vassalClanId": null },
      { "a": "clan.imagawa", "b": "clan.matsudaira", "kind": "vassal", "months": null, "vassalClanId": "clan.matsudaira" }
    ],
    "wars": [
      { "a": "clan.imagawa", "b": "clan.oda" },
      { "a": "clan.oda", "b": "clan.saito" }
    ],
    "sentiments": [
      { "a": "clan.oda", "b": "clan.saito", "aToB": 20, "bToA": 20 }
    ]
  }
}
```

#### 3.5.2 `castles.json`（東海 10 城；齋藤 3 城、北畠 2 城、長島 1 城另補）

```jsonc
[
  { "id": "castle.kiyosu",   "name": "清洲城",   "tier": "main",   "provinceId": "prov.owari",  "pos": { "x": 1966, "y": 2838 }, "coastal": false, "ownerClanId": "clan.oda",       "lordId": "off.oda-nobunaga",       "soldiers": 2600, "food": 6500, "facilities": ["fac.ichi"] },
  { "id": "castle.nagoya",   "name": "那古野城", "tier": "branch", "provinceId": "prov.owari",  "pos": { "x": 1968, "y": 2843 }, "coastal": true,  "ownerClanId": "clan.oda",       "lordId": "off.hayashi-hidesada",   "soldiers": 1400, "food": 3500, "facilities": [] },
  { "id": "castle.inuyama",  "name": "犬山城",   "tier": "branch", "provinceId": "prov.owari",  "pos": { "x": 1975, "y": 2787 }, "coastal": false, "ownerClanId": "clan.oda",       "lordId": "off.ikeda-tsuneoki",     "soldiers": 900,  "food": 2000, "facilities": [] },
  { "id": "castle.sunpu",    "name": "駿府館",   "tier": "main",   "provinceId": "prov.suruga", "pos": { "x": 2312, "y": 2897 }, "coastal": true,  "ownerClanId": "clan.imagawa",   "lordId": "off.imagawa-yoshimoto",  "soldiers": 2600, "food": 7000, "facilities": ["fac.ichi", "fac.jisha"] },
  { "id": "castle.kokokuji", "name": "興國寺城", "tier": "branch", "provinceId": "prov.suruga", "pos": { "x": 2427, "y": 2856 }, "coastal": true,  "ownerClanId": "clan.imagawa",   "lordId": "off.katsurayama-ujimoto","soldiers": 1500, "food": 3500, "facilities": [] },
  { "id": "castle.kakegawa", "name": "掛川城",   "tier": "branch", "provinceId": "prov.totomi", "pos": { "x": 2226, "y": 2953 }, "coastal": false, "ownerClanId": "clan.imagawa",   "lordId": "off.asahina-yasutomo",   "soldiers": 1700, "food": 4000, "facilities": [] },
  { "id": "castle.hikuma",   "name": "曳馬城",   "tier": "branch", "provinceId": "prov.totomi", "pos": { "x": 2160, "y": 2969 }, "coastal": true,  "ownerClanId": "clan.imagawa",   "lordId": "off.ihara-tadatane",     "soldiers": 1600, "food": 3800, "facilities": [] },
  { "id": "castle.yoshida",  "name": "吉田城",   "tier": "branch", "provinceId": "prov.mikawa", "pos": { "x": 2081, "y": 2953 }, "coastal": true,  "ownerClanId": "clan.imagawa",   "lordId": "off.ohara-shigezane",    "soldiers": 1600, "food": 3800, "facilities": [] },
  { "id": "castle.tahara",   "name": "田原城",   "tier": "branch", "provinceId": "prov.mikawa", "pos": { "x": 2050, "y": 2980 }, "coastal": true,  "ownerClanId": "clan.imagawa",   "lordId": "off.okabe-masatsuna",    "soldiers": 900,  "food": 2000, "facilities": [] },
  { "id": "castle.okazaki",  "name": "岡崎城",   "tier": "main",   "provinceId": "prov.mikawa", "pos": { "x": 2029, "y": 2905 }, "coastal": false, "ownerClanId": "clan.matsudaira","lordId": "off.matsudaira-motoyasu","soldiers": 1300, "food": 3200, "facilities": [] }
]
```

（`directControl`／`morale`／`maxDurability` 未列 = 取 schema 預設：true／70／依 tier 之
`BAL.durabilityMain(3000)`／`BAL.durabilityBranch(1000)`。）

#### 3.5.3 `districts.json`（東海 22 郡：尾張 8＋駿河 4＋遠江 4＋三河 6；實名令制郡）

```jsonc
[
  { "id": "dist.owari-kasugai",  "name": "春日井郡", "castleId": "castle.kiyosu",   "pos": { "x": 1982, "y": 2824 }, "kokudaka": 42000, "kokudakaCap": 58800, "commerce": 260, "commerceCap": 420, "population": 13900, "populationCap": 21000, "publicOrder": 60 },
  { "id": "dist.owari-kaito",    "name": "海東郡",   "castleId": "castle.kiyosu",   "pos": { "x": 1929, "y": 2846 }, "isPort": true, "kokudaka": 40000, "kokudakaCap": 56000, "commerce": 560, "commerceCap": 900, "population": 15000, "populationCap": 22500, "publicOrder": 65 },
  { "id": "dist.owari-nakashima","name": "中島郡",   "castleId": "castle.kiyosu",   "pos": { "x": 1943, "y": 2811 }, "kokudaka": 44000, "kokudakaCap": 61600, "commerce": 240, "commerceCap": 380, "population": 14500, "populationCap": 22000, "publicOrder": 60 },
  { "id": "dist.owari-kaisai",   "name": "海西郡",   "castleId": "castle.kiyosu",   "pos": { "x": 1924, "y": 2859 }, "kokudaka": 34000, "kokudakaCap": 47600, "commerce": 180, "commerceCap": 290, "population": 11200, "populationCap": 17000, "publicOrder": 58 },
  { "id": "dist.owari-aichi",    "name": "愛知郡",   "castleId": "castle.nagoya",   "pos": { "x": 1968, "y": 2859 }, "isPort": true, "kokudaka": 46000, "kokudakaCap": 64400, "commerce": 520, "commerceCap": 830, "population": 16800, "populationCap": 25500, "publicOrder": 65 },
  { "id": "dist.owari-chita",    "name": "知多郡",   "castleId": "castle.nagoya",   "pos": { "x": 1973, "y": 2910 }, "isPort": true, "kokudaka": 38000, "kokudakaCap": 53200, "commerce": 300, "commerceCap": 480, "population": 13300, "populationCap": 20000, "publicOrder": 60 },
  { "id": "dist.owari-niwa",     "name": "丹羽郡",   "castleId": "castle.inuyama",  "pos": { "x": 1978, "y": 2798 }, "kokudaka": 36000, "kokudakaCap": 50400, "commerce": 170, "commerceCap": 270, "population": 11900, "populationCap": 18000, "publicOrder": 60 },
  { "id": "dist.owari-haguri",   "name": "葉栗郡",   "castleId": "castle.inuyama",  "pos": { "x": 1959, "y": 2795 }, "stewardId": "off.mori-yoshinari", "kokudaka": 30000, "kokudakaCap": 42000, "commerce": 140, "commerceCap": 220, "population": 9900,  "populationCap": 15000, "publicOrder": 60 },
  { "id": "dist.suruga-abe",     "name": "安倍郡",   "castleId": "castle.sunpu",    "pos": { "x": 2312, "y": 2878 }, "kokudaka": 52000, "kokudakaCap": 72800, "commerce": 420, "commerceCap": 670, "population": 18200, "populationCap": 27500, "publicOrder": 62 },
  { "id": "dist.suruga-udo",     "name": "有度郡",   "castleId": "castle.sunpu",    "pos": { "x": 2338, "y": 2886 }, "isPort": true, "kokudaka": 48000, "kokudakaCap": 67200, "commerce": 380, "commerceCap": 610, "population": 16800, "populationCap": 25500, "publicOrder": 62 },
  { "id": "dist.suruga-sunto",   "name": "駿東郡",   "castleId": "castle.kokokuji", "pos": { "x": 2425, "y": 2865 }, "kokudaka": 55000, "kokudakaCap": 77000, "commerce": 250, "commerceCap": 400, "population": 18200, "populationCap": 27500, "publicOrder": 60 },
  { "id": "dist.suruga-fuji",    "name": "富士郡",   "castleId": "castle.kokokuji", "pos": { "x": 2383, "y": 2849 }, "kokudaka": 60000, "kokudakaCap": 84000, "commerce": 230, "commerceCap": 370, "population": 19800, "populationCap": 30000, "publicOrder": 60 },
  { "id": "dist.totomi-sano",    "name": "佐野郡",   "castleId": "castle.kakegawa", "pos": { "x": 2231, "y": 2937 }, "stewardId": "off.asahina-yasutomo", "kokudaka": 58000, "kokudakaCap": 81200, "commerce": 240, "commerceCap": 380, "population": 19100, "populationCap": 29000, "publicOrder": 60 },
  { "id": "dist.totomi-suchi",   "name": "周智郡",   "castleId": "castle.kakegawa", "pos": { "x": 2205, "y": 2926 }, "kokudaka": 55000, "kokudakaCap": 77000, "commerce": 200, "commerceCap": 320, "population": 18200, "populationCap": 27500, "publicOrder": 60 },
  { "id": "dist.totomi-fuchi",   "name": "敷知郡",   "castleId": "castle.hikuma",   "pos": { "x": 2132, "y": 2966 }, "kokudaka": 62000, "kokudakaCap": 86800, "commerce": 320, "commerceCap": 510, "population": 20500, "populationCap": 31000, "publicOrder": 60 },
  { "id": "dist.totomi-toyoda",  "name": "豐田郡",   "castleId": "castle.hikuma",   "pos": { "x": 2181, "y": 2945 }, "kokudaka": 57000, "kokudakaCap": 79800, "commerce": 210, "commerceCap": 340, "population": 18800, "populationCap": 28500, "publicOrder": 60 },
  { "id": "dist.mikawa-hoi",     "name": "寶飯郡",   "castleId": "castle.yoshida",  "pos": { "x": 2067, "y": 2937 }, "kokudaka": 64000, "kokudakaCap": 89600, "commerce": 300, "commerceCap": 480, "population": 21100, "populationCap": 32000, "publicOrder": 60 },
  { "id": "dist.mikawa-yana",    "name": "八名郡",   "castleId": "castle.yoshida",  "pos": { "x": 2100, "y": 2918 }, "kokudaka": 52000, "kokudakaCap": 72800, "commerce": 160, "commerceCap": 260, "population": 17200, "populationCap": 26000, "publicOrder": 60 },
  { "id": "dist.mikawa-atsumi",  "name": "渥美郡",   "castleId": "castle.tahara",   "pos": { "x": 2055, "y": 2982 }, "isPort": true, "stewardId": "off.okabe-masatsuna", "kokudaka": 58000, "kokudakaCap": 81200, "commerce": 280, "commerceCap": 450, "population": 20200, "populationCap": 30500, "publicOrder": 60 },
  { "id": "dist.mikawa-hazu",    "name": "幡豆郡",   "castleId": "castle.tahara",   "pos": { "x": 2008, "y": 2937 }, "kokudaka": 49000, "kokudakaCap": 68600, "commerce": 190, "commerceCap": 300, "population": 16200, "populationCap": 24500, "publicOrder": 60 },
  { "id": "dist.mikawa-nukata",  "name": "額田郡",   "castleId": "castle.okazaki",  "pos": { "x": 2036, "y": 2902 }, "kokudaka": 55000, "kokudakaCap": 77000, "commerce": 260, "commerceCap": 420, "population": 18200, "populationCap": 27500, "publicOrder": 62 },
  { "id": "dist.mikawa-hekikai", "name": "碧海郡",   "castleId": "castle.okazaki",  "pos": { "x": 2001, "y": 2897 }, "kokudaka": 62000, "kokudakaCap": 86800, "commerce": 240, "commerceCap": 380, "population": 20500, "populationCap": 31000, "publicOrder": 60 },
  { "id": "dist.mikawa-kamo",    "name": "加茂郡",   "castleId": "castle.okazaki",  "pos": { "x": 2036, "y": 2865 }, "kokudaka": 50000, "kokudakaCap": 70000, "commerce": 150, "commerceCap": 240, "population": 16500, "populationCap": 25000, "publicOrder": 58 }
]
```

校準檢核：織田 31.0 萬石（00 §6「尾張半國 ~30 萬石」）；今川 67.0 萬石＋從屬松平 16.7 萬石
（00 §6「~70 萬石」）。`isPort` 未列 = false；`stewardId` 未列 = null（直轄）；
`developFocus` 未列 = `'agri'`。知行示例：森可成（葉栗）、朝比奈泰朝（佐野）、岡部正綱（渥美）。

#### 3.5.4 `roads.json`（東海節錄 14 邊；批次全量約 60 邊）

```jsonc
{ "version": 1, "edges": [
  { "id": "road.kiyosu-kasugai-01",   "a": "castle.kiyosu",       "b": "dist.owari-kasugai",  "type": "land", "grade": 2, "baseDays": 0.5 },
  { "id": "road.kiyosu-nakashima-01", "a": "castle.kiyosu",       "b": "dist.owari-nakashima","type": "land", "grade": 2, "baseDays": 0.5 },
  { "id": "road.kiyosu-kaito-01",     "a": "castle.kiyosu",       "b": "dist.owari-kaito",    "type": "land", "grade": 2, "baseDays": 0.5 },
  { "id": "road.kaito-kaisai-01",     "a": "dist.owari-kaito",    "b": "dist.owari-kaisai",   "type": "land", "grade": 1, "baseDays": 0.5 },
  { "id": "road.kiyosu-nagoya-01",    "a": "castle.kiyosu",       "b": "castle.nagoya",       "type": "land", "grade": 3, "baseDays": 0.5, "name": "東海道" },
  { "id": "road.nagoya-aichi-01",     "a": "castle.nagoya",       "b": "dist.owari-aichi",    "type": "land", "grade": 3, "baseDays": 0.5, "name": "東海道" },
  { "id": "road.aichi-hekikai-01",    "a": "dist.owari-aichi",    "b": "dist.mikawa-hekikai", "type": "land", "grade": 3, "baseDays": 1,   "name": "東海道" },
  { "id": "road.hekikai-okazaki-01",  "a": "dist.mikawa-hekikai", "b": "castle.okazaki",      "type": "land", "grade": 3, "baseDays": 0.5, "name": "東海道" },
  { "id": "road.okazaki-hoi-01",      "a": "castle.okazaki",      "b": "dist.mikawa-hoi",     "type": "land", "grade": 3, "baseDays": 1,   "name": "東海道" },
  { "id": "road.hoi-yoshida-01",      "a": "dist.mikawa-hoi",     "b": "castle.yoshida",      "type": "land", "grade": 3, "baseDays": 0.5, "name": "東海道" },
  { "id": "road.yoshida-fuchi-01",    "a": "castle.yoshida",      "b": "dist.totomi-fuchi",   "type": "land", "grade": 3, "baseDays": 1.5, "name": "東海道" },
  { "id": "road.kakegawa-abe-01",     "a": "castle.kakegawa",     "b": "dist.suruga-abe",     "type": "land", "grade": 3, "baseDays": 2,   "name": "東海道" },
  { "id": "road.kasugai-inuyama-01",  "a": "dist.owari-kasugai",  "b": "castle.inuyama",      "type": "land", "grade": 2, "baseDays": 1 },
  { "id": "road.chita-atsumi-01",     "a": "dist.owari-chita",    "b": "dist.mikawa-atsumi",  "type": "sea",  "grade": 1, "baseDays": 2,   "name": "伊勢灣口航路" }
] }
```

（其餘：敷知—曳馬—豐田—佐野—掛川、駿府—有度—富士—駿東—興國寺、愛知—知多、
額田—加茂、幡豆—寶飯、八名—周智（本坂通）、丹羽—葉栗—中島、稻葉山方面與跨地方接縫
依 §3.7 補齊。）

#### 3.5.5 `officers/tokai.json`（織田 15＋今川 12＋松平 6；齋藤 15、北畠 10 依 §3.6 補）

欄位縮寫對應 02 §4.4：`ldr/val/int/pol` = 統率／武勇／知略／政務。
`status`／`hasComeOfAge`／`loyalty`／`merit` 由 builder 推導（§5.6），資料檔不含。

```jsonc
{ "version": 1, "region": "tokai", "officers": [
  { "id": "off.oda-nobunaga",       "name": "織田信長",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 105, "val": 92,  "int": 108, "pol": 104, "traits": ["trait.ifudodo", "trait.teppo", "trait.yashin"], "tactics": ["tac.charge", "tac.triple-volley"], "rank": "shukuro", "isKin": true,  "birthYear": 1534, "deathYear": 1582 },
  { "id": "off.shibata-katsuie",    "name": "柴田勝家",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 92,  "val": 95,  "int": 62,  "pol": 70,  "traits": ["trait.goketsu", "trait.kesshi"],  "tactics": ["tac.charge", "tac.last-stand"], "rank": "karo",           "birthYear": 1522, "deathYear": 1583 },
  { "id": "off.niwa-nagahide",      "name": "丹羽長秀",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 78,  "val": 70,  "int": 82,  "pol": 95,  "traits": ["trait.naisei", "trait.chushin"],  "tactics": ["tac.volley"],                   "rank": "busho",          "birthYear": 1535, "deathYear": 1585 },
  { "id": "off.kinoshita-tokichiro","name": "木下藤吉郎", "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 90,  "val": 62,  "int": 96,  "pol": 98,  "traits": ["trait.hitotarashi", "trait.chikujo", "trait.yashin"], "tactics": ["tac.charge"], "rank": "kumigashira", "birthYear": 1537, "deathYear": 1598 },
  { "id": "off.maeda-toshiie",      "name": "前田利家",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 82,  "val": 88,  "int": 66,  "pol": 84,  "traits": ["trait.goketsu"],                  "tactics": ["tac.charge"],                   "rank": "ashigaru-taisho","birthYear": 1538, "deathYear": 1599 },
  { "id": "off.sassa-narimasa",     "name": "佐佐成政",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 78,  "val": 84,  "int": 60,  "pol": 68,  "traits": ["trait.teppo"],                    "tactics": ["tac.volley"],                   "rank": "ashigaru-taisho","birthYear": 1536, "deathYear": 1588 },
  { "id": "off.ikeda-tsuneoki",     "name": "池田恆興",   "clanId": "clan.oda", "locationCastleId": "castle.inuyama", "ldr": 74,  "val": 72,  "int": 62,  "pol": 70,  "traits": [],                                 "tactics": ["tac.charge"],                   "rank": "samurai-taisho", "birthYear": 1536, "deathYear": 1584 },
  { "id": "off.hayashi-hidesada",   "name": "林秀貞",     "clanId": "clan.oda", "locationCastleId": "castle.nagoya",  "ldr": 45,  "val": 38,  "int": 58,  "pol": 78,  "traits": ["trait.jinsei"],                   "tactics": [],                               "rank": "karo",           "birthYear": 1513, "deathYear": 1580 },
  { "id": "off.sakuma-nobumori",    "name": "佐久間信盛", "clanId": "clan.oda", "locationCastleId": "castle.nagoya",  "ldr": 68,  "val": 60,  "int": 64,  "pol": 72,  "traits": ["trait.rojo"],                     "tactics": ["tac.volley"],                   "rank": "karo",           "birthYear": 1528, "deathYear": 1582 },
  { "id": "off.takigawa-kazumasu",  "name": "瀧川一益",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 86,  "val": 80,  "int": 84,  "pol": 72,  "traits": ["trait.teppo", "trait.ninja"],     "tactics": ["tac.triple-volley", "tac.volley"], "rank": "samurai-taisho", "birthYear": 1525, "deathYear": 1586 },
  { "id": "off.mori-yoshinari",     "name": "森可成",     "clanId": "clan.oda", "locationCastleId": "castle.inuyama", "ldr": 80,  "val": 82,  "int": 64,  "pol": 60,  "traits": ["trait.goketsu", "trait.kesshi"],  "tactics": ["tac.charge", "tac.last-stand"], "rank": "busho",          "birthYear": 1523, "deathYear": 1570 },
  { "id": "off.kawajiri-hidetaka",  "name": "河尻秀隆",   "clanId": "clan.oda", "locationCastleId": "castle.nagoya",  "ldr": 70,  "val": 72,  "int": 60,  "pol": 66,  "traits": ["trait.reisei"],                   "tactics": ["tac.charge"],                   "rank": "samurai-taisho", "birthYear": 1527, "deathYear": 1582 },
  { "id": "off.murai-sadakatsu",    "name": "村井貞勝",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 30,  "val": 20,  "int": 70,  "pol": 94,  "traits": ["trait.naisei", "trait.chotei"],   "tactics": [],                               "rank": "samurai-taisho", "birthYear": 1520, "deathYear": 1585 },
  { "id": "off.yanada-masatsuna",   "name": "簗田政綱",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 55,  "val": 50,  "int": 76,  "pol": 58,  "traits": ["trait.hayamimi"],                 "tactics": ["tac.volley"],                   "rank": "samurai-taisho", "birthYear": 1524, "deathYear": 1579 },
  { "id": "off.oda-nobukane",       "name": "織田信包",   "clanId": "clan.oda", "locationCastleId": "castle.kiyosu",  "ldr": 60,  "val": 55,  "int": 62,  "pol": 72,  "traits": ["trait.jinsei"],                   "tactics": ["tac.volley"],                   "rank": "busho", "isKin": true, "birthYear": 1543, "deathYear": 1614 },

  { "id": "off.imagawa-yoshimoto",  "name": "今川義元",   "clanId": "clan.imagawa", "locationCastleId": "castle.sunpu",    "ldr": 88, "val": 70, "int": 86, "pol": 92, "traits": ["trait.gunryaku", "trait.chotei"], "tactics": ["tac.disrupt", "tac.charge"], "rank": "shukuro", "isKin": true, "birthYear": 1519, "deathYear": 1560 },
  { "id": "off.imagawa-ujizane",    "name": "今川氏真",   "clanId": "clan.imagawa", "locationCastleId": "castle.sunpu",    "ldr": 30, "val": 24, "int": 40, "pol": 62, "traits": [],                                 "tactics": [],                            "rank": "busho",   "isKin": true, "birthYear": 1538, "deathYear": 1615 },
  { "id": "off.asahina-yasutomo",   "name": "朝比奈泰朝", "clanId": "clan.imagawa", "locationCastleId": "castle.kakegawa", "ldr": 78, "val": 76, "int": 58, "pol": 64, "traits": ["trait.chushin", "trait.fudou"],   "tactics": ["tac.hold", "tac.charge"],    "rank": "karo",    "birthYear": 1538, "deathYear": 1592 },
  { "id": "off.okabe-motonobu",     "name": "岡部元信",   "clanId": "clan.imagawa", "locationCastleId": "castle.sunpu",    "ldr": 82, "val": 84, "int": 66, "pol": 58, "traits": ["trait.kesshi", "trait.chushin"],  "tactics": ["tac.last-stand", "tac.charge"], "rank": "busho", "birthYear": 1525, "deathYear": 1581 },
  { "id": "off.okabe-masatsuna",    "name": "岡部正綱",   "clanId": "clan.imagawa", "locationCastleId": "castle.tahara",   "ldr": 70, "val": 66, "int": 68, "pol": 74, "traits": ["trait.rojo"],                     "tactics": ["tac.volley"],                "rank": "samurai-taisho", "birthYear": 1542, "deathYear": 1584 },
  { "id": "off.udono-nagateru",     "name": "鵜殿長照",   "clanId": "clan.imagawa", "locationCastleId": "castle.yoshida",  "ldr": 68, "val": 70, "int": 52, "pol": 58, "traits": ["trait.fudou"],                    "tactics": ["tac.hold"],                  "rank": "busho", "isKin": true, "birthYear": 1530, "deathYear": 1562 },
  { "id": "off.sekiguchi-chikanaga","name": "關口親永",   "clanId": "clan.imagawa", "locationCastleId": "castle.sunpu",    "ldr": 52, "val": 48, "int": 62, "pol": 72, "traits": ["trait.chotei"],                   "tactics": [],                            "rank": "karo",  "isKin": true, "birthYear": 1518, "deathYear": 1562 },
  { "id": "off.ii-naomori",         "name": "井伊直盛",   "clanId": "clan.imagawa", "locationCastleId": "castle.hikuma",   "ldr": 66, "val": 62, "int": 56, "pol": 60, "traits": ["trait.kesshi"],                   "tactics": ["tac.charge"],                "rank": "busho", "birthYear": 1526, "deathYear": 1560 },
  { "id": "off.ohara-shigezane",    "name": "小原鎮實",   "clanId": "clan.imagawa", "locationCastleId": "castle.yoshida",  "ldr": 60, "val": 58, "int": 64, "pol": 62, "traits": ["trait.rojo"],                     "tactics": ["tac.volley"],                "rank": "samurai-taisho", "birthYear": 1520, "deathYear": 1570 },
  { "id": "off.katsurayama-ujimoto","name": "葛山氏元",   "clanId": "clan.imagawa", "locationCastleId": "castle.kokokuji", "ldr": 54, "val": 50, "int": 58, "pol": 66, "traits": ["trait.shosai"],                   "tactics": [],                            "rank": "busho", "birthYear": 1520, "deathYear": 1573 },
  { "id": "off.ihara-tadatane",     "name": "庵原忠胤",   "clanId": "clan.imagawa", "locationCastleId": "castle.hikuma",   "ldr": 62, "val": 60, "int": 58, "pol": 60, "traits": ["trait.heitan"],                   "tactics": ["tac.volley"],                "rank": "samurai-taisho", "birthYear": 1515, "deathYear": 1580 },
  { "id": "off.yui-masanobu",       "name": "由比正信",   "clanId": "clan.imagawa", "locationCastleId": "castle.sunpu",    "ldr": 58, "val": 54, "int": 60, "pol": 64, "traits": ["trait.naisei"],                   "tactics": [],                            "rank": "samurai-taisho", "birthYear": 1515, "deathYear": 1560 },

  { "id": "off.matsudaira-motoyasu","name": "松平元康",   "clanId": "clan.matsudaira", "locationCastleId": "castle.okazaki", "ldr": 96, "val": 84, "int": 92, "pol": 98, "traits": ["trait.gunryaku", "trait.jinbo"], "tactics": ["tac.charge", "tac.disrupt"], "rank": "shukuro", "isKin": true, "birthYear": 1543, "deathYear": 1616 },
  { "id": "off.sakai-tadatsugu",    "name": "酒井忠次",   "clanId": "clan.matsudaira", "locationCastleId": "castle.okazaki", "ldr": 88, "val": 78, "int": 84, "pol": 80, "traits": ["trait.roukou"],                  "tactics": ["tac.pin", "tac.charge"],     "rank": "karo",    "birthYear": 1527, "deathYear": 1596 },
  { "id": "off.ishikawa-kazumasa",  "name": "石川數正",   "clanId": "clan.matsudaira", "locationCastleId": "castle.okazaki", "ldr": 70, "val": 58, "int": 80, "pol": 84, "traits": ["trait.gaiko"],                   "tactics": ["tac.volley"],                "rank": "busho",   "birthYear": 1533, "deathYear": 1593 },
  { "id": "off.torii-mototada",     "name": "鳥居元忠",   "clanId": "clan.matsudaira", "locationCastleId": "castle.okazaki", "ldr": 76, "val": 74, "int": 58, "pol": 62, "traits": ["trait.chushin", "trait.fudou"],  "tactics": ["tac.hold"],                  "rank": "samurai-taisho", "birthYear": 1539, "deathYear": 1600 },
  { "id": "off.okubo-tadayo",       "name": "大久保忠世", "clanId": "clan.matsudaira", "locationCastleId": "castle.okazaki", "ldr": 78, "val": 80, "int": 62, "pol": 64, "traits": ["trait.goketsu"],                 "tactics": ["tac.charge"],                "rank": "samurai-taisho", "birthYear": 1532, "deathYear": 1594 },
  { "id": "off.honda-tadakatsu",    "name": "本多忠勝",   "clanId": "clan.matsudaira", "locationCastleId": "castle.okazaki", "ldr": 94, "val": 110, "int": 68, "pol": 48, "traits": ["trait.onimusha", "trait.kesshi"], "tactics": ["tac.charge", "tac.last-stand"], "rank": "kumigashira", "birthYear": 1548, "deathYear": 1610 }
] }
```

（本多忠勝生年 1548：builder 判定 `hasComeOfAge=false`，1563 年 1/1 元服登場——
「收錄未元服少年武將」即用此法，生年上限 1570，見 §4.6。）

### 3.6 其餘 8 地方製作 checklist

每地方必須滿足：(a) 必收錄大名全數入檔；(b) 必收錄名城（本城以史實居城為準）；
(c) 每家核心武將名單（大勢力 ≥12、中勢力 ≥8、小勢力 ≥5 具名；不足配額部分以
同時代史實家臣補齊，禁用架空人名）；(d) 通過該批次驗證（§7）。四維與特性由製作者
比照 §3.5.5 樣板自訂（傳說特性全國 ≤ 12 人持有；`trait.gunshin` 僅限武田信玄、長尾景虎、
島津義弘、立花道雪 4 人，06 §3.3 稀有度精神）。

**近畿**（18 城／50 郡／295 萬石／90 將）
- 大名：三好（芥川山・飯盛山・高屋・岸和田・信貴山・勝龍寺）、六角（觀音寺・日野）、
  淺井（小谷・佐和山）、筒井（筒井）、本願寺（石山御坊・雜賀）、波多野（八上・八木）、
  山名（此隅山・竹田）、足利（二條御所）。
- 核心武將：三好＝長慶・義興・實休・安宅冬康・十河一存・三好長逸・三好政康・岩成友通・
  松永久秀・松永長賴・篠原長房・三好康長；六角＝義賢・義治・蒲生定秀・蒲生賢秀・後藤賢豐・
  進藤賢盛；淺井＝長政・久政・磯野員昌・赤尾清綱・海北綱親・遠藤直經・雨森清貞・藤堂高虎(1556)；
  本願寺＝顯如・下間賴廉・下間賴龍・鈴木重秀・杉浦玄任・七里賴周・願證寺證惠（長島）；
  筒井＝順政・順慶(1549)・島清興・松倉重信；波多野＝晴通・秀治(1555)・波多野宗長；
  足利＝義輝・細川藤孝・三淵藤英・和田惟政・一色藤長。
- 郡例：山城（葛野・愛宕・紀伊・宇治）、近江（坂田・淺井・伊香・犬上・蒲生・甲賀・栗太・滋賀）、
  攝津（東成・西成・島上・島下・武庫）、大和（添上・平群・式下・高市）、紀伊（名草・海部・伊都・牟婁）。
- 街道：東海道（近江路）、中山道、北國街道、竹內街道、紀州街道；雜賀為港郡。

**關東**（16 城／48 郡／275 萬石／75 將）
- 大名：北條（小田原・玉繩・韮山・江戶・河越・瀧山・松山）、里見（久留里・佐貫）、
  佐竹（太田・額田）、宇都宮（宇都宮・真岡）、結城（結城）、長尾領（箕輪・廄橋——上野兩城，
  代表 1560 關東出兵後的上杉方國眾）。
- 核心武將：北條＝氏康・氏政・氏照・氏規・北條綱成・北條幻庵・松田憲秀・大道寺政繁・
  遠山綱景・富永直勝・清水康英・風魔小太郎；里見＝義堯・義弘・正木時茂・正木時忠・安西實元；
  佐竹＝義昭・義重(1547)・和田昭為・東義堅・小野崎義昌；宇都宮＝廣綱・芳賀高定・壬生綱雄；
  結城＝晴朝・水谷正村・多賀谷政經；長尾上野眾＝長野業正・長野業盛(1546)・上泉信綱。
- 郡例：相模（足柄・大住・鎌倉）、武藏（豐島・入間・埼玉・久良岐）、伊豆（田方）、
  常陸（茨城・久慈・筑波）、上總（望陀・周淮）、下總（葛飾・結城）、上野（群馬・碓氷）、下野（河內・芳賀）。
- 街道：東海道（箱根 2 級）、鎌倉街道、奧州街道（下野→岩代接縫）；三浦—安房設海路（江戶灣口）。

**甲信越**（9 城／27 郡／155 萬石／70 將）
- 大名：武田（躑躅崎館・岩殿・高遠・深志・海津）、長尾（春日山・栃尾・坂戶・飯山）。
- 核心武將：武田＝信玄・武田信繁・武田義信・飯富虎昌・馬場信房・內藤昌豐・山縣昌景・
  高坂昌信・真田幸隆・山本勘助・小山田信茂・秋山虎繁・原虎胤・穴山信君；
  長尾＝景虎・長尾政景・宇佐美定滿・柿崎景家・直江景綱・齋藤朝信・本庄繁長・色部勝長・
  北條高廣・甘糟景持・村上義清（客將）・中條藤資。
- 郡例：甲斐（山梨・八代・巨摩）、信濃（諏訪・伊那・筑摩・埴科・水內・佐久）、
  越後（頸城・魚沼・古志・蒲原・岩船）。
- 街道：甲州街道、中山道（信濃路）、三國峠（上野接縫）、川中島（海津—飯山 1 級對峙線）、
  北國街道（春日山—越中接縫）；北阿爾卑斯不設信濃—越中直通邊。

**北陸**（10 城／28 郡／135 萬石／40 將）
- 大名：朝倉（一乘谷・金崎・大野・後瀨山）、畠山（七尾・末森）、神保（富山・增山）、
  本願寺加賀領（尾山御坊・大聖寺）。
- 核心武將：朝倉＝義景・朝倉景鏡・朝倉景隆・山崎吉家・魚住景固・真柄直隆・印牧能信・
  明智光秀（浪人，寄寓一乘谷）；畠山＝義綱・長續連・遊佐續光・溫井景隆・長連龍(1546)；
  神保＝長職・小島職鎮・寺島職定；本願寺加賀坊官＝已計入近畿檔（所屬本願寺）。
- 郡例：越前（足羽・大野・敦賀・遠敷〔舊若狹〕）、加賀（石川・江沼）、能登（羽咋・鹿島）、
  越中（婦負・新川・礪波）。
- 街道：北陸道（木之芽峠→近江接縫 2 級、親不知 1 級→越後接縫）；輪島・三國為港郡（日本海航路）。

**中國**（16 城／44 郡／215 萬石／75 將）
- 大名：毛利（吉田郡山・佐東銀山・櫻尾・高嶺・勝山・松山・神邊）、
  尼子（月山富田・白鹿・山吹・米子）、山名因幡領（鳥取）、浦上（天神山・三石）、赤松（置鹽・龍野）。
- 核心武將：毛利＝元就・毛利隆元・吉川元春・小早川隆景・毛利輝元(1553)・口羽通良・福原貞俊・
  桂元澄・志道廣良・熊谷信直・宍戶隆家・村上武吉（`trait.kaizoku`）・清水宗治；
  尼子＝晴久（卒年 1561）・尼子義久・尼子倫久・宇山久兼・龜井秀綱・山中幸盛(1545)・立原久綱・
  本城常光・牛尾幸清；浦上＝宗景・明石行雄・宇喜多直家（`trait.boshin`）；
  赤松＝晴政・赤松義祐・別所安治；山名＝祐豐・垣屋續成・武田高信。
- 郡例：安藝（高田・佐東・沼田）、出雲（意宇・能義・島根）、石見（邇摩〔銀山〕・那賀）、
  播磨（飾磨・揖保・赤穗）、備前（和氣・上道・兒島）、周防（吉敷・都濃）、長門（豐浦・阿武）。
- 街道：山陽道（3 級）、山陰道（2 級）、出雲街道；兒島・上關（都濃）・下關（豐浦）・
  溫泉津（邇摩）為港郡；瀨戶內航路見 §3.7。

**四國**（8 城／22 郡／95 萬石／40 將）
- 大名：三好阿讚領（勝瑞・十河・虎丸）、長宗我部（岡豐）、一條（中村御所）、
  河野（湯築・來島）、西園寺（黑瀨）。
- 核心武將：長宗我部＝國親（卒年 1560）・元親(1539)・吉良親貞(1541)・香宗我部親泰(1543)・
  吉田孝賴・吉田重俊・福留親政・久武親信；河野＝通宣・村上通康（`trait.kaizoku`）・平岡房實；
  一條＝兼定・源康政・羽生監物；西園寺＝實充・宇都宮乘綱・法華津前延；
  三好阿波眾（實休・篠原長房等）計入近畿檔。
- 郡例：阿波（板野・名東）、讚岐（山田・香川・寒川）、伊予（和氣・越智・宇和）、
  土佐（長岡・吾川・幡多・香美）。
- 街道：撫養—雜賀海路（紀淡）、來島（越智）—安藝佐東海路、讚岐兒島海路；
  土佐—阿波以山道 1 級連接。

**九州**（14 城／40 郡／180 萬石／75 將）
- 大名：大友（府內・臼杵・小倉・立花山・隈本・柳川）、島津（內城・加世田・清水）、
  龍造寺（村中・蓮池）、伊東（都於郡・佐土原）、相良（人吉）。
- 核心武將：大友＝義鎮・戶次鑑連（`trait.gunshin`）・臼杵鑑速・吉弘鑑理・吉岡長增・志賀親守・
  田原親賢・佐伯惟教・高橋鑑種・一萬田鑑實・角隈石宗・吉弘鎮信(1544)；
  島津＝貴久・島津義久(1533)・島津義弘(1535，`trait.gunshin`)・島津歲久(1537)・島津家久(1547)・
  島津忠良・伊集院忠朗・伊集院忠倉・樺山善久・種子島時堯（`trait.teppo`）・新納忠元・川上久朗；
  龍造寺＝隆信・鍋島直茂・納富信景・小河信安・龍造寺長信・百武賢兼；
  伊東＝義祐・伊東義益(1546)・伊東祐安・落合兼朝；相良＝義陽・赤池長任・深水長智・犬童賴安。
- 郡例：薩摩（鹿兒島・川邊・出水）、大隅（肝屬・囎唹）、日向（宮崎・兒湯）、肥後（飽田・球磨・玉名）、
  肥前（佐嘉・神埼・松浦）、筑前（那珂〔博多〕・糟屋）、筑後（御井・山門）、豐前（企救・京都）、豐後（大分・海部）。
- 街道：薩摩街道、豐後街道、長崎街道；門司（企救）—下關海路、佐賀關（海部）—佐田岬（宇和）
  豐後水道海路；**人吉—日向之間不設街道邊**（九州山地；§3.3 色盤前提）。

**東北**（14 城／40 郡／210 萬石／65 將）
- 大名：伊達（米澤・桑折西山・名生）、蘆名（黑川・長沼・白河）、最上（山形・上山）、
  南部（三戶・九戶・不來方・花卷）、安東（檜山・湊）。
- 核心武將：伊達＝晴宗・伊達輝宗(1544)・伊達實元・鬼庭良直・遠藤基信・中野宗時・牧野久仲・
  白石宗利・伊達政宗(1567)；蘆名＝盛氏・蘆名盛興(1547)・金上盛備・松本氏輔・富田氏實；
  最上＝義守・最上義光(1546)・氏家定直・氏家守棟；南部＝晴政・石川高信・北信愛・九戶政實・
  八戶政榮；安東＝愛季・安東茂季・大高康澄。
- 郡例：羽前（置賜〔米澤〕・村山〔山形〕）、岩代（會津・信夫・伊達・白河）、陸前（志田・宮城）、
  陸中（岩手・稗貫）、陸奧（三戶・津輕）、羽後（檜山・秋田）。
- 街道：奧州街道（白河→下野接縫 2 級）、羽州街道、米澤街道；土崎（秋田）・十三湊（津輕）為港郡
  （日本海航路→越後直江津）。

### 3.7 街道網與海路連通要求

- **主要街道與道級**：東海道＝3 級；山陽道＝3 級；中山道・北陸道・甲州街道・奧州街道・
  山陰道（但馬以西）・鎌倉街道＝2 級；其餘山道・脇往還＝1 級。`baseDays` 依兩端世界座標
  距離 ÷ 90（0.5 日取整），山地邊 ×1.5。
- **跨地方接縫邊**（各批次完成時必須建立，維持全圖單一連通分量）：

| 接縫 | 邊（節點層級示意） | 街道／型別 |
|---|---|---|
| 東海—近畿 | 美濃不破—近江坂田 | 中山道 land 2 |
| 東海—近畿 | 伊勢—近江甲賀 | 八風・鈴鹿 land 1 |
| 東海—甲信越 | 三河加茂—信濃伊那 | 三州街道 land 1 |
| 東海—甲信越 | 美濃—信濃筑摩 | 中山道木曾路 land 1 |
| 東海—甲信越 | 駿河富士—甲斐八代 | 中道往還 land 1 |
| 關東—東海 | 伊豆田方—駿河駿東 | 東海道 land 2（箱根） |
| 關東—甲信越 | 武藏入間—甲斐山梨 | 甲州街道 land 2 |
| 關東—甲信越 | 上野碓氷—信濃佐久 | 中山道 land 2 |
| 關東—甲信越 | 上野群馬—越後魚沼 | 三國峠 land 1 |
| 關東—東北 | 下野河內—岩代白河 | 奧州街道 land 2 |
| 甲信越—北陸 | 越後頸城—越中新川 | 北陸道 land 1（親不知） |
| 甲信越—東北 | 越後岩船—羽前置賜 | 米澤街道 land 1 |
| 北陸—近畿 | 越前敦賀—近江滋賀 | 北國街道 land 2 |
| 近畿—中國 | 攝津—播磨飾磨 | 山陽道 land 3 |
| 近畿—中國 | 但馬—因幡 | 山陰道 land 2 |
| 中國—九州 | 長門豐浦—豐前企救 | 關門海峽 sea 0.5 |
| 近畿—四國 | 紀伊名草（雜賀）—阿波板野（撫養） | 紀淡航路 sea 2 |
| 中國—四國 | 安藝佐東—伊予越智（來島） | 瀨戶內航路 sea 2 |
| 中國—四國 | 備前兒島—讚岐香川 | 瀨戶內航路 sea 1.5 |
| 九州—四國 | 豐後海部（佐賀關）—伊予宇和（佐田岬） | 豐後水道航路 sea 2 |

- **瀨戶內航路鏈**（港郡間 sea 邊串連）：堺（和泉）—兵庫（攝津）—飾磨—兒島—佐東（嚴島）—
  上關（都濃）—企救（門司）—那珂（博多）。各段 baseDays 1.5~3。
- **日本海航路鏈**：小濱（遠敷）—三國（足羽）—輪島（羽咋）—直江津（頸城）—土崎（秋田）—
  十三湊（津輕）。各段 baseDays 2~4。
- 太平洋側僅設 §3.5.4 伊勢灣口與江戶灣口兩條短程海路（外洋不設航路）。
- 全部海路端點郡 `isPort: true`（04 §3.4.3）；海路 `grade` 一律 1。

### 3.8 浪人程序生成（02 §3.2 指派本文件定義）

具名浪人 15 人手寫入 officers 檔（明智光秀、蜂須賀正勝、前野長康等，`clanId: null`）。
另於**遊戲開局時**由 builder 程序生成 `BAL.roninPoolSize`（40）名無名浪人，
補足小勢力登用池（決定論：使用 `rng.misc` 流，同種子同結果）：

```
generateRonin(state, rng):
  for i in 1..BAL.roninPoolSize:
    id      = `off.ronin-${pad3(i)}`
    surname = SURNAMES[floor(rng() × 24)]     // 佐藤/鈴木/高橋/田中/伊藤/渡邊/山本/中村/小林/加藤/
                                              // 吉田/山田/佐佐木/山口/松本/井上/木村/林/清水/山崎/
                                              // 森/池田/橋本/石川（繁體字形）
    given   = GIVENS[floor(rng() × 16)]       // 太郎/次郎/三郎/四郎/五郎/六郎/七郎/平八/勘助/
                                              // 新之丞/忠介/清兵衛/彌太郎/權之助/源吾/久藏
    name    = surname + given                  // 重名時 given 後綴「二」
    primary = pick(rng, ['ldr','val','int','pol'])
    stats[primary] = 40 + floor(rng() × 45)                    // 40..84
    stats[其餘三維] = 20 + floor(rng() × 40)                    // 20..59
    traits  = rng() < BAL.roninTraitChance(0.35) ? [隨機 1 個普通特性] : []
    rank    = 'kumigashira'; isKin = false
    birthYear = 1560 − (18 + floor(rng() × 22))                // 1520..1542
    deathYear = birthYear + 40 + floor(rng() × 25)
    locationCastleId = 依「城轄郡 commerce 總和」加權隨機（大城下町聚浪人）
```

生成浪人不計入 §3.2 具名武將配額；`status='ronin'`；登用規則見 06。

### 3.9 事件資料（`events.json`）

資料格式見 §4.7；**每事件的觸發條件與效果數值定案於 `plan/10-events-and-victory.md`**，
本節為 s1560 必收錄的 15 事件清單（id 為 canonical）與內容摘要。範例（桶狹間）：

```jsonc
{
  "id": "evt.okehazama", "name": "桶狹間之戰", "once": true,
  "window": { "startDay": 120, "endDay": 359 },
  "conditions": [
    { "kind": "clanAlive", "clanId": "clan.oda" },
    { "kind": "clanAlive", "clanId": "clan.imagawa" },
    { "kind": "atWar", "a": "clan.oda", "b": "clan.imagawa" },
    { "kind": "officerServing", "officerId": "off.imagawa-yoshimoto" },
    { "kind": "armiesInEnemyTerritory", "clanId": "clan.imagawa", "targetClanId": "clan.oda", "minSoldiers": 6000 }
  ],
  "text": "永祿三年五月，今川治部大輔義元親率大軍上洛，兵鋒直指尾張……",
  "choices": [],
  "effects": [
    { "kind": "officerDies", "officerId": "off.imagawa-yoshimoto", "cause": "battle" },
    { "kind": "routClanArmies", "clanId": "clan.imagawa" },
    { "kind": "prestigeAdd", "clanId": "clan.oda", "amount": 300 },
    { "kind": "sentimentSet", "a": "clan.oda", "b": "clan.imagawa", "aToB": 30, "bToA": 10 }
  ]
}
```

| # | id | 名稱 | 觸發窗（年） | 條件／效果摘要（定案見 10） |
|---|---|---|---|---|
| 1 | `evt.okehazama` | 桶狹間之戰 | 1560 | 如上例 |
| 2 | `evt.kiyosu-domei` | 清洲同盟 | 1561–1565 | okehazama 已發＋織田松平非交戰 → 兩家同盟＋破棄松平從屬 |
| 3 | `evt.yoshitatsu-shibou` | 齋藤義龍病歿 | 1561 | 義龍 serving → 病死、龍興繼任 |
| 4 | `evt.kawanakajima` | 川中島龍虎相搏 | 1561 | 武田長尾交戰 → 信繁・勘助戰死、兩家威信＋150 |
| 5 | `evt.kanto-kanrei` | 關東管領就任 | 1561 | 長尾存續＋領上野城 → 改名上杉家、威信＋200 |
| 6 | `evt.sanshi-no-oshie` | 三矢之訓 | 1561 | 毛利三子 serving → 一門忠誠＋20、威信＋100 |
| 7 | `evt.sokui-kenkin` | 御即位獻金 | 1560–1561 | 選擇事件：獻金 800 貫 → courtFavor＋40、威信＋150 |
| 8 | `evt.teppo-denrai` | 鐵砲普及 | 1560–1565 | 月機率 → 解鎖 `pol.kakishuchu` 條件（05 §3.7.2） |
| 9 | `evt.nanban-visit` | 南蠻商人來訪 | 1561– | 領有港城 → 解鎖 `pol.nanban` 條件（05 §3.7.2） |
| 10 | `evt.eiroku-hen` | 永祿之變 | 1565 | 三好領山城＋足利存續 → 義輝橫死 |
| 11 | `evt.suruga-shinko` | 甲駿同盟破綻 | 1562– | 義元已死＋氏真當主 → 武田今川破盟、開戰 |
| 12 | `evt.ishiyama-kassen` | 石山合戰 | 條件式 | 任一勢力領攝津河內 ≥3 節點 → 與本願寺開戰 |
| 13 | `evt.tenka-fubu` | 天下布武 | 條件式 | 織田攻下稻葉山城 → 威信＋300 |
| 14 | `evt.shogunate-fall` | 幕府落日 | 條件式 | 二條御所易主且將軍家滅亡 → `shogunateExists=false` |
| 15 | `evt.honnoji` | 本能寺之變 | 1578– | 織田城 ≥60＋明智光秀 serving 且忠誠 <40 → 信長橫死、光秀自立 |

---

## 4. 資料結構（zod schemas）

全部實作於 `src/data/schemas/scenario.ts`（roads 與 outline 沿用 04 之
`schemas/roads.ts`／`schemas/outline.ts`，此處收錄 roads 以求完備）。
**原則**：劇本欄位 = 02 實體靜態欄位子集；可省略欄位以 `.default()` 補值；
跨檔引用完整性不在 zod 層驗（`tools/validate.ts` §5 負責）。

### 4.1 共用定義

```ts
// src/data/schemas/scenario.ts
import { z } from 'zod';

/** 00 §8 ID 前綴 regex（與 02 §3.2 對照表一致）。 */
export const RE = {
  clan: /^clan\.[a-z0-9-]+$/,   off: /^off\.[a-z0-9-]+$/,
  castle: /^castle\.[a-z0-9-]+$/, dist: /^dist\.[a-z0-9-]+$/,
  prov: /^prov\.[a-z0-9-]+$/,   road: /^road\.[a-z0-9-]+(-\d{2})?$/,
  evt: /^evt\.[a-z0-9-]+$/,     pol: /^pol\.[a-z0-9-]+$/,
  trait: /^trait\.[a-z0-9-]+$/, tac: /^tac\.[a-z0-9-]+$/,
  persona: /^persona\.[a-z0-9-]+$/, fac: /^fac\.[a-z0-9-]+$/,
  node: /^(castle|dist)\.[a-z0-9-]+$/,          // MapNodeId
} as const;

const id = (re: RegExp) => z.string().regex(re);
/** 世界座標（world unit，整數 0..4096；00 §8）。 */
const zPos = z.object({ x: z.number().int().min(0).max(4096), y: z.number().int().min(0).max(4096) });
/** 顯示名（繁中，1..12 字；專有名詞不進 i18n，00 §8）。 */
const zName = z.string().min(1).max(12);
const int0 = z.number().int().min(0);                    // 非負整數
const pct100 = z.number().int().min(0).max(100);         // 0..100 整數

export const REGION_VALUES = ['tokai','kinki','kanto','koshinetsu','hokuriku',
  'chugoku','shikoku','kyushu','tohoku'] as const;        // 02 §3.3 Region
export const RANK_VALUES = ['kumigashira','ashigaru-taisho','samurai-taisho',
  'busho','karo','shukuro'] as const;                     // 02 §3.3 Rank
export const COURT_RANK_VALUES = ['none','ju5ge','ju5jo','ju4ge','ju4jo',
  'ju3','sho3','ju2','sho2'] as const;                    // 02 §3.3 CourtRank
export const SHOGUNATE_VALUES = ['none','hokoshu','otomoshu','shobanshu',
  'kanrei','fukushogun','shogun'] as const;               // 02 §3.3 ShogunateTitle
```

### 4.2 `provinces.json`

```ts
/** 國（02 §4.7 Province 靜態全欄位）。 */
export const zProvince = z.object({
  id: id(RE.prov),                    // 'prov.owari'
  name: zName,                        // '尾張'
  region: z.enum(REGION_VALUES),      // 9 地方分區（製作批次＋UI 篩選）
  labelPos: zPos,                     // 國名標籤座標（成員城質心）
});
export const zProvincesFile = z.object({ version: z.literal(1), provinces: z.array(zProvince).min(1) });
```

### 4.3 `castles.json`

```ts
/** 城（02 §4.5 Castle 靜態子集；builder 補齊 corpsId=null、durability=max 等）。 */
export const zCastle = z.object({
  id: id(RE.castle),
  name: zName,                                   // '清洲城'
  tier: z.enum(['main', 'branch']),              // 城格（00 §4）
  provinceId: id(RE.prov),
  pos: zPos,
  coastal: z.boolean(),                          // 臨海城（05 §3.4.2 湊/南蠻寺條件；§8-D8）
  ownerClanId: id(RE.clan),
  lordId: id(RE.off).nullable(),                 // 城主；null=空缺（INV-04 由 validate.ts 檢）
  directControl: z.boolean().default(true),      // 開局預設直轄
  maxDurability: z.number().int().positive().nullable().default(null),
                                                 // null=依 tier 取 BAL.durabilityMain/Branch
  soldiers: int0,                                // 駐兵（人）；≤ castleMaxSoldiers（validate.ts）
  food: int0,                                    // 兵糧（石）
  morale: pct100.default(70),                    // 城士氣
  facilities: z.array(id(RE.fac)).default([]),   // 已完工施設；長度 ≤ slot 數（6/3）
});
export const zCastlesFile = z.array(zCastle).min(1);
```

### 4.4 `districts.json`

```ts
/** 郡（02 §4.6 District 靜態子集；ownerClanId 由 builder 設為所轄城 owner，§8-D7）。 */
export const zDistrict = z.object({
  id: id(RE.dist),
  name: zName,                                   // '春日井郡'（實名令制郡）
  castleId: id(RE.castle),                       // 所轄城（INV-03 鏡像由 builder 建立）
  pos: zPos,
  isPort: z.boolean().default(false),            // 港郡（海路端點資格，04 §3.4.3）
  stewardId: id(RE.off).nullable().default(null),// 開局知行領主；null=直轄
  kokudaka: int0,                                // 石高（石/年）
  kokudakaCap: int0,                             // 開發潛力上限（石/年）；≥ kokudaka
  commerce: int0,                                // 商業（點）
  commerceCap: z.number().int().min(0).max(2000),// ≤ BAL.commerceMaxAbs（00 §6）
  population: int0,                              // 人口（人）
  populationCap: int0,                           // 人口上限（人）
  publicOrder: pct100.default(60),               // 治安
  developFocus: z.enum(['agri', 'commerce', 'security']).default('agri'),
});
export const zDistrictsFile = z.array(zDistrict).min(1);
```

### 4.5 `clans.json`

```ts
/** 勢力（02 §4.3 Clan 靜態子集；alive=true、taimei 初始態由 builder 補）。 */
export const zClan = z.object({
  id: id(RE.clan),
  name: zName,                                   // '織田家'
  leaderId: id(RE.off),                          // 當主（INV-08）
  homeCastleId: id(RE.castle),                   // 本城（INV-09：tier='main'）
  gold: int0,                                    // 開局金錢（貫）
  prestige: z.number().int().min(0).max(2000),   // 開局威信
  courtRank: z.enum(COURT_RANK_VALUES).default('none'),
  shogunateTitle: z.enum(SHOGUNATE_VALUES).default('none'),
  personaId: id(RE.persona),                     // AI 性格（§4.11）
  colorIndex: z.number().int().min(0).max(39),   // 12 §3.1.3 色盤索引；builder 轉 Clan.color hex（§8-D6）
});

/** 開局協定（builder 轉 02 §4.11 Pact：startDay=0、endDay=months×30）。 */
export const zPactInit = z.object({
  a: id(RE.clan), b: id(RE.clan),
  kind: z.enum(['alliance', 'marriage', 'ceasefire', 'vassal']),
  months: z.number().int().positive().nullable(),// null 僅限 marriage/vassal（INV-17）
  vassalClanId: id(RE.clan).nullable().default(null), // 僅 vassal 填（∈{a,b}）
});

export const zClansFile = z.object({
  version: z.literal(1),
  clans: z.array(zClan).min(1),
  diplomacy: z.object({
    pacts: z.array(zPactInit).default([]),
    /** 開局交戰：builder 設該對 lastHostileDay=0（08 §3.1 atWar 推導）。 */
    wars: z.array(z.object({ a: id(RE.clan), b: id(RE.clan) })).default([]),
    /** 感情覆寫（預設 50，02 §5.5 defaultRow）。 */
    sentiments: z.array(z.object({
      a: id(RE.clan), b: id(RE.clan), aToB: pct100, bToA: pct100,
    })).default([]),
  }),
});
```

### 4.6 `officers/{region}.json`（9 檔同 schema）

```ts
/** 武將（02 §4.4 Officer 靜態子集；status/hasComeOfAge/loyalty/merit 由 builder 推導 §5.6）。 */
export const zOfficer = z.object({
  id: id(RE.off),
  name: zName,                                   // '織田信長'
  clanId: id(RE.clan).nullable(),                // null=具名浪人
  locationCastleId: id(RE.castle),               // 駐在城（serving）或寄寓城（ronin）
  ldr: z.number().int().min(1).max(120),         // 統率
  val: z.number().int().min(1).max(120),         // 武勇
  int: z.number().int().min(1).max(120),         // 知略
  pol: z.number().int().min(1).max(120),         // 政務
  traits: z.array(id(RE.trait)).max(4).default([]),   // ≤ BAL.maxTraitsPerOfficer
  tactics: z.array(id(RE.tac)).max(2).default([]),    // 解鎖特性檢查在 validate.ts（07 §3.8）
  rank: z.enum(RANK_VALUES).default('kumigashira'),
  isKin: z.boolean().default(false),             // 一門眾
  birthYear: z.number().int().min(1470).max(1570), // 1570 為收錄上限（1585 前元服）
  deathYear: z.number().int().min(1540).max(1660), // 卒年基準；validate.ts 檢 deathYear > birthYear
});
export const zOfficersFile = z.object({
  version: z.literal(1),
  region: z.enum(REGION_VALUES),                 // 檔名一致性由 validate.ts 檢
  officers: z.array(zOfficer).min(1),
});
```

### 4.7 `events.json`

觸發條件與效果為封閉 DSL（10 之事件引擎逐 kind 實作語意）；`text`／`choices[].label`
為繁中敘事文字，屬劇本內容資料，不進 i18n（§8-D9）。

```ts
export const zEventCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('clanAlive'),   clanId: id(RE.clan) }),
  z.object({ kind: z.literal('clanDead'),    clanId: id(RE.clan) }),
  z.object({ kind: z.literal('officerServing'), officerId: id(RE.off) }),
  z.object({ kind: z.literal('officerDead'),    officerId: id(RE.off) }),
  z.object({ kind: z.literal('officerLoyaltyBelow'), officerId: id(RE.off), value: pct100 }),
  z.object({ kind: z.literal('castleOwnedBy'), castleId: id(RE.castle), clanId: id(RE.clan) }),
  z.object({ kind: z.literal('clanCastleCountAtLeast'), clanId: id(RE.clan), count: z.number().int().positive() }),
  z.object({ kind: z.literal('clanOwnsNodesInProvince'), clanId: id(RE.clan), provinceId: id(RE.prov), count: z.number().int().positive() }),
  z.object({ kind: z.literal('atWar'),      a: id(RE.clan), b: id(RE.clan) }),
  z.object({ kind: z.literal('pactActive'), a: id(RE.clan), b: id(RE.clan), pact: z.enum(['alliance','marriage','ceasefire','vassal']) }),
  z.object({ kind: z.literal('eventFired'), eventId: id(RE.evt) }),
  z.object({ kind: z.literal('playerIs'),   clanId: id(RE.clan) }),
  z.object({ kind: z.literal('monthlyChance'), pct: z.number().min(0).max(100) }), // rng.event 流
  z.object({ kind: z.literal('armiesInEnemyTerritory'), clanId: id(RE.clan), targetClanId: id(RE.clan), minSoldiers: int0 }),
]);

export const zEventEffect = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('officerDies'),  officerId: id(RE.off), cause: z.enum(['age','battle','execution']) }),
  z.object({ kind: z.literal('officerToRonin'), officerId: id(RE.off) }),
  z.object({ kind: z.literal('officerJoinClan'), officerId: id(RE.off), clanId: id(RE.clan) }),
  z.object({ kind: z.literal('transferCastle'), castleId: id(RE.castle), toClanId: id(RE.clan) }),
  z.object({ kind: z.literal('setWar'),   a: id(RE.clan), b: id(RE.clan) }),        // lastHostileDay=今日
  z.object({ kind: z.literal('signPact'), a: id(RE.clan), b: id(RE.clan), pact: z.enum(['alliance','marriage','ceasefire','vassal']), months: z.number().int().positive().nullable(), vassalClanId: id(RE.clan).nullable().default(null) }),
  z.object({ kind: z.literal('breakPact'), a: id(RE.clan), b: id(RE.clan), pact: z.enum(['alliance','marriage','ceasefire','vassal']) }),
  z.object({ kind: z.literal('sentimentSet'), a: id(RE.clan), b: id(RE.clan), aToB: pct100, bToA: pct100 }),
  z.object({ kind: z.literal('prestigeAdd'), clanId: id(RE.clan), amount: z.number().int() }),
  z.object({ kind: z.literal('goldAdd'),     clanId: id(RE.clan), amount: z.number().int() }),
  z.object({ kind: z.literal('courtFavorAdd'), clanId: id(RE.clan), amount: z.number().int() }),
  z.object({ kind: z.literal('loyaltyAdd'),  clanId: id(RE.clan), kinOnly: z.boolean(), amount: z.number().int() }),
  z.object({ kind: z.literal('clanRename'),  clanId: id(RE.clan), name: zName }),
  z.object({ kind: z.literal('routClanArmies'), clanId: id(RE.clan) }),             // 全部隊強制潰走歸還
  z.object({ kind: z.literal('shogunateFall') }),                                    // shogunateExists=false
  z.object({ kind: z.literal('unlockFlag'), flag: z.string().min(1) }),              // 政策解鎖旗標（05 引用）
  z.object({ kind: z.literal('fireEvent'), eventId: id(RE.evt) }),                   // 連鎖觸發
]);

export const zEvent = z.object({
  id: id(RE.evt),
  name: zName,                                     // '桶狹間之戰'
  once: z.literal(true),                           // v1.0 全部一生一次（02 §4.16 fired）
  window: z.object({                               // 觸發窗（絕對日；00 §5.1 曆法）
    startDay: int0,
    endDay: int0.nullable(),                       // null=無期限（條件式事件）
  }),
  conditions: z.array(zEventCondition).min(1),     // AND 結合；每月 1 日判定（00 §5.4 步驟 3）
  text: z.string().min(1).max(200),                // 事件敘事（繁中）
  choices: z.array(z.object({                      // 空陣列=無選項自動結算
    label: z.string().min(1).max(30),
    effects: z.array(zEventEffect),
  })).max(3).default([]),
  effects: z.array(zEventEffect).default([]),      // 無選項時套用；有選項時忽略
});
export const zEventsFile = z.object({ version: z.literal(1), events: z.array(zEvent) });
```

### 4.8 `traits.json`（manifest；效果本體在 core，§8-D1）

```ts
/** 特性清單：06 §3.3 三十筆 ＋ 07 §8-D13 戰法解鎖特性七筆
 *（trait.benzetsu 辯舌／trait.gunryaku 軍略／trait.fudou 不動／trait.hizeme 火攻／
 *  trait.kesshi 決死／trait.roukou 老巧／trait.iryou 醫療），共 37 筆（§8-D2）。 */
export const zTraitEntry = z.object({
  id: id(RE.trait),
  name: zName,                                     // '軍神'
  rarity: z.enum(['common', 'rare', 'legendary']),
});
export const zTraitsFile = z.object({ version: z.literal(1), traits: z.array(zTraitEntry).length(37) });
```

### 4.9 `tactics.json`（manifest）

```ts
/** 戰法清單 = 07 §3.8 十二筆；unlockTraitId=null 為預設戰法（突擊/齊射）。 */
export const zTacticEntry = z.object({
  id: id(RE.tac),
  name: zName,                                     // '鐵砲三段'
  unlockTraitId: id(RE.trait).nullable(),
});
export const zTacticsFile = z.object({ version: z.literal(1), tactics: z.array(zTacticEntry).length(12) });
```

### 4.10 `policies.json`（manifest）

```ts
/** 政策清單 = 05 §3.7.2 十三筆（效果與特殊解鎖條件實作於 core，數值見 05/15）。 */
export const zPolicyEntry = z.object({
  id: id(RE.pol),
  name: zName,                                     // '樂市樂座'
  prestigeReq: int0,                               // 威信門檻
  costGold: int0,                                  // 施行費（貫）
  exclusiveWith: z.array(id(RE.pol)).default([]),  // 互斥政策
});
export const zPoliciesFile = z.object({ version: z.literal(1), policies: z.array(zPolicyEntry).length(13) });
```

### 4.11 `personas.json`

```ts
/** AI persona：每勢力一筆 `persona.<clan slug>` ＋ `persona.default`（五軸皆 50）。
 *  五軸值 = 09 §3.2 建議值表（09 為數值真相；本檔為載體）。 */
export const zPersonaEntry = z.object({
  id: id(RE.persona),
  aggression: pct100, diplomacy: pct100, development: pct100,
  loyalty: pct100, ambition: pct100,
});
export const zPersonasFile = z.object({ version: z.literal(1), personas: z.array(zPersonaEntry).min(41) });
```

### 4.12 `roads.json`（格式真相在 04 §3.4.1，此處收錄 zod 實作）

```ts
export const zRoadEdge = z.object({
  id: id(RE.road),
  a: id(RE.node), b: id(RE.node),                  // MapNodeId（城∪郡）
  type: z.enum(['land', 'sea']),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3)]), // 海路一律 1
  baseDays: z.number().min(0.5).max(8).multipleOf(0.5),
  name: zName.optional(),                          // '東海道'（渲染用）
  waypoints: z.array(z.number().int()).optional(), // 偶數長度（validate.ts 檢）
});
export const zRoadsFile = z.object({ version: z.literal(1), edges: z.array(zRoadEdge).min(1) });
```

---

## 5. 演算法與公式

### 5.1 `tools/validate.ts` 驗證器

以 `npx tsx tools/validate.ts [--regions=tokai,kinki,...]` 執行；`--regions` 為批次模式
（§7）：僅載入指定地方的城／郡／武將與其內部＋接縫邊，規模類檢查按配額表比例縮放，
連通性只要求已載入子圖為單一連通分量。輸出格式：每筆
`ERROR|WARN <檢查編號> <訊息> [ids...]`，任何 ERROR → exit code 1。

檢查清單（V1–V15；虛擬碼於後）：

| # | 級別 | 內容 |
|---|---|---|
| V1 | ERROR | 全部檔案通過 §4 zod schema；officers 檔 `region` 與檔名一致 |
| V2 | ERROR | 全域 ID 唯一（跨檔）；ID 符合 00 §8 前綴 regex |
| V3 | ERROR | 引用完整：`ownerClanId/lordId/stewardId/leaderId/homeCastleId/castleId/provinceId/personaId/traits/tactics/locationCastleId`、外交區塊與事件內全部 id 均存在 |
| V4 | ERROR | 靜態不變量子集：INV-04（城主 serving＋同勢力＋rank ≥ samurai-taisho）、INV-05（領主同勢力＋知行數 ≤ fiefCapOf(rank)）、INV-08（leaderId 屬本家）、INV-09（本城 tier='main' 屬本家）、INV-17（pact 欄位規則）、蜂窩欄位範圍（kokudaka ≤ cap 等） |
| V5 | ERROR | 街道圖（含海路）為**單一連通分量**；無重複無向邊；`a ≠ b`；海路兩端 `isPort=true`；waypoints 偶數長度 |
| V6 | ERROR | 每城轄郡數 ∈ [`BAL.dataDistrictsPerCastleMin`, `BAL.dataDistrictsPerCastleMax`]（2..4） |
| V7 | ERROR | 全國總石高 ∈ [`BAL.dataTotalKokudakaMin`, `BAL.dataTotalKokudakaMax`]；城／郡／武將／勢力總數 ∈ 對應區間（§3.2 表） |
| V8 | ERROR | `deathYear > birthYear`；`birthYear ≤ 1570`；當主 `birthYear ≤ 1545`（開局已元服）且 `deathYear ≥ 1561` |
| V9 | ERROR | 武將 `locationCastleId`：serving 者必為本家城；浪人任意城；同名武將（`name` 重複）必以生年後綴消歧（00 §8） |
| V10 | ERROR | 簡體字與日文新字體掃描：全部 JSON 的 `name`／`text`／`label` 值逐字比對黑名單（簡體黑名單見 17；新字體補充清單：沢浜竜斉塩円広辺桜関鉄験栄売徳検弾灯来；「砲」為正字不列入，見 19 §3.13 E-52） |
| V11 | ERROR | 戰法解鎖：officer.tactics 中 `unlockTraitId ≠ null` 者，其 `traits` 必含該特性（07 §3.8） |
| V12 | ERROR | 勢力色：相鄰勢力（雙方領有節點間存在 RoadEdge）之 `colorIndex` 環距 ≥ `BAL.dataClanColorMinRing`（4）；釘選勢力 index 與 §3.3 表一致 |
| V13 | ERROR | 錨點：§3.4 表 20 城 pos 與表值偏差 ≤ `BAL.dataAnchorTolerance`（16 wu）；全部節點座標唯一（間距 ≥ 8 wu） |
| V14 | ERROR | 型錄一致：traits/tactics/policies/personas JSON 的 id 集合與 core 常數表（`TRAITS`（06）/`TACTICS`（07）/政策表（05）/persona 引用）**雙向相等**；城 `soldiers ≤ castleMaxSoldiers`、`facilities.length ≤ slot 數` |
| V15 | WARN | 地方配額偏差 >10%（城／郡／石高／武將）；outline 內含檢查（04 §3.3.4，outline 檔存在時執行） |

```
main(regions?):
  files ← loadJson(all)                          // V1：zod parse，失敗即列 ERROR
  world ← merge(files)（依 regions 過濾）
  violations ← []
  violations += checkIds(world)                  // V2
  violations += checkRefs(world)                 // V3
  violations += checkStaticInvariants(world)     // V4（重用 02 §5.2 之靜態子集實作）
  violations += checkGraph(world)                // V5：BFS 自任一節點；未達節點全列出
  violations += checkCastleDistricts(world)      // V6
  violations += checkTotals(world, regions)      // V7（批次模式按配額縮放）
  violations += checkYears(world)                // V8
  violations += checkLocations(world)            // V9
  violations += scanForbiddenChars(files)        // V10（黑名單常數自 17 實作匯入）
  violations += checkTacticUnlocks(world)        // V11
  violations += checkClanColors(world)           // V12：ringDist(a,b)=min(|a−b|,40−|a−b|)
  violations += checkAnchors(world)              // V13（錨點表為 tools/anchors.ts 常數）
  violations += checkCatalogs(world)             // V14
  violations += checkQuotas(world)               // V15（WARN）
  print(violations)；exit(anyError ? 1 : 0)
```

### 5.2 `tools/stats.ts` 統計報表

`npx tsx tools/stats.ts` 輸出 Markdown 至 stdout（供人工抽查與平衡校準，15 引用）：

1. **勢力概覽表**（依石高降冪）：`勢力｜城｜郡｜石高｜兵力｜兵糧｜金錢｜武將｜平均四維｜colorIndex`。
   兵力=Σ城 soldiers；石高=Σ領郡 kokudaka。
2. **地方彙總表**：§3.2 配額表同欄位的實際值與偏差 %。
3. **全域計數**：城／郡／武將／邊（land/sea）／事件數、總石高、總人口、開發餘裕
   （Σcap−Σ現值）。
4. **前 10 大勢力**與 00 §6 校準點核對（織田 ~31 萬石、今川 ~67 萬石標記 PASS/FAIL）。

### 5.3 builder 推導規則（劇本 → 初始 GameState；02 §7 builder 的資料側輸入契約）

```
buildInitialState(s1560, seed):
  依 02 §7 建全部實體；本文件約定的補值：
  castle.durability = castle.maxDurability ?? (tier=='main' ? BAL.durabilityMain : BAL.durabilityBranch)
  castle.facilities → FacilitySlot[]：已列 typeId 填入前段 slot（buildRemainingDays 0），其餘 {typeId:null, 0}
  district.ownerClanId = castles[district.castleId].ownerClanId    // §8-D7
  officer.status = clanId ? 'serving' : 'ronin'
  officer.hasComeOfAge = (1560 − birthYear) ≥ 15
  officer.merit = 0
  officer.loyalty = 當主 100；其餘 = 06 忠誠目標值公式之初始化值（06 §5）
  clan.color = clanColorHex(colorIndex)          // 12 §5.1 公式
  diplomacy：pacts → Pact{startDay:0, endDay: months×30 或 null}；wars → lastHostileDay 0；
             sentiments → materialize 對應 DiplomacyRow（02 §5.5）
  generateRonin(state, rng.misc)                 // §3.8
  斷言 validateState(state) 零違規（02 §5.2）
```

### 5.4 本文件引入的 BAL 常數（建議初值；定案見 15）

| 常數 | 建議值 | 用途 |
|---|---|---|
| `BAL.dataTotalKokudakaMin` / `Max` | 17_500_000 / 18_500_000 | 總石高區間（石） |
| `BAL.dataCastleMin` / `Max` | 115 / 125 | 城數區間 |
| `BAL.dataDistrictMin` / `Max` | 330 / 370 | 郡數區間 |
| `BAL.dataOfficerMin` / `Max` | 550 / 650 | 具名武將數區間 |
| `BAL.dataClanMin` / `Max` | 38 / 42 | 勢力數區間 |
| `BAL.dataProvinceCount` | 60 | 國數定值 |
| `BAL.dataDistrictsPerCastleMin` / `Max` | 2 / 4 | 每城轄郡數 |
| `BAL.dataClanColorMinRing` | 4 | 相鄰勢力色環距下限 |
| `BAL.dataAnchorTolerance` | 16 | 錨點座標容差（world unit） |
| `BAL.roninPoolSize` | 40 | 程序生成浪人數 |
| `BAL.roninTraitChance` | 0.35 | 生成浪人持有 1 個普通特性之機率 |

---

## 6. UI/UX

本文件無獨立畫面；`tools/*` 為開發工具，訊息不進 i18n。僅劇本選擇畫面（16／11）
需要下列字串：

| key | 字串 |
|---|---|
| `ui.scenario.s1560.name` | `1560年　桶狹間前夜` |
| `ui.scenario.s1560.desc` | `永祿三年。今川義元大軍壓境，尾張風雨飄搖。天下大亂，群雄並起——鹿死誰手，猶未可知。` |

## 7. 實作任務清單

**工具與 schema**

- [ ] **T1 schema 實作**：`src/data/schemas/scenario.ts`（§4 全部）＋單元測試。
      驗收：§3.5 全部範例片段 parse 通過；對每個 schema 各構造 1 個非法樣本被拒。
- [ ] **T2 `tools/validate.ts`**：V1–V15＋`--regions` 批次模式。
      驗收：對每條檢查各構造 1 個違規 fixture 被偵測；東海範例資料通過 V1–V14。
- [ ] **T3 `tools/stats.ts`**：§5.2 四類報表。
      驗收：東海資料輸出中「織田 310,000 石」「今川 670,000 石」與 §3.5.3 校準檢核一致。
- [ ] **T4 builder 資料側**：§5.3 補值規則＋`generateRonin`。
      驗收：東海子集建 state 後 `validateState` 零違規；同 seed 兩次生成浪人完全相同。

**資料批次（9 批；順序 = 00 §10）**。每批完成必跑：
`validate --regions=<已完成清單>` 全綠 → `stats.ts` 對配額偏差 ≤10% → 人工抽查表全勾。

| 批 | 地方 | 主要內容（§3.5/§3.6） |
|---|---|---|
| B1 | 東海 | §3.5 範例全量＋齋藤・北畠・長島補完＋provinces（東海 6 國） |
| B2 | 近畿 | 三好圈＋京都＋足利＋接縫（中山道／鈴鹿） |
| B3 | 關東 | 北條圈＋接縫（箱根／甲州道／碓氷／三國峠） |
| B4 | 甲信越 | 武田・長尾＋川中島對峙線＋接縫 |
| B5 | 北陸 | 朝倉・一向宗加賀＋日本海航路（西段） |
| B6 | 中國 | 毛利・尼子＋山陽山陰道＋瀨戶內航路（西段） |
| B7 | 四國 | 三好阿讚＋土佐＋紀淡・來島航路 |
| B8 | 九州 | 大友・島津＋關門・豐後水道航路 |
| B9 | 東北 | 伊達圈＋奧州街道＋日本海航路（北段）；**全量 validate（無 --regions）** |

**每批人工抽查表**（全部勾選才算驗收）：

- [ ] 隨機抽 10 名武將：生卒年與史實誤差 ≤2 年（設計值除外）、無簡體／新字體字形。
- [ ] 隨機抽 5 城：座標與地理直覺相符（參照 §3.4 錨點）、轄郡 2–4、`soldiers ≤` 上限。
- [ ] 抽 3 條街道：`baseDays` 與兩端距離比例合理（§3.7 公式 ±0.5 日）。
- [ ] 路線 ETA 抽測（`computePath`，04）：清洲→駿府 8–14 日、清洲→京都 5–9 日、
      小田原→江戶 2–4 日（B3 起）、府內→內城 8–14 日（B8 起）。
- [ ] `stats.ts` 地方石高／城數偏差 ≤10%；該地方前三大勢力排序符合史實體感。
- [ ] V12 色盤檢查零違規。
- [ ] 該批新增專有名詞抽 20 個與 `19-glossary` 用字規範不衝突。

**收尾**

- [ ] **T5 `events.json`**：15 事件全量（數值以 10 定案為準）。
      驗收：zod 通過；`evt.okehazama` 於 golden fixture 觸發一次（17 EV1）。
- [ ] **T6 型錄檔**：traits（37）／tactics（12）／policies（13）／personas（42 筆含 default）。
      驗收：V14 雙向相等通過。
- [ ] **T7 `index.ts` 彙整**＋動態載入接線（01）。
      驗收：`npm run build` 後主 bundle 不含劇本 JSON；標題畫面可載入 s1560。

## 8. 設計決策記錄

- **D1｜型錄採「JSON manifest＋core 常數表」雙層**：06/07/05 已規定效果本體以 TS 常數
  實作於 core（引用 BAL），資料層只需 id／名稱／門檻等 manifest 欄位供劇本引用完整性
  驗證與 UI 列表；V14 以雙向集合相等防止兩層漂移。避免把公式數值抄進 JSON 造成雙重真相。
- **D2｜traits.json 為 37 筆**：06 §3.3 列 30 筆，07 §8-D13 另宣告 10 個戰法解鎖特性為
  canonical，其中 7 個不在 06 表中。依 07「06 的特性表必須包含這些 id」之約束，資料層
  以 30＋7=37 收錄；新 7 筆 rarity 皆為 `rare`、效果僅「解鎖對應戰法」（06 實作時補入
  TRAITS 表）。
- **D3｜松平獨立成家、以 vassal 協定表現「今川麾下」**：09 勢力表已含 `clan.matsudaira`
  且開局從屬今川。元康與三河眾歸屬松平家而非今川家武將，桶狹間後的清洲同盟事件
  （`evt.kiyosu-domei`）只需破棄 vassal 協定即可重現史實走向，不需武將轉籍邏輯。
- **D4｜國數定為 60**：以 63 個令制國（排除蝦夷與壹岐・對馬・隱岐・佐渡・淡路離島）為底，
  將志摩・伊賀→伊勢、安房→上總、若狹→越前、飛驒→美濃、美作→備前、丹後→丹波、
  磐城→岩代 併合，同時把陸奧分為陸奧・陸中・陸前・岩代、出羽分為羽前・羽後
  （沿用通行的分國慣例），得 60 國。理由：00 §10「~58」為約數，而 00 同節「每國 1–4 城」
  是硬約束——不分割陸奧則其須容納 8+ 城，必然違反；60 在兩者間取得一致。
- **D5｜勢力 41 家 = 09 表 40 大名＋足利將軍家**：02 §4.12 規定 s1560 的
  `shogunClanId = 'clan.ashikaga'`，故足利必須以 Clan 實體存在（領二條御所一城）。
  41 落在 00 §10 的 38–42 區間。足利 persona 未列於 09 表 → 依 09 規則用 `persona.default`。
- **D6｜colorIndex 定案表與釘選調整**：12 §3.1.3 的釘選為建議值；北條 21→20 因與長尾
  釘選 24 環距僅 3（北條與上杉方上野城相鄰）而調整一格（仍為水色系）。41 家 40 色必有
  一組重複：取足利＝佐竹＝16（山城／常陸無相鄰可能）。clans.json 存 `colorIndex`，
  builder 以 12 §5.1 公式轉出 02 之 `Clan.color` hex——單一真相在 index，hex 為衍生。
- **D7｜郡不存 `ownerClanId`**：開局郡歸屬一律等於所轄城歸屬，由 builder 推導，
  資料層省欄位並排除「開局飛地」這類需要額外驗證的狀態。鳴海・大高等桶狹間前沿
  以事件敘事表現，不做資料級飛地。
- **D8｜castles.json 增列 `coastal`**：05 §3.4.2 的湊／南蠻寺以 `coastal === true` 為
  建設條件，02 Castle 未列該欄；比照 04 為 `District.isPort` 開欄之先例，由本文件定義
  資料欄位、02 收錄執行期欄位。`coastal` 與 `isPort` 語意不同：前者是城的施設資格，
  後者是郡的海路端點資格。
- **D9｜事件敘事文字存於 events.json**：事件標題／本文／選項與人名地名同屬劇本內容
  （專有名詞不進 i18n，00 §8 精神）；i18n 表只收系統 UI 字串。多語系化非 v1.0 範圍。
- **D10｜浪人生成在 builder 而非資料檔**：40 名無名浪人若寫死於 JSON 會佔配額且無趣；
  以 `rng.misc` 流在建局時生成可保決定論（同 seed 同浪人），又讓每局面貌小幅變化。
- **D11｜officers 按「所屬勢力本城地方」分檔**：以勢力為單位整批製作最順手（家臣表
  一次寫完），跨地方領地（長尾上野眾等）不會把一家拆進兩檔；builder 載入即合併，
  分檔純屬製作管理。
- **D12｜四維與特性由本文件直接定案東海樣板**：能力值屬內容資料而非機制數值，
  不設 BAL 常數；以 §3.5.5 樣板＋§3.6 的傳說特性限額（≤12 人、`trait.gunshin` 限 4 人）
  控制全國通膨，V15/stats 的平均四維欄位供 15 平衡調校時複查。




