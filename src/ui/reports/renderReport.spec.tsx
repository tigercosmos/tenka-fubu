import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '@core/state/events';
import type { Army, District, Officer } from '@core/state/gameState';
import type { ArmyId, ClanId, DistrictId, OfficerId } from '@core/state/ids';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../../../tests/helpers/loopState';
import { renderReport } from './renderReport';

const ENEMY = 'clan.enemy' as ClanId;
const ARMY = 'army.000001' as ArmyId;
const LEADER = 'off.test-leader' as OfficerId;
const HEIR = 'off.test-heir' as OfficerId;
const DISTRICT = 'dist.test' as DistrictId;

function event(value: Record<string, unknown>): GameEvent {
  return { day: 1, clanIds: [TEST_CLAN], ...value } as GameEvent;
}

const game = makeLoopTestState();

beforeEach(() => {
  Object.assign(game, makeLoopTestState());
  game.castles[TEST_CASTLE]!.name = '清洲城';
  game.clans[TEST_CLAN]!.name = '織田家';
  game.clans[ENEMY] = { ...game.clans[TEST_CLAN]!, id: ENEMY, name: '齋藤家' };
  game.officers[LEADER] = { id: LEADER, name: '信長', armyId: ARMY } as Officer;
  game.officers[HEIR] = { id: HEIR, name: '信忠', armyId: null } as Officer;
  game.armies[ARMY] = { id: ARMY, leaderId: LEADER } as Army;
  game.districts[DISTRICT] = { id: DISTRICT, name: '春日井郡' } as District;
});

describe('renderReport military events', () => {
  it('enriches army movement and attrition with leader/place names', () => {
    expect(
      renderReport(
        event({
          type: 'army.departed',
          armyId: ARMY,
          clanId: TEST_CLAN,
          originCastleId: TEST_CASTLE,
          targetNodeId: DISTRICT,
        }),
        game,
      ),
    ).toBe('信長隊自清洲城出陣。');
    expect(
      renderReport(
        event({ type: 'army.blocked', armyId: ARMY, clanId: TEST_CLAN, nodeId: DISTRICT }),
        game,
      ),
    ).toBe('信長隊行軍受阻，於春日井郡待命。');
    expect(
      renderReport(event({ type: 'army.starving', armyId: ARMY, clanId: TEST_CLAN }), game),
    ).toBe('信長隊兵糧耗盡，士氣潰散中！');

    delete game.armies[ARMY];
    game.officers[LEADER]!.armyId = null;
    expect(
      renderReport(
        event({
          type: 'army.returned',
          armyId: ARMY,
          leaderId: LEADER,
          clanId: TEST_CLAN,
          castleId: TEST_CASTLE,
          soldiersReturned: 900,
        }),
        game,
      ),
    ).toBe('信長隊歸還清洲城。');
  });

  it('renders district conquest from the player perspective', () => {
    const base = { type: 'district.subjugated' as const, districtId: DISTRICT, armyId: ARMY };
    expect(renderReport(event({ ...base, fromClanId: ENEMY, toClanId: TEST_CLAN }), game)).toBe(
      '信長隊制壓春日井郡。',
    );
    expect(renderReport(event({ ...base, fromClanId: TEST_CLAN, toClanId: ENEMY }), game)).toBe(
      '春日井郡遭齋藤家制壓！',
    );
  });

  it('renders field/battle/awe outcomes with clan and place enrichment', () => {
    expect(
      renderReport(
        event({
          type: 'battle.started',
          battleId: 'fc.test',
          nodeId: DISTRICT,
          attackerClanId: TEST_CLAN,
          defenderClanId: ENEMY,
        }),
        game,
      ),
    ).toBe('織田家與齋藤家於春日井郡交戰！');
    expect(
      renderReport(
        event({
          type: 'battle.ended',
          battleId: 'fc.test',
          winnerClanId: TEST_CLAN,
          aweLevel: 'small',
          attackerLosses: 10,
          defenderLosses: 20,
          nodeId: DISTRICT,
          attackerClanId: TEST_CLAN,
          defenderClanId: ENEMY,
        }),
        game,
      ),
    ).toBe('織田家於春日井郡擊破齋藤家！');
    expect(
      renderReport(
        event({
          type: 'battle.ended',
          battleId: 'fc.test',
          winnerClanId: null,
          aweLevel: 'none',
          attackerLosses: 10,
          defenderLosses: 10,
          nodeId: DISTRICT,
          attackerClanId: TEST_CLAN,
          defenderClanId: ENEMY,
        }),
        game,
      ),
    ).toBe('春日井郡的戰鬥告一段落。');
    expect(
      renderReport(
        event({
          type: 'awe.triggered',
          sourceBattleId: 'fc.test',
          clanId: TEST_CLAN,
          level: 'large',
          flippedDistrictIds: [],
          affectedCastleIds: [],
        }),
        game,
      ),
    ).toBe('威風（大）！織田家威名震動天下！');
  });

  it('renders siege begin, relief, and end variants', () => {
    expect(
      renderReport(
        event({
          type: 'siege.started',
          siegeId: 'siege.000001',
          castleId: TEST_CASTLE,
          attackerClanId: ENEMY,
        }),
        game,
      ),
    ).toBe('清洲城遭齋藤家包圍！');
    expect(
      renderReport(
        event({ type: 'siege.relief', siegeId: 'siege.000001', castleId: TEST_CASTLE }),
        game,
      ),
    ).toBe('援軍抵達清洲城，展開解圍戰！');
    expect(
      renderReport(
        event({
          type: 'siege.ended',
          siegeId: 'siege.000001',
          castleId: TEST_CASTLE,
          fallen: false,
          newOwnerClanId: null,
        }),
        game,
      ),
    ).toBe('清洲城擊退了圍城之敵。');
  });

  it('returns null for excluded/future events and never exposes transient ids', () => {
    expect(renderReport(event({ type: 'time.monthStart', year: 1560, month: 1 }), game)).toBeNull();
    expect(
      renderReport(
        event({ type: 'proposal.resolved', proposalId: 'proposal.1', accepted: true }),
        game,
      ),
    ).toBeNull();
    expect(
      renderReport(event({ type: 'battle.kassenAvailable', battleId: 'battle.deleted' }), game),
    ).toBe('戰場可發動合戰！');
  });

  it('covers M3 officer reports and third-party report filtering', () => {
    expect(
      renderReport(
        event({ type: 'officer.promoted', officerId: LEADER, clanId: TEST_CLAN, newRank: 'karo' }),
        game,
      ),
    ).toBe('信長升格為家老。');
    expect(
      renderReport(
        event({ type: 'officer.loyaltyLow', officerId: LEADER, clanId: TEST_CLAN, loyalty: 20 }),
        game,
      ),
    ).toBe('信長忠誠低落，恐有異心。');
    expect(
      renderReport(
        event({
          type: 'district.subjugated',
          districtId: DISTRICT,
          armyId: ARMY,
          fromClanId: ENEMY,
          toClanId: 'clan.third',
        }),
        game,
      ),
    ).toBeNull();
  });

  it('renders succession according to the former leader status', () => {
    const succession = event({
      type: 'clan.succession',
      clanId: TEST_CLAN,
      deceasedId: LEADER,
      heirId: HEIR,
    });
    game.officers[LEADER]!.status = 'dead';
    expect(renderReport(succession, game)).toBe('信長逝去，信忠繼任家督。');

    game.officers[LEADER]!.status = 'captive';
    expect(renderReport(succession, game)).toBe('信長遭俘，信忠繼任家督。');
  });
});
