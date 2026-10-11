import { describe, expect, it } from 'vitest';
import { filterCastleRibbonLeaderObstacles } from '../../src/ui/map/sceneParts/castleRibbonLeader';

// Captured actual s1560/Oda Kii view; independent of runtime /tmp artifacts.
const kii = {
  ribbons: [
    {
      id: 'castle.akutagawa',
      anchor: { x: 447.51293103448234, y: 112.60344827586232 },
      baseline: {
        x: 365.14382443640125,
        y: 147.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.bitchu-matsuyama',
      anchor: { x: -251.48706896551766, y: 132.10344827586232 },
      baseline: {
        x: -313.76917574670415,
        y: 158.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.gassan-toda',
      anchor: { x: -401.48706896551766, y: -88.39655172413768 },
      baseline: {
        x: -491.35617556359875,
        y: -53.10365850532435,
        width: 173.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.hikuma',
      anchor: { x: 1191.5129310344823, y: 172.60344827586232 },
      baseline: {
        x: 1132.4073244211427,
        y: 198.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.hino',
      anchor: { x: 671.0129310344823, y: 48.10344827586232 },
      baseline: {
        x: 603.9073244211427,
        y: 74.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.ichijodani',
      anchor: { x: 686.0129310344823, y: -344.8965517241377 },
      baseline: {
        x: 603.6438244364012,
        y: -309.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.iimoriyama',
      anchor: { x: 458.01293103448234, y: 169.60344827586232 },
      baseline: {
        x: 384.4073244211427,
        y: 195.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.inabayama',
      anchor: { x: 858.5129310344823, y: -119.89655172413768 },
      baseline: {
        x: 784.1438244364012,
        y: -84.60365850532435,
        width: 150.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.ishiyama',
      anchor: { x: 413.01293103448234, y: 184.60344827586232 },
      baseline: {
        x: 330.64382443640125,
        y: 219.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.iwadono',
      anchor: { x: 1620.5129310344823, y: -193.39655172413768 },
      baseline: {
        x: 1558.2308242532959,
        y: -167.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.iwamura',
      anchor: { x: 1094.0129310344823, y: -88.39655172413768 },
      baseline: {
        x: 1039.7308242532959,
        y: -62.10365850532435,
        width: 109.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.kakegawa',
      anchor: { x: 1290.5129310344823, y: 148.60344827586232 },
      baseline: {
        x: 1231.4073244211427,
        y: 174.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.kanegasaki',
      anchor: { x: 609.5129310344823, y: -212.89655172413768 },
      baseline: {
        x: 547.2308242532959,
        y: -186.60365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.kannabe',
      anchor: { x: -338.48706896551766, y: 240.10344827586232 },
      baseline: {
        x: -405.59267557885755,
        y: 266.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.kannonji',
      anchor: { x: 630.5129310344823, y: -4.39655172413768 },
      baseline: {
        x: 548.1438244364012,
        y: 30.896341494675653,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.kiriyama',
      anchor: { x: 672.5129310344823, y: 237.10344827586232 },
      baseline: {
        x: 590.1438244364012,
        y: 272.39634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.kishiwada',
      anchor: { x: 363.51293103448234, y: 276.1034482758623 },
      baseline: {
        x: 289.9073244211427,
        y: 302.39634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.kiyosu',
      anchor: { x: 900.5129310344823, y: -23.89655172413768 },
      baseline: {
        x: 833.8509312175879,
        y: 11.60344827586232,
        width: 134.82399963378907,
        height: 22.5,
      },
    },
    {
      id: 'castle.kokokuji',
      anchor: { x: 1592.0129310344823, y: 3.10344827586232 },
      baseline: {
        x: 1526.4073244211427,
        y: 29.396341494675653,
        width: 132.5041064454932,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.konosumiyama',
      anchor: { x: 188.01293103448234, y: -128.89655172413768 },
      baseline: {
        x: 105.64382443640125,
        y: -93.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.kurushima',
      anchor: { x: -479.48706896551766, y: 409.6034482758623 },
      baseline: {
        x: -541.7691757467041,
        y: 435.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.matsuyama',
      anchor: { x: 1785.5129310344823, y: -361.3965517241377 },
      baseline: {
        x: 1718.4073244211427,
        y: -335.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.nagashima',
      anchor: { x: 821.0129310344823, y: 19.60344827586232 },
      baseline: {
        x: 753.9073244211427,
        y: 45.89634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.nakamura',
      anchor: { x: -489.98706896551766, y: 862.6034482758623 },
      baseline: {
        x: -572.3561755635988,
        y: 897.8963414946757,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.nijo',
      anchor: { x: 503.01293103448234, y: 52.60344827586232 },
      baseline: {
        x: 420.64382443640125,
        y: 87.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.nirayama',
      anchor: { x: 1623.5129310344823, y: 36.10344827586232 },
      baseline: {
        x: 1561.2308242532959,
        y: 62.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.nochiseyama',
      anchor: { x: 494.01293103448234, y: -140.89655172413768 },
      baseline: {
        x: 425.23082425329585,
        y: -114.60365850532435,
        width: 130.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.odani',
      anchor: { x: 681.5129310344823, y: -145.39655172413768 },
      baseline: {
        x: 606.6438244364012,
        y: -110.10365850532435,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.odawara',
      anchor: { x: 1691.0129310344823, y: -47.89655172413768 },
      baseline: {
        x: 1608.6438244364012,
        y: -12.603658505324347,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.ogaki',
      anchor: { x: 803.0129310344823, y: -88.39655172413768 },
      baseline: {
        x: 743.9073244211427,
        y: -62.10365850532435,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.okazaki',
      anchor: { x: 995.0129310344823, y: 76.60344827586232 },
      baseline: {
        x: 920.1438244364012,
        y: 111.89634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.okishio',
      anchor: { x: 120.51293103448234, y: 88.60344827586232 },
      baseline: {
        x: 45.643824436401246,
        y: 123.89634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.oko',
      anchor: { x: -243.98706896551766, y: 618.1034482758623 },
      baseline: {
        x: -318.85617556359875,
        y: 653.3963414946757,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.saika',
      anchor: { x: 293.01293103448234, y: 369.1034482758623 },
      baseline: {
        x: 225.90732442114268,
        y: 395.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.sawayama',
      anchor: { x: 674.0129310344823, y: -56.89655172413768 },
      baseline: {
        x: 600.4073244211427,
        y: -30.603658505324347,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.shigisan',
      anchor: { x: 468.51293103448234, y: 214.60344827586232 },
      baseline: {
        x: 394.9073244211427,
        y: 240.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.shiraga',
      anchor: { x: -458.48706896551766, y: -145.39655172413768 },
      baseline: {
        x: -525.5926755788576,
        y: -119.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.shoryuji',
      anchor: { x: 479.01293103448234, y: 85.60344827586232 },
      baseline: {
        x: 405.4073244211427,
        y: 111.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.shozui',
      anchor: { x: 65.01293103448234, y: 405.1034482758623 },
      baseline: {
        x: 2.73082425329585,
        y: 431.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.sogo',
      anchor: { x: -78.98706896551766, y: 352.6034482758623 },
      baseline: {
        x: -141.26917574670415,
        y: 378.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.sunpu',
      anchor: { x: 1419.5129310344823, y: 64.60344827586232 },
      baseline: {
        x: 1352.6438244364012,
        y: 99.89634149467565,
        width: 135.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.tahara',
      anchor: { x: 1026.5129310344823, y: 189.10344827586232 },
      baseline: {
        x: 972.2308242532959,
        y: 215.39634149467565,
        width: 109.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.takato',
      anchor: { x: 1308.5129310344823, y: -277.3965517241377 },
      baseline: {
        x: 1241.4073244211427,
        y: -251.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.takaya',
      anchor: { x: 443.01293103448234, y: 238.60344827586232 },
      baseline: {
        x: 375.9073244211427,
        y: 264.89634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.takeda',
      anchor: { x: 174.51293103448234, y: -64.39655172413768 },
      baseline: {
        x: 112.23082425329585,
        y: -38.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.takiyama',
      anchor: { x: 1754.0129310344823, y: -224.89655172413768 },
      baseline: {
        x: 1691.7308242532959,
        y: -198.60365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.tenjinyama',
      anchor: { x: -68.48706896551766, y: 112.60344827586232 },
      baseline: {
        x: -145.5941757467042,
        y: 147.89634149467565,
        width: 147.50710678118656,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.toramaru',
      anchor: { x: 2.0129310344823352, y: 369.1034482758623 },
      baseline: {
        x: -60.26917574670415,
        y: 395.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.tottori',
      anchor: { x: -33.987068965517665, y: -148.39655172413768 },
      baseline: {
        x: -101.09267557885755,
        y: -122.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.tsutsujigasaki',
      anchor: { x: 1487.0129310344823, y: -212.89655172413768 },
      baseline: {
        x: 1404.6438244364012,
        y: -177.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.yagi',
      anchor: { x: 429.51293103448234, y: 7.60344827586232 },
      baseline: {
        x: 367.23082425329585,
        y: 33.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.yakami',
      anchor: { x: 311.01293103448234, y: 24.10344827586232 },
      baseline: {
        x: 236.14382443640125,
        y: 59.39634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
    },
    {
      id: 'castle.yonago',
      anchor: { x: -353.48706896551766, y: -112.39655172413768 },
      baseline: {
        x: -415.76917574670415,
        y: -86.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
    },
    {
      id: 'castle.yoshida',
      anchor: { x: 1073.0129310344823, y: 148.60344827586232 },
      baseline: {
        x: 1013.9073244211427,
        y: 174.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
    },
  ],
  obstacles: [
    {
      id: 'canvas.bottom',
      kind: 'canvasEdge',
      hard: true,
      rect: { x: -48, y: 720, width: 1376, height: 48 },
    },
    {
      id: 'canvas.left',
      kind: 'canvasEdge',
      hard: true,
      rect: { x: -48, y: -48, width: 48, height: 816 },
    },
    {
      id: 'canvas.right',
      kind: 'canvasEdge',
      hard: true,
      rect: { x: 1280, y: -48, width: 48, height: 816 },
    },
    {
      id: 'canvas.top',
      kind: 'canvasEdge',
      hard: true,
      rect: { x: -48, y: -48, width: 1376, height: 48 },
    },
    {
      id: 'castle.akutagawa',
      kind: 'castleBody',
      rect: { x: 418.0214056107534, y: 70.09497369959081, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.akutagawa',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 429.8129310344825, y: 129.78988895382827, width: 35.4, height: 3 },
    },
    {
      id: 'castle.bitchu-matsuyama',
      kind: 'castleBody',
      rect: { x: -273.72369103909614, y: 104.44876600161479, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.bitchu-matsuyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -264.6870689655175, y: 144.20879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.gassan-toda',
      kind: 'castleBody',
      rect: { x: -430.9785943892466, y: -130.9050263004092, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.gassan-toda',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -419.1870689655175, y: -71.21011104617173, width: 35.4, height: 3 },
    },
    {
      id: 'castle.hikuma',
      kind: 'castleBody',
      rect: { x: 1169.0494570085084, y: 147.40052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.hikuma',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1178.312931034482, y: 184.84451970443388, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.hino',
      kind: 'castleBody',
      rect: { x: 648.5494570085084, y: 22.900526197940053, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.hino',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 657.8129310344825, y: 60.34451970443388, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.ichijodani',
      kind: 'castleBody',
      rect: { x: 656.5214056107534, y: -387.4050263004092, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.ichijodani',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 668.3129310344825, y: -327.7101110461713, width: 35.4, height: 3 },
    },
    {
      id: 'castle.iimoriyama',
      kind: 'castleBody',
      rect: { x: 435.77630896090386, y: 141.94876600161479, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.iimoriyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 444.8129310344825, y: 181.70879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.inabayama',
      kind: 'castleBody',
      rect: { x: 829.0214056107534, y: -162.4050263004092, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.inabayama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 840.8129310344825, y: -102.71011104617173, width: 35.4, height: 3 },
    },
    {
      id: 'castle.inuyama',
      kind: 'castleBody',
      rect: { x: 891.5494570085084, y: -125.59947380205995, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.inuyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 900.8129310344825, y: -88.15548029556612, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.ishiyama',
      kind: 'castleBody',
      rect: { x: 383.01293103448234, y: 146.98286949772773, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.ishiyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 395.3129310344825, y: 201.30119747200388, width: 35.4, height: 3 },
    },
    {
      id: 'castle.iwadono',
      kind: 'castleBody',
      rect: { x: 1598.2763089609034, y: -221.05123399838521, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.iwadono',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1607.312931034482, y: -181.29120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.iwamura',
      kind: 'castleBody',
      rect: { x: 1071.7763089609034, y: -116.05123399838521, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.iwamura',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1080.812931034482, y: -76.29120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.kakegawa',
      kind: 'castleBody',
      rect: { x: 1268.0494570085084, y: 123.40052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.kakegawa',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1277.312931034482, y: 160.84451970443388, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.kanegasaki',
      kind: 'castleBody',
      rect: { x: 587.2763089609039, y: -240.55123399838521, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.kanegasaki',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 596.3129310344825, y: -200.79120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.kannabe',
      kind: 'castleBody',
      rect: { x: -360.72369103909614, y: 212.44876600161479, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.kannabe',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -351.6870689655175, y: 252.20879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.kannonji',
      kind: 'castleBody',
      rect: { x: 601.0214056107534, y: -46.90502630040919, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.kannonji',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 612.8129310344825, y: 12.789888953828267, width: 35.4, height: 3 },
    },
    {
      id: 'castle.kiriyama',
      kind: 'castleBody',
      rect: { x: 643.0214056107534, y: 194.5949736995908, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.kiriyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 654.8129310344825, y: 254.28988895382827, width: 35.4, height: 3 },
    },
    {
      id: 'castle.kishiwada',
      kind: 'castleBody',
      rect: { x: 341.0494570085084, y: 250.90052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.kishiwada',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 350.3129310344825, y: 288.3445197044339, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.kiyosu',
      kind: 'castleBody',
      rect: { x: 870.5129310344823, y: -61.517130502272266, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.kiyosu',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 882.8129310344825, y: -7.198802527996122, width: 35.4, height: 3 },
    },
    {
      id: 'castle.kokokuji',
      kind: 'castleBody',
      rect: {
        x: 1569.5494570085084,
        y: -22.099473802059947,
        width: 45,
        height: 34.443993506493506,
      },
      hard: true,
    },
    {
      id: 'castle.kokokuji',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1578.812931034482, y: 15.344519704433878, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.konosumiyama',
      kind: 'castleBody',
      rect: { x: 158.5214056107534, y: -171.4050263004092, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.konosumiyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 170.31293103448252, y: -111.71011104617173, width: 35.4, height: 3 },
    },
    {
      id: 'castle.kurushima',
      kind: 'castleBody',
      rect: { x: -501.72369103909614, y: 381.9487660016148, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.kurushima',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -492.6870689655175, y: 421.70879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.matsuyama',
      kind: 'castleBody',
      rect: { x: 1763.2763089609034, y: -389.0512339983852, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.matsuyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1772.312931034482, y: -349.29120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.mitsuishi',
      kind: 'castleBody',
      rect: { x: -48.72369103909614, y: 104.44876600161479, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.mitsuishi',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -39.68706896551748, y: 144.20879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.nagashima',
      kind: 'castleBody',
      rect: { x: 798.5494570085084, y: -5.599473802059947, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.nagashima',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 807.8129310344825, y: 31.84451970443388, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.nagoya',
      kind: 'castleBody',
      rect: { x: 881.0494570085084, y: -41.59947380205995, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.nagoya',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 890.3129310344825, y: -4.155480295566122, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.nakamura',
      kind: 'castleBody',
      rect: { x: -519.9870689655177, y: 824.9828694977277, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.nakamura',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -507.6870689655175, y: 879.3011974720039, width: 35.4, height: 3 },
    },
    {
      id: 'castle.nijo',
      kind: 'castleBody',
      rect: { x: 473.01293103448234, y: 14.982869497727734, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.nijo',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 485.3129310344825, y: 69.30119747200388, width: 35.4, height: 3 },
    },
    {
      id: 'castle.nirayama',
      kind: 'castleBody',
      rect: { x: 1601.2763089609034, y: 8.448766001614786, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.nirayama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1610.312931034482, y: 48.20879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.nochiseyama',
      kind: 'castleBody',
      rect: { x: 471.77630896090386, y: -168.55123399838521, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.nochiseyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 480.8129310344825, y: -128.79120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.odani',
      kind: 'castleBody',
      rect: { x: 652.0214056107534, y: -187.9050263004092, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.odani',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 663.8129310344825, y: -128.21011104617173, width: 35.4, height: 3 },
    },
    {
      id: 'castle.odawara',
      kind: 'castleBody',
      rect: { x: 1661.0129310344823, y: -85.51713050227227, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.odawara',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1673.312931034482, y: -31.198802527996122, width: 35.4, height: 3 },
    },
    {
      id: 'castle.ogaki',
      kind: 'castleBody',
      rect: { x: 780.5494570085084, y: -113.59947380205995, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.ogaki',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 789.8129310344825, y: -76.15548029556612, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.okazaki',
      kind: 'castleBody',
      rect: { x: 965.0129310344823, y: 38.982869497727734, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.okazaki',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 977.3129310344825, y: 93.30119747200388, width: 35.4, height: 3 },
    },
    {
      id: 'castle.okishio',
      kind: 'castleBody',
      rect: { x: 91.02140561075339, y: 46.09497369959081, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.okishio',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 102.81293103448252, y: 105.78988895382827, width: 35.4, height: 3 },
    },
    {
      id: 'castle.oko',
      kind: 'castleBody',
      rect: { x: -273.4785943892466, y: 575.5949736995908, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.oko',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -261.6870689655175, y: 635.2898889538283, width: 35.4, height: 3 },
    },
    {
      id: 'castle.ono',
      kind: 'castleBody',
      rect: { x: 731.2763089609039, y: -369.5512339983852, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.ono',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 740.3129310344825, y: -329.79120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.saika',
      kind: 'castleBody',
      rect: { x: 270.5494570085084, y: 343.90052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.saika',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 279.8129310344825, y: 381.3445197044339, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.sawayama',
      kind: 'castleBody',
      rect: { x: 651.7763089609039, y: -84.55123399838521, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.sawayama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 660.8129310344825, y: -44.79120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.shigisan',
      kind: 'castleBody',
      rect: { x: 446.27630896090386, y: 186.94876600161479, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.shigisan',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 455.3129310344825, y: 226.70879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.shiraga',
      kind: 'castleBody',
      rect: {
        x: -480.72369103909614,
        y: -173.05123399838521,
        width: 45,
        height: 36.76003344481605,
      },
      hard: true,
    },
    {
      id: 'castle.shiraga',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -471.6870689655175, y: -133.29120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.shoryuji',
      kind: 'castleBody',
      rect: { x: 456.5494570085084, y: 60.40052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.shoryuji',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 465.8129310344825, y: 97.84451970443388, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.shozui',
      kind: 'castleBody',
      rect: { x: 42.5494570085084, y: 379.90052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.shozui',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 51.81293103448252, y: 417.3445197044339, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.sogo',
      kind: 'castleBody',
      rect: { x: -101.4505429914916, y: 327.40052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.sogo',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -92.18706896551748, y: 364.8445197044339, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.sunpu',
      kind: 'castleBody',
      rect: { x: 1389.5129310344823, y: 26.982869497727734, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.sunpu',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1401.812931034482, y: 81.30119747200388, width: 35.4, height: 3 },
    },
    {
      id: 'castle.tahara',
      kind: 'castleBody',
      rect: { x: 1004.0494570085084, y: 163.90052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.tahara',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1013.3129310344825, y: 201.34451970443388, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.takato',
      kind: 'castleBody',
      rect: { x: 1286.2763089609034, y: -305.0512339983852, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.takato',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1295.312931034482, y: -265.29120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.takaya',
      kind: 'castleBody',
      rect: { x: 420.5494570085084, y: 213.40052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.takaya',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 429.8129310344825, y: 250.84451970443388, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.takeda',
      kind: 'castleBody',
      rect: { x: 152.27630896090386, y: -92.05123399838521, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.takeda',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 161.31293103448252, y: -52.29120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.takiyama',
      kind: 'castleBody',
      rect: { x: 1731.7763089609034, y: -252.55123399838521, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.takiyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1740.812931034482, y: -212.79120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.tamaru',
      kind: 'castleBody',
      rect: { x: 773.0494570085084, y: 235.90052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.tamaru',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 782.3129310344825, y: 273.3445197044339, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.tatsuno',
      kind: 'castleBody',
      rect: { x: 53.27630896090386, y: 80.44876600161479, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.tatsuno',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 62.31293103448252, y: 120.20879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.tenjinyama',
      kind: 'castleBody',
      rect: { x: -97.97859438924661, y: 70.09497369959081, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.tenjinyama',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -86.18706896551748, y: 129.78988895382827, width: 35.4, height: 3 },
    },
    {
      id: 'castle.toramaru',
      kind: 'castleBody',
      rect: { x: -20.22369103909614, y: 341.4487660016148, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.toramaru',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -11.187068965517483, y: 381.20879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.tottori',
      kind: 'castleBody',
      rect: { x: -56.22369103909614, y: -176.05123399838521, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.tottori',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -47.18706896551748, y: -136.29120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.tsutsui',
      kind: 'castleBody',
      rect: { x: 480.51293103448234, y: 164.98286949772773, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.tsutsui',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 492.8129310344825, y: 219.30119747200388, width: 35.4, height: 3 },
    },
    {
      id: 'castle.tsutsujigasaki',
      kind: 'castleBody',
      rect: { x: 1457.0129310344823, y: -250.51713050227227, width: 60, height: 51.31832797427652 },
      hard: true,
    },
    {
      id: 'castle.tsutsujigasaki',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1469.312931034482, y: -196.19880252799612, width: 35.4, height: 3 },
    },
    {
      id: 'castle.yagi',
      kind: 'castleBody',
      rect: { x: 407.27630896090386, y: -20.051233998385214, width: 45, height: 36.76003344481605 },
      hard: true,
    },
    {
      id: 'castle.yagi',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 416.3129310344825, y: 19.70879944643093, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.yakami',
      kind: 'castleBody',
      rect: { x: 281.5214056107534, y: -18.40502630040919, width: 60, height: 56.69491525423729 },
      hard: true,
    },
    {
      id: 'castle.yakami',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 293.3129310344825, y: 41.28988895382827, width: 35.4, height: 3 },
    },
    {
      id: 'castle.yonago',
      kind: 'castleBody',
      rect: {
        x: -375.72369103909614,
        y: -140.05123399838521,
        width: 45,
        height: 36.76003344481605,
      },
      hard: true,
    },
    {
      id: 'castle.yonago',
      kind: 'castleDurability',
      hard: true,
      rect: { x: -366.6870689655175, y: -100.29120055356907, width: 26.400000000000002, height: 3 },
    },
    {
      id: 'castle.yoshida',
      kind: 'castleBody',
      rect: { x: 1050.5494570085084, y: 123.40052619794005, width: 45, height: 34.443993506493506 },
      hard: true,
    },
    {
      id: 'castle.yoshida',
      kind: 'castleDurability',
      hard: true,
      rect: { x: 1059.812931034482, y: 160.84451970443388, width: 26.400000000000002, height: 3 },
    },
    { id: 'hud.0', kind: 'hud', hard: true, rect: { x: 8, y: 64, width: 64, height: 644 } },
    { id: 'hud.1', kind: 'hud', hard: true, rect: { x: 12, y: 8, width: 1256, height: 48 } },
    { id: 'hud.2', kind: 'hud', hard: true, rect: { x: 84, y: 64, width: 240, height: 51 } },
    {
      id: 'hud.3',
      kind: 'hud',
      hard: true,
      rect: { x: 1028, y: 60, width: 240, height: 40.390625 },
    },
    { id: 'hud.4', kind: 'hud', hard: true, rect: { x: 1092, y: 532, width: 176, height: 176 } },
  ],
};
const baseline = { x: 0, y: 0, width: 20, height: 10 };
describe('bounded castle ribbon leader broadphase', () => {
  it('retains every actual Kii guard crossed by exhaustive 8 CSS px disk candidates', () => {
    let crossings = 0,
      missing = 0;
    // Independent segment/interior interval oracle, not the broadphase hull.
    const crosses = (a: { x: number; y: number }, b: typeof a, r: typeof baseline) => {
      let enter = 0,
        exit = 1;
      for (const [start, end, low, high] of [
        [a.x, b.x, r.x, r.x + r.width],
        [a.y, b.y, r.y, r.y + r.height],
      ]) {
        const delta = end! - start!;
        if (delta === 0) {
          if (start! <= low! || start! >= high!) return false;
        } else {
          const u = (low! - start!) / delta,
            v = (high! - start!) / delta;
          enter = Math.max(enter, Math.min(u, v));
          exit = Math.min(exit, Math.max(u, v));
        }
      }
      return enter < exit;
    };
    for (const ribbon of kii.ribbons) {
      const obstacles = kii.obstacles
        .filter((o) => o.hard && o.id !== ribbon.id)
        .map((o) => o.rect);
      const retained = new Set(
        filterCastleRibbonLeaderObstacles(ribbon.anchor, ribbon.baseline, obstacles),
      );
      for (let y = -48; y <= 48; y += 8)
        for (let x = -48; x <= 48; x += 8) {
          if (x * x + y * y > 48 * 48) continue;
          const r = { ...ribbon.baseline, x: ribbon.baseline.x + x, y: ribbon.baseline.y + y };
          const end = {
            x: Math.max(r.x, Math.min(ribbon.anchor.x, r.x + r.width)),
            y: Math.max(r.y, Math.min(ribbon.anchor.y, r.y + r.height)),
          };
          for (const obstacle of obstacles)
            if (crosses(ribbon.anchor, end, obstacle)) {
              crossings++;
              if (!retained.has(obstacle)) missing++;
            }
        }
    }
    expect(crossings).toBeGreaterThan(0);
    expect(missing).toBe(0);
  });
  it('admits actual Kii leader guards without dropping the full hard constraints', () => {
    const before = structuredClone(kii);
    const oldCount = kii.ribbons.reduce(
      (sum, ribbon) => sum + kii.obstacles.filter((o) => o.hard && o.id !== ribbon.id).length,
      0,
    );
    expect(oldCount).toBe(6966);
    const guards = kii.ribbons.map((ribbon) =>
      filterCastleRibbonLeaderObstacles(
        ribbon.anchor,
        ribbon.baseline,
        kii.obstacles.filter((o) => o.hard && o.id !== ribbon.id).map((o) => o.rect),
      ),
    );
    expect(guards.reduce((sum, items) => sum + items.length, 0)).toBe(193);
    expect(guards.reduce((sum, items) => sum + items.length, 0)).toBeLessThanOrEqual(4096);
    expect(Math.max(...guards.map((items) => items.length))).toBe(11);
    expect(kii).toEqual(before);
  });
  it('retains long-anchor, endpoint and edge/corner contact guards in original order', () => {
    const obstacles = [
      { x: -100, y: -100, width: 1, height: 1 },
      { x: 68, y: 58, width: 1, height: 1 },
      { x: 68, y: 0, width: 1, height: 1 },
      { x: 0, y: 58, width: 1, height: 1 },
      { x: 69, y: 0, width: 1, height: 1 },
      { x: 0, y: 59, width: 1, height: 1 },
    ];
    const result = filterCastleRibbonLeaderObstacles({ x: -100, y: -100 }, baseline, obstacles);
    expect(result).toEqual(obstacles.slice(0, 4));
    result.forEach((rect, i) => expect(rect).toBe(obstacles[i]));
  });
  it('fails closed for invalid geometry even if the bad obstacle is distant', () => {
    expect(() => filterCastleRibbonLeaderObstacles({ x: NaN, y: 0 }, baseline, [])).toThrow();
    expect(() =>
      filterCastleRibbonLeaderObstacles({ x: 0, y: 0 }, { ...baseline, width: 0 }, []),
    ).toThrow();
    expect(() =>
      filterCastleRibbonLeaderObstacles({ x: 0, y: 0 }, baseline, [
        { x: 1e8, y: 1e8, width: NaN, height: 1 },
      ]),
    ).toThrow();
  });
  it('leaves oversized layout admission to the renderer rather than throwing before its fallback', () => {
    const large = { x: -5000, y: -5000, width: 10000, height: 10000 };
    expect(filterCastleRibbonLeaderObstacles({ x: 0, y: 0 }, baseline, [large])).toEqual([large]);
  });
  it('contains shifted fractional endpoint contacts using the actual addition order', () => {
    for (const x of [0.1, 999999900.1, -999999900.1]) {
      const b = { x, y: x, width: 0.2, height: 0.2 };
      const upper = x + 48 + b.width;
      const contact = { x: upper, y: x + 48 + b.height, width: 0.1, height: 0.1 };
      expect(filterCastleRibbonLeaderObstacles({ x, y: x }, b, [contact])).toEqual([contact]);
    }
    expect(0.1 + 48 + 0.2).toBeGreaterThan(0.1 + 0.2 + 48);
  });
});
