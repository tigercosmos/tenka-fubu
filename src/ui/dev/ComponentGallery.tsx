import { useRef, useState, type ReactNode } from 'react';
import {
  Badge,
  CastleListItem,
  ConfirmDialog,
  ContextPanel,
  DataTable,
  Dialog,
  EmptyState,
  IconButton,
  MenuList,
  NumberSlider,
  OfficerCard,
  Panel,
  ProgressBar,
  ReportStack,
  ResourceBar,
  SpeedControl,
  StatBar,
  TabView,
  Tooltip,
  type ColumnDef,
  type GameSpeed,
  type SortState,
  type ToastItem,
} from '../components';
import { Icon, type IconName } from '../components/IconButton/icons';
import { KamonIcon, KAMON_SHAPES } from '../components/KamonIcon';
import { GameSelectorProvider } from '../hooks/useGameSelector';
import { MotionProvider } from '../motion/MotionProvider';
import { TOKENS } from '../styles/tokens';
import {
  createGalleryStore,
  GALLERY_CASTLE,
  GALLERY_CLAN,
  GALLERY_OFFICER,
  GALLERY_BRANCH,
  GALLERY_LOW_LOYALTY,
} from './galleryFixture';
import styles from './ComponentGallery.module.css';

const sectionNames = [
  'Panel',
  'Dialog',
  'Tooltip',
  'TabView',
  'DataTable',
  'OfficerCard',
  'CastleListItem',
  'ResourceBar',
  'StatBar',
  'NumberSlider',
  'SpeedControl',
  'ReportStack',
  'ContextPanel',
  'ConfirmDialog',
  'Badge',
  'ProgressBar',
  'IconButton',
  'MenuList',
  'EmptyState',
  'KamonIcon',
] as const;
const families: readonly { label: string; icons: readonly IconName[] }[] = [
  {
    label: '導航／時間',
    icons: [
      'close',
      'pause',
      'play',
      'ff2',
      'ff5',
      'plus',
      'minus',
      'chevron-left',
      'chevron-right',
      'chevron-up',
      'chevron-down',
      'arrow-up',
      'arrow-down',
    ],
  },
  { label: '資源／內政', icons: ['coin', 'rice', 'castle', 'people', 'crown'] },
  { label: '軍事／外交', icons: ['sword', 'army', 'siege', 'handshake', 'flag'] },
  { label: '地圖／圖層', icons: ['road', 'bridge', 'terrain', 'layer', 'pin'] },
  { label: '狀態／警告', icons: ['supply', 'morale', 'warning', 'blocked', 'eye', 'eye-off'] },
  { label: '系統／資料', icons: ['gear', 'scroll', 'search', 'book'] },
];
const tableRows = Array.from({ length: 650 }, (_, i) => ({
  id: String(i + 1),
  name: `展示第${i + 1}城`,
  soldiers: (i + 1) * 100,
}));
type TableRow = (typeof tableRows)[number];
const columns: ColumnDef<TableRow>[] = [
  {
    key: 'name',
    header: '城名',
    sortable: true,
    sortValue: (row) => row.name,
    render: (row) => row.name,
  },
  {
    key: 'soldiers',
    header: '兵力',
    align: 'right',
    sortable: true,
    sortValue: (row) => row.soldiers,
    render: (row) => row.soldiers,
  },
];
function Example({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className={styles.example}>
      <h3>{name}</h3>
      {children}
    </div>
  );
}
function Section({ name, children }: { name: (typeof sectionNames)[number]; children: ReactNode }) {
  return (
    <section id={`gallery-${name}`} data-gallery-component={name} className={styles.section}>
      <h2>{name}</h2>
      <div className={styles.examples}>{children}</div>
    </section>
  );
}

