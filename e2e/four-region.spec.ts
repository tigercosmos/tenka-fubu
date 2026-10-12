import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

const cases = [
  {
    clanId: 'clan.date',
    name: '伊達',
    capital: 'castle.yonezawa',
    castles: ['castle.yonezawa', 'castle.koori-nishiyama', 'castle.namo'],
  },
  {
    clanId: 'clan.ashina',
    name: '蘆名',
    capital: 'castle.kurokawa',
    castles: ['castle.kurokawa', 'castle.naganuma', 'castle.shirakawa'],
  },
  {
    clanId: 'clan.mogami',
    name: '最上',
    capital: 'castle.yamagata',
    castles: ['castle.yamagata', 'castle.kaminoyama'],
  },
  {
    clanId: 'clan.nanbu',
    name: '南部',
    capital: 'castle.sannohe',
    castles: ['castle.sannohe', 'castle.kunohe', 'castle.kozukata', 'castle.hanamaki'],
  },
  {
    clanId: 'clan.ando',
    name: '安東',
    capital: 'castle.hiyama',
    castles: ['castle.hiyama', 'castle.minato'],
  },
  {
    clanId: 'clan.shimazu',
    name: '島津',
    capital: 'castle.uchijo',
    castles: ['castle.uchijo', 'castle.kaseda', 'castle.shimizu'],
  },
  {
    clanId: 'clan.otomo',
    name: '大友',
    capital: 'castle.funai',
    castles: [
      'castle.funai',
      'castle.usuki',
      'castle.kokura',
      'castle.tachibanayama',
      'castle.kumamoto',
      'castle.yanagawa',
    ],
  },
  {
    clanId: 'clan.ryuzoji',
    name: '龍造寺',
    capital: 'castle.muranaka',
    castles: ['castle.muranaka', 'castle.hasuike'],
  },
  {
    clanId: 'clan.ito',
    name: '伊東',
    capital: 'castle.tonokori',
    castles: ['castle.tonokori', 'castle.sadowara'],
  },
  {
    clanId: 'clan.sagara',
    name: '相良',
    capital: 'castle.hitoyoshi',
    castles: ['castle.hitoyoshi'],
  },
  {
    clanId: 'clan.chosokabe',
    name: '長宗我部',
    capital: 'castle.oko',
    castles: ['castle.oko'],
  },
  {
    clanId: 'clan.ichijo',
    name: '一條',
    capital: 'castle.nakamura',
    castles: ['castle.nakamura'],
  },
  {
    clanId: 'clan.kono',
    name: '河野',
    capital: 'castle.yuzuki',
    castles: ['castle.yuzuki', 'castle.kurushima'],
  },
  {
    clanId: 'clan.saionji',
    name: '西園寺',
    capital: 'castle.kurose',
    castles: ['castle.kurose'],
  },
  {
    clanId: 'clan.miyoshi',
    name: '三好',
    capital: 'castle.akutagawa',
    castles: [
      'castle.shoryuji',
      'castle.akutagawa',
      'castle.iimoriyama',
      'castle.takaya',
      'castle.kishiwada',
      'castle.shigisan',
      'castle.shozui',
      'castle.sogo',
      'castle.toramaru',
    ],
  },
  {
    clanId: 'clan.mori',
    name: '毛利',
    capital: 'castle.yoshida-koriyama',
    castles: [
      'castle.yoshida-koriyama',
      'castle.sato-kanayama',
      'castle.sakurao',
      'castle.konomine',
      'castle.katsuyama',
      'castle.bitchu-matsuyama',
      'castle.kannabe',
    ],
  },
  {
    clanId: 'clan.amago',
    name: '尼子',
    capital: 'castle.gassan-toda',
    castles: ['castle.gassan-toda', 'castle.shiraga', 'castle.yamabuki', 'castle.yonago'],
  },
  {
    clanId: 'clan.uragami',
    name: '浦上',
    capital: 'castle.tenjinyama',
    castles: ['castle.tenjinyama', 'castle.mitsuishi'],
  },
  {
    clanId: 'clan.akamatsu',
    name: '赤松',
    capital: 'castle.okishio',
    castles: ['castle.okishio', 'castle.tatsuno'],
  },
  {
    clanId: 'clan.yamana',
    name: '山名',
    capital: 'castle.konosumiyama',
    castles: ['castle.konosumiyama', 'castle.takeda', 'castle.tottori'],
  },
  {
    clanId: 'clan.hojo',
    name: '北條',
    capital: 'castle.odawara',
    castles: [
      'castle.edo',
      'castle.kawagoe',
      'castle.matsuyama',
      'castle.odawara',
      'castle.tamanawa',
      'castle.nirayama',
      'castle.takiyama',
    ],
  },
  {
    clanId: 'clan.asakura',
    name: '朝倉',
    capital: 'castle.ichijodani',
    castles: ['castle.ichijodani', 'castle.kanegasaki', 'castle.ono', 'castle.nochiseyama'],
  },
  {
    clanId: 'clan.hatakeyama',
    name: '畠山',
    capital: 'castle.nanao',
    castles: ['castle.nanao', 'castle.suemori'],
  },
  {
    clanId: 'clan.jinbo',
    name: '神保',
    capital: 'castle.toyama',
    castles: ['castle.toyama', 'castle.masuyama'],
  },
  {
    clanId: 'clan.nagao',
    name: '長尾',
    capital: 'castle.kasugayama',
    castles: [
      'castle.kasugayama',
      'castle.tochio',
      'castle.sakado',
      'castle.iiyama',
      'castle.minowa',
      'castle.umayabashi',
    ],
  },
] as const;

