import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@core/state/events';
import type { Officer } from '@core/state/gameState';
import type { ClanId, EventId, OfficerId } from '@core/state/ids';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../../../tests/helpers/loopState';
import { renderReport } from './renderReport';

const ENEMY = 'clan.enemy' as ClanId;
const THIRD = 'clan.third' as ClanId;
const OFFICER = 'off.test' as OfficerId;
function fixture() {
  const game = makeLoopTestState({ day: 1080 });
  game.clans[TEST_CLAN]!.name = '織田家';
  game.clans[ENEMY] = { ...game.clans[TEST_CLAN]!, id: ENEMY, name: '齋藤家' };
  game.clans[THIRD] = { ...game.clans[TEST_CLAN]!, id: THIRD, name: '武田家' };
  game.castles[TEST_CASTLE]!.name = '清洲城';
  game.officers[OFFICER] = { id: OFFICER, name: '信長', birthYear: 1534 } as Officer;
  return game;
}
function fact(value: Record<string, unknown>): GameEvent {
  return { day: 0, clanIds: [TEST_CLAN], ...value } as GameEvent;
}
const lifecycle = [
  [
    {
      type: 'pact.broken',
      aClanId: TEST_CLAN,
      bClanId: ENEMY,
      kind: 'alliance',
      breakerClanId: null,
    },
    '織田家與齋藤家的同盟已解除。',
  ],
  [
    { type: 'officer.died', officerId: OFFICER, clanId: TEST_CLAN, cause: 'age', nodeId: null },
    '信長病歿，享年26歲。',
  ],
  [
    {
      type: 'officer.died',
      officerId: OFFICER,
      clanId: TEST_CLAN,
      cause: 'battle',
      nodeId: TEST_CASTLE,
    },
    '信長於清洲城戰死。',
  ],
  [
    { type: 'officer.comingOfAge', officerId: OFFICER, clanId: TEST_CLAN },
    '信長元服，加入織田家。',
  ],
  [
    { type: 'officer.comingOfAge', officerId: OFFICER, clanId: null },
    '信長元服，然主家已亡，暫為浪人。',
  ],
  [
    { type: 'officer.defected', officerId: OFFICER, fromClanId: TEST_CLAN, toClanId: null },
    '信長對待遇不滿，出奔而去！',
  ],
  [
    { type: 'officer.recruited', officerId: OFFICER, clanId: TEST_CLAN, source: 'ronin' },
    '信長仕官於我家。',
  ],
  [
    { type: 'officer.recruited', officerId: OFFICER, clanId: TEST_CLAN, source: 'captive' },
    '信長降伏，仕官於我家。',
  ],
  [
    { type: 'officer.recruitFailed', officerId: OFFICER, executorId: OFFICER, clanId: TEST_CLAN },
    '信長婉拒了登用。',
  ],
  [{ type: 'officer.captured', officerId: OFFICER, byClanId: ENEMY }, '信長被齋藤家俘虜。'],
  [{ type: 'officer.released', officerId: OFFICER, byClanId: TEST_CLAN }, '已釋放信長，威信提升。'],
  [
    { type: 'officer.executed', officerId: OFFICER, byClanId: TEST_CLAN },
    '已處斬信長。家中隱有不安。',
  ],
  [
    { type: 'proposal.submitted', officerId: OFFICER, proposalId: 'deleted', kind: 'build' },
    '收到信長的具申。',
  ],
  [
    { type: 'proposal.expired', officerId: OFFICER, proposalId: 'deleted', reason: 'timeout' },
    '信長的具申已逾期作罷。',
  ],
  [
    { type: 'proposal.expired', officerId: OFFICER, proposalId: 'deleted', reason: 'invalidated' },
    '信長的具申因情勢變化而作罷。',
  ],
] as const;