/** DEV route only. Its provider and interactions never enter a real game session. */
export default function ComponentGallery() {
  const [fixture] = useState(createGalleryStore);
  const [dialog, setDialog] = useState<'sm' | 'md' | 'lg' | null>(null);
  const [confirm, setConfirm] = useState<'normal' | 'danger' | null>(null);
  const [confirmed, setConfirmed] = useState(0);
  const [tab, setTab] = useState('first');
  const [sort, setSort] = useState<SortState>({ key: 'soldiers', dir: 'asc' });
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [selectedOfficer, setSelectedOfficer] = useState(false);
  const [selectedCastle, setSelectedCastle] = useState(false);
  const [slider, setSlider] = useState(1200);
  const [speed, setSpeed] = useState<GameSpeed>('paused');
  const [contextOpen, setContextOpen] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [menu, setMenu] = useState('未選擇');
  const [emptyAction, setEmptyAction] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const addToast = (severity: ToastItem['severity']) => {
    toastSeq.current++;
    setToasts((current) => [
      {
        id: `gallery-toast-${toastSeq.current}`,
        severity,
        title: severity === 'critical' ? '重要通知：請手動關閉' : '情報通知：可暫停倒數',
        body: '滑鼠移入暫停倒數；可使用鍵盤關閉。',
        date: 90,
      },
      ...current,
    ]);
  };
  return (
    <MotionProvider>
      <GameSelectorProvider value={fixture}>
        <div className={styles.gallery} data-testid="component-gallery">
          <nav className={styles.sidebar} aria-label="元件錨點目錄">
            <h1>元件展示</h1>
            <p>僅開發模式；全部操作只影響展示資料。</p>
            {sectionNames.map((name) => (
              <a
                key={name}
                href={`#/dev/components#gallery-${name}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(`gallery-${name}`)?.scrollIntoView();
                }}
              >
                {name}
              </a>
            ))}
          </nav>
          <main className={styles.content}>
            <Section name="Panel">
              <Example name="預設">
                <Panel title="一般和紙面板">預設內距與標題。</Panel>
              </Example>
              <Example name="角飾／小內距">
                <Panel title="角飾面板" variant="ornate" padding="space2">
                  四角裝飾。
                </Panel>
              </Example>
              <Example name="無標題／空態">
                <Panel>
                  <EmptyState text="尚無內容" />
                </Panel>
              </Example>
            </Section>
            <Section name="Dialog">
              {(['sm', 'md', 'lg'] as const).map((size) => (
                <Example key={size} name={`尺寸 ${size}`}>
                  <button type="button" onClick={() => setDialog(size)}>
                    開啟{size}對話框
                  </button>
                </Example>
              ))}
              <Dialog
                open={dialog !== null}
                size={dialog ?? 'md'}
                title="展示對話框"
                onClose={() => setDialog(null)}
                footer={
                  <button type="button" onClick={() => setDialog(null)}>
                    關閉展示
                  </button>
                }
              >
                <label>
                  展示輸入
                  <input aria-label="展示輸入" />
                </label>
                <p>Tab焦點留在對話框；輸入中的Escape先離開輸入，再按Escape關閉並還原開啟前焦點。</p>
              </Dialog>
            </Section>
            <Section name="Tooltip">
              <Example name="預設／滑鼠與鍵盤">
                <Tooltip content="這是提示內容">
                  <button type="button">聚焦或停留顯示提示</button>
                </Tooltip>
              </Example>
              <Example name="富內容／跟隨">
                <Tooltip
                  follow
                  content={
                    <>
                      <strong>每月收入</strong>
                      <p>商業：增加320貫</p>
                    </>
                  }
                >
                  <button type="button">跟隨游標提示</button>
                </Tooltip>
              </Example>
              <Example name="停用">
                <Tooltip disabled content="不應出現">
                  <button type="button">提示停用</button>
                </Tooltip>
              </Example>
            </Section>
            <Section name="TabView">
              {(['line', 'contained'] as const).map((variant) => (
                <Example
                  name={variant === 'line' ? '線條／已選取／停用' : '包覆／徽章'}
                  key={variant}
                >
                  <TabView
                    variant={variant}
                    activeId={tab}
                    onChange={setTab}
                    keepMounted
                    tabs={[
                      { id: 'first', label: '第一頁' },
                      { id: 'second', label: '第二頁', badge: 3 },
                      { id: 'locked', label: '不可用', disabled: true },
                    ]}
                  >
                    <TabView.Pane id="first">第一頁內容</TabView.Pane>
                    <TabView.Pane id="second">第二頁內容</TabView.Pane>
                  </TabView>
                </Example>
              ))}
            </Section>
            <Section name="DataTable">
              <Example name="650列／虛擬捲動／排序／選取">
                <p>650列假資料；畫面只掛載可見列。已選取：{selectedRow ?? '無'}</p>
                <div data-testid="gallery-large-table">
                  <DataTable
                    rows={tableRows}
                    columns={columns}
                    rowKey={(row) => row.id}
                    height={320}
                    sort={sort}
                    onSortChange={setSort}
                    selectedKey={selectedRow}
                    onRowClick={(row) => setSelectedRow(row.id)}
                  />
                </div>
              </Example>
              <Example name="空態">
                <DataTable
                  rows={[]}
                  columns={columns}
                  rowKey={(row) => row.id}
                  emptyText="沒有展示列"
                />
              </Example>
            </Section>
            <Section name="OfficerCard">
              {(['sm', 'md', 'lg'] as const).map((size) => (
                <Example name={`尺寸 ${size}`} key={size}>
                  <OfficerCard
                    officerId={GALLERY_OFFICER}
                    size={size}
                    onClick={() => setSelectedOfficer(!selectedOfficer)}
                    selected={selectedOfficer}
                  />
                </Example>
              ))}
              <Example name="停用／原因">
                <OfficerCard
                  officerId={GALLERY_OFFICER}
                  disabled
                  disabledReason="武將正在展示任務中"
                  onClick={() => setSelectedOfficer(true)}
                />
              </Example>
              <Example name="不顯示忠誠">
                <OfficerCard officerId={GALLERY_OFFICER} showLoyalty={false} />
              </Example>
              <Example name="低忠誠／無役職">
                <OfficerCard officerId={GALLERY_LOW_LOYALTY} />
              </Example>
            </Section>
            <Section name="CastleListItem">
              <Example name="預設／選取">
                <CastleListItem
                  castleId={GALLERY_CASTLE}
                  selected={selectedCastle}
                  onClick={() => setSelectedCastle(!selectedCastle)}
                />
              </Example>
              <Example name="不顯示守備">
                <CastleListItem castleId={GALLERY_CASTLE} showGarrison={false} />
              </Example>
              <Example name="支城／被圍／低耐久">
                <CastleListItem castleId={GALLERY_BRANCH} />
              </Example>
            </Section>
            <Section name="ResourceBar">
              <Example name="收入／支出明細／勢力識別">
                <ResourceBar
                  gold={1200}
                  goldDelta={{
                    perMonth: 320,
                    breakdown: [
                      { label: '商業收入', value: 500 },
                      { label: '俸祿', value: -180 },
                    ],
                  }}
                  foodTotal={6000}
                  foodDelta={{ perMonth: -200, breakdown: [{ label: '糧食消耗', value: -200 }] }}
                  soldiersTotal={2400}
                  soldiersCap={5000}
                  prestige={800}
                  date={90}
                  clanName="展示家"
                  clanColorIndex={5}
                />
              </Example>
              <Example name="零資源／無識別">
                <ResourceBar
                  gold={0}
                  goldDelta={{ perMonth: 0, breakdown: [] }}
                  foodTotal={0}
                  foodDelta={{ perMonth: 0, breakdown: [] }}
                  soldiersTotal={0}
                  soldiersCap={0}
                  prestige={0}
                  date={90}
                />
              </Example>
            </Section>
            <Section name="StatBar">
              <Example name="預設">
                <StatBar label="統率" value={92} />
              </Example>
              <Example name="破百／比較">
                <StatBar label="武勇" value={110} compareValue={120} />
              </Example>
              <Example name="零值／自訂寬／隱藏數字">
                <StatBar label="尚無兵力" value={0} width={180} max={100} showValue={false} />
              </Example>
            </Section>
            <Section name="NumberSlider">
              <Example name="即時值／快速比例／鍵盤">
                <NumberSlider
                  label="展示兵數"
                  min={0}
                  max={5000}
                  value={slider}
                  onChange={setSlider}
                  unit="兵"
                />
              </Example>
              <Example name="固定零範圍">
                <NumberSlider label="無可用兵力" min={0} max={0} value={0} onChange={() => {}} />
              </Example>
            </Section>
            <Section name="SpeedControl">
              <Example name="暫停／全部檔位">
                <SpeedControl speed={speed} onChange={setSpeed} />
              </Example>
              <Example name="停用">
                <SpeedControl speed="x2" disabled onChange={setSpeed} />
              </Example>
            </Section>
            <Section name="ReportStack">
              <Example name="空態／資訊／重要／收合／倒數">
                <button type="button" onClick={() => addToast('info')}>
                  加一條情報
                </button>
                <button type="button" onClick={() => addToast('critical')}>
                  加一條重要
                </button>
                <button type="button" onClick={() => addToast('success')}>
                  加一條成功
                </button>
                <button type="button" onClick={() => addToast('warning')}>
                  加一條警告
                </button>
                <div className={styles.toastStage}>
                  <ReportStack
                    items={toasts}
                    onDismiss={(id) =>
                      setToasts((current) => current.filter((item) => item.id !== id))
                    }
                  />
                </div>
              </Example>
            </Section>
            <Section name="ContextPanel">
              <Example name="開啟／收合／標題動作">
                <button type="button" onClick={() => setContextOpen(!contextOpen)}>
                  切換上下文面板
                </button>
                <div className={styles.contextStage} hidden={!contextOpen}>
                  <ContextPanel
                    open={contextOpen}
                    title="展示城上下文"
                    height={180}
                    onClose={() => setContextOpen(false)}
                    actions={
                      <button type="button" onClick={() => setContextOpen(false)}>
                        收合
                      </button>
                    }
                  >
                    展示內容不操作地圖。
                  </ContextPanel>
                </div>
              </Example>
            </Section>
            <Section name="ConfirmDialog">
              <Example name="一般／危險／取消優先">
                <button type="button" onClick={() => setConfirm('normal')}>
                  開啟一般確認
                </button>
                <button type="button" onClick={() => setConfirm('danger')}>
                  開啟危險確認
                </button>
                <p role="status">展示確認次數：{confirmed}</p>
                <ConfirmDialog
                  open={confirm !== null}
                  title="展示確認"
                  message="這個操作只增加展示次數。"
                  danger={confirm === 'danger'}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => {
                    setConfirmed((count) => count + 1);
                    setConfirm(null);
                  }}
                />
              </Example>
            </Section>
            <Section name="Badge">
              <Example name="小／中／標籤／色章">
                <Badge clanId={GALLERY_CLAN} label="展示家" />
                <Badge clanId={GALLERY_CLAN} label="展示家" size="md" />
                <Badge clanId={GALLERY_CLAN} />
              </Example>
              <Example name="中立">
                <Badge label="浪人" />
                <Badge size="md" />
              </Example>
            </Section>
            <Section name="ProgressBar">
              {(['gold', 'moss', 'vermilion', 'indigo'] as const).map((color) => (
                <Example name={color} key={color}>
                  <ProgressBar value={65} max={100} color={color} label={`${color}進度`} />
                </Example>
              ))}
              <Example name="空／滿／零上限">
                <ProgressBar value={0} max={100} label="空進度" />
                <ProgressBar value={100} max={100} height={16} label="滿進度" />
                <ProgressBar value={0} max={0} label="尚無上限" />
              </Example>
            </Section>
            <Section name="IconButton">
              <Example name="尺寸／已選取／停用／滑鼠說明">
                <IconButton
                  icon="sword"
                  ariaLabel="小圖示"
                  size="sm"
                  onClick={() => setToggled(!toggled)}
                  toggled={toggled}
                />
                <IconButton
                  icon="sword"
                  ariaLabel="中圖示"
                  onClick={() => setToggled(!toggled)}
                  toggled={toggled}
                />
                <IconButton
                  icon="castle"
                  ariaLabel="大圖示"
                  size="lg"
                  onClick={() => setToggled(!toggled)}
                  toggled={toggled}
                />
                <IconButton icon="sword" ariaLabel="停用圖示" disabled onClick={() => {}} />
              </Example>
              {families.map((family) => (
                <Example name={family.label} key={family.label}>
                  <div className={styles.iconGrid}>
                    {family.icons.map((icon) => (
                      <div key={icon}>
                        <span>{icon}</span>
                        {([16, 24, 32] as const).map((size) => (
                          <Icon
                            key={size}
                            name={icon}
                            width={size}
                            height={size}
                            data-gallery-icon={`${icon}-${size}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </Example>
              ))}
            </Section>
            <Section name="MenuList">
              <Example name="一般／停用原因／危險／方向鍵">
                <MenuList
                  items={[
                    { id: 'normal', label: '一般動作', icon: 'book' },
                    {
                      id: 'locked',
                      label: '停用動作',
                      disabled: true,
                      disabledReason: '展示條件未達成',
                    },
                    { id: 'danger', label: '危險動作', icon: 'warning', danger: true },
                  ]}
                  onSelect={setMenu}
                />
                <p role="status">選單結果：{menu}</p>
              </Example>
            </Section>
            <Section name="EmptyState">
              <Example name="預設／自訂圖示">
                <EmptyState text="尚無展示資料" />
                <EmptyState icon="people" text="沒有武將" />
              </Example>
              <Example name="可執行動作">
                <EmptyState
                  text={emptyAction ? '展示動作已完成' : '等待展示動作'}
                  actionText="執行展示動作"
                  onAction={() => setEmptyAction(true)}
                />
              </Example>
            </Section>
            <Section name="KamonIcon">
              <Example name="十二種原創幾何家紋／16、24、64像素">
                <div className={styles.iconGrid}>
                  {KAMON_SHAPES.map((shape) => (
                    <div key={shape}>
                      <span>{shape}</span>
                      {([16, 24, 64] as const).map((size) => (
                        <KamonIcon
                          key={size}
                          spec={{ shape, fg: TOKENS.color.ink900, bg: TOKENS.color.washi100 }}
                          size={size}
                          label={`${shape}家紋${size}像素`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </Example>
            </Section>
          </main>
        </div>
      </GameSelectorProvider>
    </MotionProvider>
  );
}