for (const scenario of cases) {
  test(`nine-region production ${scenario.clanId} native wizard and manual save/load`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?debug=1&seed=42');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId(`clan-pick-${scenario.clanId}`).click();
    await completeNewGameWizard(page);
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('speed-pause').click();
    const before = await page.evaluate(() => window.__tenka.debug.getState());
    expect(before.meta.playerClanId).toBe(scenario.clanId);
    expect(before.meta.seed).toBe(42);
    expect(Object.keys(before.castles)).toHaveLength(121);
    expect(Object.keys(before.clans)).toHaveLength(41);
    expect(Object.keys(before.districts)).toHaveLength(344);
    expect(Object.keys(before.provinces)).toHaveLength(60);
    expect(
      [...new Set(Object.values(before.provinces).map((province) => province.region))].sort(),
    ).toEqual(
      [
        'tokai',
        'kinki',
        'kanto',
        'koshinetsu',
        'hokuriku',
        'chugoku',
        'shikoku',
        'kyushu',
        'tohoku',
      ].sort(),
    );
    const clan = Object.values(before.clans).find((entry) => entry.id === scenario.clanId)!;
    expect(clan.homeCastleId).toBe(scenario.capital);
    expect(
      Object.values(before.castles)
        .filter((castle) => castle.ownerClanId === scenario.clanId)
        .map((castle) => castle.id)
        .sort(),
    ).toEqual([...scenario.castles].sort());

    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '存檔', exact: true }).click();
    const panel = page.getByTestId('save-load-panel');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    const slot = page.getByTestId('save-slot-manual:1');
    await slot.getByRole('button', { name: '存檔', exact: true }).click();
    await expect(slot).toContainText(scenario.name);
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);

    await page.reload();
    await page.getByTestId('title-save-list').click();
    await expect(panel).toHaveAttribute('data-context', 'title');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await slot.getByRole('button', { name: '載入', exact: true }).click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    const after = await page.evaluate(() => window.__tenka.debug.getState());
    expect(after).toEqual(before);
    const path = info.outputPath('nine-region-save-roundtrip.json');
    await writeFile(path, JSON.stringify({ clanId: scenario.clanId, before, after }, null, 2));
    await info.attach('nine-region-save-roundtrip', { path, contentType: 'application/json' });
    const screenshot = info.outputPath('nine-region-restored.png');
    await page.screenshot({ path: screenshot });
    await info.attach('nine-region-restored', { path: screenshot, contentType: 'image/png' });
  });
}
