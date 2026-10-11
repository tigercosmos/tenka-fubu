import { describe, expect, it } from 'vitest';
import {
  layoutCastleRibbons,
  type RibbonRect,
  type CastleRibbonCandidate,
} from '../../src/ui/map/sceneParts/castleRibbonLayout';
import { filterCastleRibbonLeaderObstacles } from '../../src/ui/map/sceneParts/castleRibbonLeader';

// Exact enabled-solver s1560/Oda Kii capture, not a runtime /tmp prerequisite.
const kii = {
  runs: 32,
  limited: false,
  ribbons: [
    {
      id: 'castle.akutagawa',
      baseline: {
        x: 365.14382443640125,
        y: 147.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 365.14382443640125,
        y: 147.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 447.51293103448234, y: 112.60344827586232 },
      leader: {
        start: { x: 447.51293103448234, y: 112.60344827586232 },
        end: { x: 447.51293103448234, y: 147.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.bitchu-matsuyama',
      baseline: {
        x: -313.76917574670415,
        y: 158.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: -313.76917574670415,
        y: 158.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -251.48706896551766, y: 132.10344827586232 },
      leader: {
        start: { x: -251.48706896551766, y: 132.10344827586232 },
        end: { x: -251.48706896551766, y: 158.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.gassan-toda',
      baseline: {
        x: -491.35617556359875,
        y: -53.10365850532435,
        width: 173.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: -491.35617556359875,
        y: -53.10365850532435,
        width: 173.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -401.48706896551766, y: -88.39655172413768 },
      leader: {
        start: { x: -401.48706896551766, y: -88.39655172413768 },
        end: { x: -401.48706896551766, y: -53.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.hikuma',
      baseline: {
        x: 1132.4073244211427,
        y: 198.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 1132.4073244211427,
        y: 198.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1191.5129310344823, y: 172.60344827586232 },
      leader: {
        start: { x: 1191.5129310344823, y: 172.60344827586232 },
        end: { x: 1191.5129310344823, y: 198.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.hino',
      baseline: {
        x: 603.9073244211427,
        y: 74.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 603.9073244211427,
        y: 74.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 671.0129310344823, y: 48.10344827586232 },
      leader: {
        start: { x: 671.0129310344823, y: 48.10344827586232 },
        end: { x: 671.0129310344823, y: 74.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.ichijodani',
      baseline: {
        x: 603.6438244364012,
        y: -309.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 603.6438244364012,
        y: -309.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 686.0129310344823, y: -344.8965517241377 },
      leader: {
        start: { x: 686.0129310344823, y: -344.8965517241377 },
        end: { x: 686.0129310344823, y: -309.60365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.iimoriyama',
      baseline: {
        x: 384.4073244211427,
        y: 195.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      rect: {
        x: 384.4073244211427,
        y: 195.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 458.01293103448234, y: 169.60344827586232 },
      leader: {
        start: { x: 458.01293103448234, y: 169.60344827586232 },
        end: { x: 458.01293103448234, y: 195.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.inabayama',
      baseline: {
        x: 784.1438244364012,
        y: -84.60365850532435,
        width: 150.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 832.1438244364012,
        y: -84.60365850532435,
        width: 150.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 48, y: 0 },
      anchor: { x: 858.5129310344823, y: -119.89655172413768 },
      leader: {
        start: { x: 858.5129310344823, y: -119.89655172413768 },
        end: { x: 858.5129310344823, y: -84.60365850532435 },
        visible: true,
      },
      unresolved: true,
      budgetLimited: false,
    },
    {
      id: 'castle.ishiyama',
      baseline: {
        x: 330.64382443640125,
        y: 219.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 282.64382443640125,
        y: 219.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: -48, y: 0 },
      anchor: { x: 413.01293103448234, y: 184.60344827586232 },
      leader: {
        start: { x: 413.01293103448234, y: 184.60344827586232 },
        end: { x: 413.01293103448234, y: 219.89634149467565 },
        visible: true,
      },
      unresolved: true,
      budgetLimited: false,
    },
    {
      id: 'castle.iwadono',
      baseline: {
        x: 1558.2308242532959,
        y: -167.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 1566.6749308513768,
        y: -167.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 8.444106598080907, y: 0 },
      anchor: { x: 1620.5129310344823, y: -193.39655172413768 },
      leader: {
        start: { x: 1620.5129310344823, y: -193.39655172413768 },
        end: { x: 1620.5129310344823, y: -167.10365850532435 },
        visible: true,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.iwamura',
      baseline: {
        x: 1039.7308242532959,
        y: -62.10365850532435,
        width: 109.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 1039.7308242532959,
        y: -62.10365850532435,
        width: 109.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1094.0129310344823, y: -88.39655172413768 },
      leader: {
        start: { x: 1094.0129310344823, y: -88.39655172413768 },
        end: { x: 1094.0129310344823, y: -62.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kakegawa',
      baseline: {
        x: 1231.4073244211427,
        y: 174.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 1231.4073244211427,
        y: 174.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1290.5129310344823, y: 148.60344827586232 },
      leader: {
        start: { x: 1290.5129310344823, y: 148.60344827586232 },
        end: { x: 1290.5129310344823, y: 174.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kanegasaki',
      baseline: {
        x: 547.2308242532959,
        y: -186.60365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 547.2308242532959,
        y: -186.60365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 609.5129310344823, y: -212.89655172413768 },
      leader: {
        start: { x: 609.5129310344823, y: -212.89655172413768 },
        end: { x: 609.5129310344823, y: -186.60365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kannabe',
      baseline: {
        x: -405.59267557885755,
        y: 266.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: -405.59267557885755,
        y: 266.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -338.48706896551766, y: 240.10344827586232 },
      leader: {
        start: { x: -338.48706896551766, y: 240.10344827586232 },
        end: { x: -338.48706896551766, y: 266.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kannonji',
      baseline: {
        x: 548.1438244364012,
        y: 30.896341494675653,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 548.1438244364012,
        y: 30.896341494675653,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 630.5129310344823, y: -4.39655172413768 },
      leader: {
        start: { x: 630.5129310344823, y: -4.39655172413768 },
        end: { x: 630.5129310344823, y: 30.896341494675653 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kiriyama',
      baseline: {
        x: 590.1438244364012,
        y: 272.39634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 590.1438244364012,
        y: 272.39634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 672.5129310344823, y: 237.10344827586232 },
      leader: {
        start: { x: 672.5129310344823, y: 237.10344827586232 },
        end: { x: 672.5129310344823, y: 272.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kishiwada',
      baseline: {
        x: 289.9073244211427,
        y: 302.39634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      rect: {
        x: 289.9073244211427,
        y: 302.39634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 363.51293103448234, y: 276.1034482758623 },
      leader: {
        start: { x: 363.51293103448234, y: 276.1034482758623 },
        end: { x: 363.51293103448234, y: 302.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kiyosu',
      baseline: {
        x: 833.8509312175879,
        y: 11.60344827586232,
        width: 134.82399963378907,
        height: 22.5,
      },
      rect: { x: 833.8509312175879, y: 11.60344827586232, width: 134.82399963378907, height: 22.5 },
      offset: { x: 0, y: 0 },
      anchor: { x: 900.5129310344823, y: -23.89655172413768 },
      leader: {
        start: { x: 900.5129310344823, y: -23.89655172413768 },
        end: { x: 900.5129310344823, y: 11.60344827586232 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kokokuji',
      baseline: {
        x: 1526.4073244211427,
        y: 29.396341494675653,
        width: 132.5041064454932,
        height: 18.707106781186546,
      },
      rect: {
        x: 1526.4073244211427,
        y: 29.396341494675653,
        width: 132.5041064454932,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1592.0129310344823, y: 3.10344827586232 },
      leader: {
        start: { x: 1592.0129310344823, y: 3.10344827586232 },
        end: { x: 1592.0129310344823, y: 29.396341494675653 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.konosumiyama',
      baseline: {
        x: 105.64382443640125,
        y: -93.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 105.64382443640125,
        y: -93.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 188.01293103448234, y: -128.89655172413768 },
      leader: {
        start: { x: 188.01293103448234, y: -128.89655172413768 },
        end: { x: 188.01293103448234, y: -93.60365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.kurushima',
      baseline: {
        x: -541.7691757467041,
        y: 435.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: -541.7691757467041,
        y: 435.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -479.48706896551766, y: 409.6034482758623 },
      leader: {
        start: { x: -479.48706896551766, y: 409.6034482758623 },
        end: { x: -479.48706896551766, y: 435.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.matsuyama',
      baseline: {
        x: 1718.4073244211427,
        y: -335.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 1718.4073244211427,
        y: -335.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1785.5129310344823, y: -361.3965517241377 },
      leader: {
        start: { x: 1785.5129310344823, y: -361.3965517241377 },
        end: { x: 1785.5129310344823, y: -335.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.nagashima',
      baseline: {
        x: 753.9073244211427,
        y: 45.89634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 753.9073244211427,
        y: 45.89634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 821.0129310344823, y: 19.60344827586232 },
      leader: {
        start: { x: 821.0129310344823, y: 19.60344827586232 },
        end: { x: 821.0129310344823, y: 45.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.nakamura',
      baseline: {
        x: -572.3561755635988,
        y: 897.8963414946757,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: -572.3561755635988,
        y: 897.8963414946757,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -489.98706896551766, y: 862.6034482758623 },
      leader: {
        start: { x: -489.98706896551766, y: 862.6034482758623 },
        end: { x: -489.98706896551766, y: 897.8963414946757 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.nijo',
      baseline: {
        x: 420.64382443640125,
        y: 87.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 420.64382443640125,
        y: 87.89634149467565,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 503.01293103448234, y: 52.60344827586232 },
      leader: {
        start: { x: 503.01293103448234, y: 52.60344827586232 },
        end: { x: 503.01293103448234, y: 87.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: false,
    },
    {
      id: 'castle.nirayama',
      baseline: {
        x: 1561.2308242532959,
        y: 62.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 1561.2308242532959,
        y: 62.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1623.5129310344823, y: 36.10344827586232 },
      leader: {
        start: { x: 1623.5129310344823, y: 36.10344827586232 },
        end: { x: 1623.5129310344823, y: 62.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.nochiseyama',
      baseline: {
        x: 425.23082425329585,
        y: -114.60365850532435,
        width: 130.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 425.23082425329585,
        y: -114.60365850532435,
        width: 130.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 494.01293103448234, y: -140.89655172413768 },
      leader: {
        start: { x: 494.01293103448234, y: -140.89655172413768 },
        end: { x: 494.01293103448234, y: -114.60365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.odani',
      baseline: {
        x: 606.6438244364012,
        y: -110.10365850532435,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 606.6438244364012,
        y: -110.10365850532435,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 681.5129310344823, y: -145.39655172413768 },
      leader: {
        start: { x: 681.5129310344823, y: -145.39655172413768 },
        end: { x: 681.5129310344823, y: -110.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.odawara',
      baseline: {
        x: 1608.6438244364012,
        y: -12.603658505324347,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 1608.6438244364012,
        y: -12.603658505324347,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1691.0129310344823, y: -47.89655172413768 },
      leader: {
        start: { x: 1691.0129310344823, y: -47.89655172413768 },
        end: { x: 1691.0129310344823, y: -12.603658505324347 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.ogaki',
      baseline: {
        x: 743.9073244211427,
        y: -62.10365850532435,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 743.9073244211427,
        y: -62.10365850532435,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 803.0129310344823, y: -88.39655172413768 },
      leader: {
        start: { x: 803.0129310344823, y: -88.39655172413768 },
        end: { x: 803.0129310344823, y: -62.10365850532435 },
        visible: false,
      },
      unresolved: true,
      budgetLimited: true,
    },
    {
      id: 'castle.okazaki',
      baseline: {
        x: 920.1438244364012,
        y: 111.89634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 920.1438244364012,
        y: 111.89634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 995.0129310344823, y: 76.60344827586232 },
      leader: {
        start: { x: 995.0129310344823, y: 76.60344827586232 },
        end: { x: 995.0129310344823, y: 111.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.okishio',
      baseline: {
        x: 45.643824436401246,
        y: 123.89634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 45.643824436401246,
        y: 123.89634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 120.51293103448234, y: 88.60344827586232 },
      leader: {
        start: { x: 120.51293103448234, y: 88.60344827586232 },
        end: { x: 120.51293103448234, y: 123.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.oko',
      baseline: {
        x: -318.85617556359875,
        y: 653.3963414946757,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: -318.85617556359875,
        y: 653.3963414946757,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -243.98706896551766, y: 618.1034482758623 },
      leader: {
        start: { x: -243.98706896551766, y: 618.1034482758623 },
        end: { x: -243.98706896551766, y: 653.3963414946757 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.saika',
      baseline: {
        x: 225.90732442114268,
        y: 395.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 225.90732442114268,
        y: 395.39634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 293.01293103448234, y: 369.1034482758623 },
      leader: {
        start: { x: 293.01293103448234, y: 369.1034482758623 },
        end: { x: 293.01293103448234, y: 395.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.sawayama',
      baseline: {
        x: 600.4073244211427,
        y: -30.603658505324347,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      rect: {
        x: 600.4073244211427,
        y: -30.603658505324347,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 674.0129310344823, y: -56.89655172413768 },
      leader: {
        start: { x: 674.0129310344823, y: -56.89655172413768 },
        end: { x: 674.0129310344823, y: -30.603658505324347 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.shigisan',
      baseline: {
        x: 394.9073244211427,
        y: 240.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      rect: {
        x: 394.9073244211427,
        y: 240.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 468.51293103448234, y: 214.60344827586232 },
      leader: {
        start: { x: 468.51293103448234, y: 214.60344827586232 },
        end: { x: 468.51293103448234, y: 240.89634149467565 },
        visible: false,
      },
      unresolved: true,
      budgetLimited: true,
    },
    {
      id: 'castle.shiraga',
      baseline: {
        x: -525.5926755788576,
        y: -119.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: -525.5926755788576,
        y: -119.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -458.48706896551766, y: -145.39655172413768 },
      leader: {
        start: { x: -458.48706896551766, y: -145.39655172413768 },
        end: { x: -458.48706896551766, y: -119.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.shoryuji',
      baseline: {
        x: 405.4073244211427,
        y: 111.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      rect: {
        x: 405.4073244211427,
        y: 111.89634149467565,
        width: 140.5041064454932,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 479.01293103448234, y: 85.60344827586232 },
      leader: {
        start: { x: 479.01293103448234, y: 85.60344827586232 },
        end: { x: 479.01293103448234, y: 111.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.shozui',
      baseline: {
        x: 2.73082425329585,
        y: 431.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 2.73082425329585,
        y: 431.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 65.01293103448234, y: 405.1034482758623 },
      leader: {
        start: { x: 65.01293103448234, y: 405.1034482758623 },
        end: { x: 65.01293103448234, y: 431.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.sogo',
      baseline: {
        x: -141.26917574670415,
        y: 378.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: -141.26917574670415,
        y: 378.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -78.98706896551766, y: 352.6034482758623 },
      leader: {
        start: { x: -78.98706896551766, y: 352.6034482758623 },
        end: { x: -78.98706896551766, y: 378.89634149467565 },
        visible: false,
      },
      unresolved: true,
      budgetLimited: true,
    },
    {
      id: 'castle.sunpu',
      baseline: {
        x: 1352.6438244364012,
        y: 99.89634149467565,
        width: 135.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 1352.6438244364012,
        y: 99.89634149467565,
        width: 135.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1419.5129310344823, y: 64.60344827586232 },
      leader: {
        start: { x: 1419.5129310344823, y: 64.60344827586232 },
        end: { x: 1419.5129310344823, y: 99.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.tahara',
      baseline: {
        x: 972.2308242532959,
        y: 215.39634149467565,
        width: 109.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 972.2308242532959,
        y: 215.39634149467565,
        width: 109.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1026.5129310344823, y: 189.10344827586232 },
      leader: {
        start: { x: 1026.5129310344823, y: 189.10344827586232 },
        end: { x: 1026.5129310344823, y: 215.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.takato',
      baseline: {
        x: 1241.4073244211427,
        y: -251.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 1241.4073244211427,
        y: -251.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1308.5129310344823, y: -277.3965517241377 },
      leader: {
        start: { x: 1308.5129310344823, y: -277.3965517241377 },
        end: { x: 1308.5129310344823, y: -251.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.takaya',
      baseline: {
        x: 375.9073244211427,
        y: 264.89634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 375.9073244211427,
        y: 264.89634149467565,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 443.01293103448234, y: 238.60344827586232 },
      leader: {
        start: { x: 443.01293103448234, y: 238.60344827586232 },
        end: { x: 443.01293103448234, y: 264.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.takeda',
      baseline: {
        x: 112.23082425329585,
        y: -38.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 112.23082425329585,
        y: -38.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 174.51293103448234, y: -64.39655172413768 },
      leader: {
        start: { x: 174.51293103448234, y: -64.39655172413768 },
        end: { x: 174.51293103448234, y: -38.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.takiyama',
      baseline: {
        x: 1691.7308242532959,
        y: -198.60365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 1691.7308242532959,
        y: -198.60365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1754.0129310344823, y: -224.89655172413768 },
      leader: {
        start: { x: 1754.0129310344823, y: -224.89655172413768 },
        end: { x: 1754.0129310344823, y: -198.60365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.tenjinyama',
      baseline: {
        x: -145.5941757467042,
        y: 147.89634149467565,
        width: 147.50710678118656,
        height: 22.707106781186546,
      },
      rect: {
        x: -145.5941757467042,
        y: 147.89634149467565,
        width: 147.50710678118656,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -68.48706896551766, y: 112.60344827586232 },
      leader: {
        start: { x: -68.48706896551766, y: 112.60344827586232 },
        end: { x: -68.48706896551766, y: 147.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.toramaru',
      baseline: {
        x: -60.26917574670415,
        y: 395.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: -60.26917574670415,
        y: 395.39634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 2.0129310344823352, y: 369.1034482758623 },
      leader: {
        start: { x: 2.0129310344823352, y: 369.1034482758623 },
        end: { x: 2.0129310344823352, y: 395.39634149467565 },
        visible: false,
      },
      unresolved: true,
      budgetLimited: true,
    },
    {
      id: 'castle.tottori',
      baseline: {
        x: -101.09267557885755,
        y: -122.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: -101.09267557885755,
        y: -122.10365850532435,
        width: 127.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -33.987068965517665, y: -148.39655172413768 },
      leader: {
        start: { x: -33.987068965517665, y: -148.39655172413768 },
        end: { x: -33.987068965517665, y: -122.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.tsutsujigasaki',
      baseline: {
        x: 1404.6438244364012,
        y: -177.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 1404.6438244364012,
        y: -177.60365850532435,
        width: 158.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1487.0129310344823, y: -212.89655172413768 },
      leader: {
        start: { x: 1487.0129310344823, y: -212.89655172413768 },
        end: { x: 1487.0129310344823, y: -177.60365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.yagi',
      baseline: {
        x: 367.23082425329585,
        y: 33.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: 367.23082425329585,
        y: 33.89634149467565,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 429.51293103448234, y: 7.60344827586232 },
      leader: {
        start: { x: 429.51293103448234, y: 7.60344827586232 },
        end: { x: 429.51293103448234, y: 33.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.yakami',
      baseline: {
        x: 236.14382443640125,
        y: 59.39634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      rect: {
        x: 236.14382443640125,
        y: 59.39634149467565,
        width: 143.03110641497562,
        height: 22.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 311.01293103448234, y: 24.10344827586232 },
      leader: {
        start: { x: 311.01293103448234, y: 24.10344827586232 },
        end: { x: 311.01293103448234, y: 59.39634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.yonago',
      baseline: {
        x: -415.76917574670415,
        y: -86.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      rect: {
        x: -415.76917574670415,
        y: -86.10365850532435,
        width: 117.85710678118656,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: -353.48706896551766, y: -112.39655172413768 },
      leader: {
        start: { x: -353.48706896551766, y: -112.39655172413768 },
        end: { x: -353.48706896551766, y: -86.10365850532435 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
    },
    {
      id: 'castle.yoshida',
      baseline: {
        x: 1013.9073244211427,
        y: 174.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
      rect: {
        x: 1013.9073244211427,
        y: 174.89634149467565,
        width: 119.50410644549319,
        height: 18.707106781186546,
      },
      offset: { x: 0, y: 0 },
      anchor: { x: 1073.0129310344823, y: 148.60344827586232 },
      leader: {
        start: { x: 1073.0129310344823, y: 148.60344827586232 },
        end: { x: 1073.0129310344823, y: 174.89634149467565 },
        visible: false,
      },
      unresolved: false,
      budgetLimited: true,
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
const area = (a: RibbonRect, b: RibbonRect, gap = 0) =>
  Math.max(0, Math.min(a.x + a.width + gap, b.x + b.width) - Math.max(a.x - gap, b.x)) *
  Math.max(0, Math.min(a.y + a.height + gap, b.y + b.height) - Math.max(a.y - gap, b.y));
const crosses = (start: { x: number; y: number }, end: typeof start, r: RibbonRect) => {
  let enter = 0,
    exit = 1;
  for (const [a, b, min, max] of [
    [start.x, end.x, r.x, r.x + r.width],
    [start.y, end.y, r.y, r.y + r.height],
  ] as const) {
    const delta = b - a;
    if (delta === 0) {
      if (a <= min || a >= max) return false;
    } else {
      const u = (min - a) / delta,
        v = (max - a) / delta;
      enter = Math.max(enter, Math.min(u, v));
      exit = Math.min(exit, Math.max(u, v));
    }
  }
  return enter < exit;
};
// Literal pre-broadphase valid-input algorithm; no production scoring helpers.
const originalOffsets = (
  inputs: CastleRibbonCandidate[],
  fixedInput: RibbonRect[],
  hard: RibbonRect[],
) => {
  const rank = (c: CastleRibbonCandidate) => (c.selected ? 0 : c.critical ? 1 : c.target ? 2 : 3);
  const sorted = [...inputs].sort(
    (a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const fixed = [...fixedInput].sort(
    (a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height,
  );
  const placed: RibbonRect[] = [];
  const result = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]!,
      b = c.baseline;
    const terms = [...fixed, ...placed, ...sorted.slice(i + 1).map((o) => o.baseline)];
    const axis = (v: number[]) =>
      [...new Set([0, ...v])]
        .filter((n) => Number.isFinite(n) && Math.abs(n) <= 48)
        .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
        .slice(0, 12);
    const xs = axis(terms.flatMap((r) => [r.x - b.x - b.width - 4, r.x + r.width + 4 - b.x]));
    const ys = axis(terms.flatMap((r) => [r.y - b.y - b.height - 4, r.y + r.height + 4 - b.y]));
    const proposals = [{ x: 0, y: 0 }];
    for (const x of xs) for (const y of ys) if (x * x + y * y <= 2304) proposals.push({ x, y });
    for (let y = -48; y <= 48; y += 8)
      for (let x = -48; x <= 48; x += 8) if (x * x + y * y <= 2304) proposals.push({ x, y });
    const unique = [
      ...new Map(proposals.map((p) => [String(p.x) + ',' + String(p.y), p])).values(),
    ];
    const score = (r: RibbonRect) =>
      terms.reduce((s, o) => ({ raw: s.raw + area(r, o), padded: s.padded + area(r, o, 4) }), {
        raw: 0,
        padded: 0,
      });
    let best = { x: 0, y: 0 },
      bestScore = score(b);
    for (const p of unique.slice(1)) {
      const r = { ...b, x: b.x + p.x, y: b.y + p.y };
      if (hard.some((o) => area(r, o) > area(b, o))) continue;
      const end = {
        x: Math.max(r.x, Math.min(c.anchor.x, r.x + r.width)),
        y: Math.max(r.y, Math.min(c.anchor.y, r.y + r.height)),
      };
      if (c.leaderObstacles?.some((o) => crosses(c.anchor, end, o))) continue;
      const s = score(r),
        d = p.x * p.x + p.y * p.y,
        previous = best.x * best.x + best.y * best.y;
      if (
        s.raw < bestScore.raw ||
        (s.raw === bestScore.raw &&
          (s.padded < bestScore.padded || (s.padded === bestScore.padded && d < previous)))
      ) {
        best = p;
        bestScore = s;
      }
    }
    placed.push({ ...b, x: b.x + best.x, y: b.y + best.y });
    result.set(c.id, best);
  }
  return result;
};
describe('actual Kii castle ribbon search budget', () => {
  it('matches the original under-budget algorithm with live placements and fractional gap/corner terms', () => {
    for (const origin of [0, 0.1, 999998000.125, -999998000.125]) {
      const b = { x: origin, y: origin, width: 20.3, height: 10.7 };
      const inputs = [0, 1, 2, 3].map((i) => ({
        id: String(i),
        baseline: { ...b, x: origin + i * 12.25, y: origin + (i % 2) * 14.5 },
        anchor: { x: origin + i * 12.25 + 10, y: origin - 8 },
        selected: i === 0,
      }));
      const fixed = [
        { x: origin + 48 + b.width + 2, y: origin, width: 1, height: 11 },
        { x: origin + 48 + b.width + 2, y: origin + 48 + b.height + 2, width: 1, height: 1 },
        { x: origin - 1000, y: origin - 1000, width: 2, height: 2 },
      ];
      const hard = [{ x: origin - 100, y: origin - 100, width: 100, height: 200 }];
      const expected = originalOffsets(inputs, fixed, hard);
      const actual = layoutCastleRibbons(inputs, fixed, hard);
      expect([...actual].map(([id, p]) => [id, p.offset])).toEqual([...expected]);
      expect([...actual.values()].every((p) => !p.budgetLimited)).toBe(true);
      for (const [id, p] of actual) {
        const c = inputs.find((c) => c.id === id)!;
        const final = [
          ...fixed,
          ...[...actual].filter(([other]) => other !== id).map(([, q]) => q.rect),
        ];
        expect(p.overlapArea).toBe(final.reduce((s, o) => s + area(p.rect, o), 0));
        expect(p.baselineOverlapArea).toBe(final.reduce((s, o) => s + area(c.baseline, o), 0));
      }
    }
  });
  it('spends bounded work on a visible Shigisan legal improvement instead of distant zero terms', () => {
    const target = kii.ribbons.find((r) => r.id === 'castle.shigisan')!;
    const proposal = { ...target.baseline, x: target.baseline.x + 48 };
    const reserved = kii.ribbons
      .filter((r) => r.id !== target.id)
      .map((r) => (r.id < target.id ? r.rect : r.baseline));
    const score = (r: RibbonRect, gap: number) =>
      reserved.reduce((sum, o) => sum + area(r, o, gap), 0);
    expect(target.budgetLimited).toBe(true);
    expect(target.offset).toEqual({ x: 0, y: 0 });
    expect(target.baseline.x).toBeGreaterThan(0);
    expect(target.baseline.y).toBeGreaterThan(0);
    expect(proposal.x + proposal.width).toBeLessThan(1280);
    expect(proposal.y + proposal.height).toBeLessThan(720);
    expect(score(target.baseline, 0)).toBeCloseTo(78.1301912957301, 10);
    expect(score(target.baseline, 4)).toBeCloseTo(284.02904414141307, 10);
    expect(score(proposal, 0)).toBe(0);
    expect(score(proposal, 4)).toBeCloseTo(10.087918644458535, 10);
    const endpoint = {
      x: Math.max(proposal.x, Math.min(target.anchor.x, proposal.x + proposal.width)),
      y: Math.max(proposal.y, Math.min(target.anchor.y, proposal.y + proposal.height)),
    };
    for (const obstacle of kii.obstacles) {
      expect(area(proposal, obstacle.rect)).toBeLessThanOrEqual(
        area(target.baseline, obstacle.rect),
      );
      if (obstacle.id !== target.id)
        expect(crosses(target.anchor, endpoint, obstacle.rect)).toBe(false);
    }
    const hard = kii.obstacles.filter((o) => o.hard).map((o) => o.rect);
    const inputs = kii.ribbons.map((r) => ({
      id: r.id,
      baseline: r.baseline,
      anchor: r.anchor,
      leaderObstacles: filterCastleRibbonLeaderObstacles(
        r.anchor,
        r.baseline,
        kii.obstacles.filter((o) => o.hard && o.id !== r.id).map((o) => o.rect),
      ),
    }));
    const result = layoutCastleRibbons(inputs, [], hard).get(target.id)!;
    expect(result.budgetLimited).toBe(false);
    expect(result.overlapArea).toBeLessThan(score(target.baseline, 0));
    expect(Math.hypot(result.offset.x, result.offset.y)).toBeLessThanOrEqual(48);
  });
});