describe('canonical retained report coverage', () => {
  it.each(lifecycle)(
    'renders lifecycle fact %j from persistent refs, not current age or proposal',
    (event, expected) => {
      expect(renderReport(fact(event), fixture())).toBe(expected);
    },
  );
  it('renders directed diplomacy, pacts and unpaid upkeep without transient proposal lookup', () => {
    const game = fixture();
    const examples = [
      [
        { type: 'pact.signed', aClanId: TEST_CLAN, bClanId: ENEMY, kind: 'alliance', endDay: 360 },
        '織田家與齋藤家締結同盟。',
      ],
      [
        { type: 'pact.expired', aClanId: ENEMY, bClanId: TEST_CLAN, kind: 'marriage' },
        '與齋藤家的婚姻同盟已到期。',
      ],
      [
        {
          type: 'pact.broken',
          aClanId: TEST_CLAN,
          bClanId: ENEMY,
          kind: 'ceasefire',
          breakerClanId: ENEMY,
        },
        '齋藤家破棄了與我方的停戰！',
      ],
      [
        { type: 'diplo.refused', fromClanId: TEST_CLAN, toClanId: ENEMY, kind: 'proposeAlliance' },
        '齋藤家拒絕了我方的締結同盟。',
      ],
      [
        {
          type: 'diplo.envoyArrived',
          fromClanId: ENEMY,
          proposalId: 'removed',
          kind: 'requestReinforce',
        },
        '齋藤家遣使來訪：請求援軍',
      ],
      [
        {
          type: 'diplo.reinforceAgreed',
          fromClanId: TEST_CLAN,
          toClanId: ENEMY,
          againstClanId: THIRD,
        },
        '齋藤家同意派遣援軍，協力對抗武田家。',
      ],
      [
        { type: 'diplo.workStopped', clanId: TEST_CLAN, target: 'court' },
        '金錢不足，對朝廷的外交工作已中止。',
      ],
      [
        { type: 'diplo.workStopped', clanId: TEST_CLAN, target: 'shogunate' },
        '金錢不足，對幕府的外交工作已中止。',
      ],
      [
        { type: 'diplo.workStopped', clanId: TEST_CLAN, target: ENEMY },
        '金錢不足，對齋藤家的外交工作已中止。',
      ],
      [
        { type: 'economy.upkeepUnpaid', clanId: TEST_CLAN, payeeIds: [] },
        '金錢不足，本月俸祿未能全額發放，家臣心生不滿。',
      ],
    ] as const;
    for (const [event, expected] of examples)
      expect(renderReport(fact(event), game)).toBe(expected);
  });
  it('renders all six mediation branches including retained NPC world affairs', () => {
    const game = fixture();
    const event = fact({
      type: 'court.mediationResult',
      clanId: TEST_CLAN,
      targetClanId: ENEMY,
      success: true,
      ceasefireMonths: 6,
    });
    expect(renderReport(event, game)).toBe('朝廷斡旋成功，與齋藤家停戰6月。');
    expect(renderReport(event, game, ENEMY)).toBe('織田家的朝廷斡旋奏效，我方被迫與其停戰6月。');
    expect(renderReport(event, game, THIRD)).toBe('朝廷斡旋成立，織田家與齋藤家停戰6月。');
    const failed = fact({ ...event, success: false, ceasefireMonths: 0 });
    expect(renderReport(failed, game)).toBe('朝廷斡旋失敗，齋藤家官位在我方之上。');
    expect(renderReport(failed, game, ENEMY)).toBe('織田家企圖藉朝廷斡旋逼我方停戰，未能得逞。');
    expect(renderReport(failed, game, THIRD)).toBe('織田家對齋藤家的朝廷斡旋未能奏效。');
  });
  it('keeps covert plots hidden and renders exposed/poach perspectives without duplicate recruitment', () => {
    const game = fixture();
    const base = {
      actorClanId: TEST_CLAN,
      targetClanId: ENEMY,
      targetOfficerId: OFFICER,
      targetCastleId: null,
    };
    const poach = fact({ ...base, type: 'plot.succeeded', kind: 'poach' });
    expect(renderReport(poach, game)).toBe('信長自齋藤家被引拔，前來仕官！');
    expect(renderReport(poach, game, ENEMY)).toBe('信長被織田家引拔，離開了我家！');
    expect(renderReport(poach, game, THIRD)).toBeNull();
    expect(
      renderReport(
        fact({ type: 'officer.recruited', officerId: OFFICER, clanId: TEST_CLAN, source: 'poach' }),
        game,
      ),
    ).toBeNull();
    for (const kind of ['rumor', 'betrayal']) {
      expect(
        renderReport(
          fact({ ...base, type: 'plot.succeeded', kind, targetCastleId: TEST_CASTLE }),
          game,
          ENEMY,
        ),
      ).toBeNull();
      expect(renderReport(fact({ ...base, type: 'plot.failed', kind }), game, ENEMY)).toBeNull();
    }
    expect(renderReport(fact({ ...base, type: 'plot.succeeded', kind: 'rumor' }), game)).toBe(
      '流言奏效，信長軍心動搖。',
    );
    expect(
      renderReport(
        fact({
          ...base,
          type: 'plot.succeeded',
          kind: 'rumor',
          targetOfficerId: null,
          targetCastleId: TEST_CASTLE,
        }),
        game,
      ),
    ).toBe('流言奏效，清洲城軍心動搖。');
    expect(
      renderReport(
        fact({ ...base, type: 'plot.succeeded', kind: 'betrayal', targetCastleId: TEST_CASTLE }),
        game,
      ),
    ).toBe('對清洲城的內應工作完成，攻城時可發動。');
    expect(renderReport(fact({ ...base, type: 'plot.failed', kind: 'poach' }), game)).toBe(
      '對齋藤家的引拔未能奏效。',
    );
    const exposed = fact({ ...base, type: 'plot.exposed', kind: 'rumor' });
    expect(renderReport(exposed, game)).toBe('我方對齋藤家的流言敗露，兩家關係惡化！');
    expect(renderReport(exposed, game, ENEMY)).toBe('發覺織田家對我方進行流言！');
    expect(renderReport(exposed, game, THIRD)).toBeNull();
    expect(
      renderReport(
        fact({
          type: 'plot.betrayalActivated',
          actorClanId: TEST_CLAN,
          targetClanId: ENEMY,
          castleId: TEST_CASTLE,
        }),
        game,
      ),
    ).toBe('清洲城內應發動，城內士氣崩潰！');
  });
  it('renders titles, Taimei catalog names, world broadcasts and session-provided event titles without state/RNG writes', () => {
    const game = fixture();
    const before = structuredClone(game);
    expect(
      renderReport(
        fact({ type: 'court.rankGranted', clanId: TEST_CLAN, newCourtRank: 'ju5ge' }),
        game,
      ),
    ).toBe('朝廷敘任織田家當主為從五位下。');
    expect(
      renderReport(
        fact({ type: 'shogunate.titleGranted', clanId: TEST_CLAN, title: 'kanrei' }),
        game,
      ),
    ).toBe('幕府任命織田家為管領。');
    expect(renderReport(fact({ type: 'shogunate.nominated', clanId: TEST_CLAN }), game)).toBe(
      '織田家上洛擁立將軍，威名遠播！',
    );
    expect(renderReport(fact({ type: 'shogunate.collapsed', clanIds: [] }), game)).toBe(
      '室町幕府滅亡，諸役職效果盡失。',
    );
    const lost = fact({ type: 'shogunate.patronLost', clanId: TEST_CLAN });
    expect(renderReport(lost, game)).toBe('我方失去京都，將軍庇護不再。');
    expect(renderReport(lost, game, ENEMY)).toBeNull();
    expect(
      renderReport(
        fact({ type: 'taimei.invoked', clanId: TEST_CLAN, taimeiId: 'taimei.sodoin' }),
        game,
      ),
    ).toBe('織田家發動大命「總動員」');
    expect(
      renderReport(
        fact({ type: 'taimei.expired', clanId: TEST_CLAN, taimeiId: 'taimei.sodoin' }),
        game,
      ),
    ).toBe('大命「總動員」的效力已盡');
    const fired = fact({ type: 'event.fired', eventId: 'evt.test', hasChoice: false });
    expect(
      renderReport(fired, game, TEST_CLAN, {
        eventTitle: (id: EventId) => (id === 'evt.test' ? '桶狹間之戰' : undefined),
      }),
    ).toBe('發生事件：桶狹間之戰');
    expect(renderReport(fired, game)).toBe('發生事件：evt.test');
    expect(game).toEqual(before);
  });
});
