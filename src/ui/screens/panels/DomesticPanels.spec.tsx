import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGameStoreForTests, store } from '@app/store';
import type { Command } from '@core/commands/types';
import type { District, Officer } from '@core/state/gameState';
import type { DistrictId, OfficerId, FacilityTypeId } from '@core/state/ids';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../../../../tests/helpers/loopState';
import { CastlePanel } from './CastlePanel';
import { uiStore } from '../../hooks/uiStore';
import { DistrictPanel } from './DistrictPanel';
import { PolicyPanel } from './PolicyPanel';
import type { EventId } from '@core/state/ids';

const DISTRICT_ID = 'dist.test' as DistrictId;
const HIGH_POL = 'off.high-pol' as OfficerId;
const LOW_POL = 'off.low-pol' as OfficerId;

function officer(id: OfficerId, name: string, pol: number, loyalty: number): Officer {
  return {
    id,
    name,
    clanId: TEST_CLAN,
    status: 'serving',
    ldr: 60,
    val: 55,
    int: 65,
    pol,
    statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
    statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
    traits: [],
    rank: 'samurai-taisho',
    merit: 0,
    loyalty,
    kinship: 'fudai',
    spouseId: null,
    birthYear: 1530,
    deathYear: 1600,
    hasComeOfAge: true,
    debutYear: 1545,
    debutClanId: TEST_CLAN,
    debutCastleId: TEST_CASTLE,
    locationCastleId: TEST_CASTLE,
    armyId: null,
    capturedByClanId: null,
    scheduledDeath: { year: 1600, month: 1 },
    captiveRetryOn: null,
    recruitRetryOn: null,
    rewardGiftsThisYear: 0,
    stalledPromotionMonths: 0,
  };
}

function fixture() {
  const state = makeLoopTestState({ gold: 2_000, food: 12_500 });
  const castle = state.castles[TEST_CASTLE]!;
  castle.name = '清洲城';
  castle.soldiers = 4_200;
  castle.morale = 88;
  castle.districtIds = [DISTRICT_ID];
  const district: District = {
    id: DISTRICT_ID,
    name: '春日井郡',
    castleId: TEST_CASTLE,
    isPort: false,
    pos: { x: 0, y: 0 },
    ownerClanId: TEST_CLAN,
    stewardId: null,
    kokudaka: 42_000,
    kokudakaCap: 60_000,
    commerce: 380,
    commerceCap: 2_000,
    population: 21_000,
    populationCap: 30_000,
    publicOrder: 64,
    developFocus: 'agri',
    subjugation: null,
    uprising: null,
  };
  state.districts[DISTRICT_ID] = district;
  state.officers[HIGH_POL] = officer(HIGH_POL, '政務高', 92, 70);
  state.officers[LOW_POL] = officer(LOW_POL, '政務低', 68, 95);
  return state;
}

beforeEach(() => {
  resetGameStoreForTests(fixture());
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
});

it('opens canonical domestic tab directly while keeping normal default overview', () => {
  const view = render(<CastlePanel castleId={TEST_CASTLE} initialTab="domestic" />);
  expect(screen.getByRole('tab', { name: '內政' }).getAttribute('aria-selected')).toBe('true');
  view.unmount();
  render(<CastlePanel castleId={TEST_CASTLE} />);
  expect(screen.getByRole('tab', { name: '概要' }).getAttribute('aria-selected')).toBe('true');
});

describe('CastlePanel', () => {
  it('renders four tabs and emits the selected facility command', async () => {
    const user = userEvent.setup();
    const commands: Command[] = [];
    render(
      <CastlePanel
        castleId={TEST_CASTLE}
        onCommand={(command) => {
          commands.push(command);
        }}
      />,
    );

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '概要',
      '內政',
      '軍事',
      '輸送',
    ]);
    await user.click(screen.getByRole('tab', { name: '內政' }));
    await user.click(screen.getAllByRole('button', { name: /空位/ })[0]!);
    await user.click(screen.getByRole('button', { name: /市.*200貫.*60日/ }));

    expect(commands).toEqual([]);
    const confirmation = screen.getByRole('dialog', { name: '建造選單' });
    expect(confirmation.textContent).toContain('200貫');
    await user.click(within(confirmation).getByRole('button', { name: '確定' }));

    expect(commands).toContainEqual({
      type: 'buildFacility',
      clanId: TEST_CLAN,
      castleId: TEST_CASTLE,
      facilityTypeId: 'fac.ichi',
    });
  });

  it('opens a district row through the panel callback', async () => {
    const user = userEvent.setup();
    const onOpenDistrict = vi.fn();
    render(<CastlePanel castleId={TEST_CASTLE} onOpenDistrict={onOpenDistrict} />);
    await user.click(screen.getByRole('button', { name: /春日井郡/ }));
    expect(onOpenDistrict).toHaveBeenCalledWith(DISTRICT_ID);
  });

  it('keeps unavailable facilities visible but disabled', async () => {
    const user = userEvent.setup();
    render(<CastlePanel castleId={TEST_CASTLE} />);
    await user.click(screen.getByRole('tab', { name: '內政' }));
    await user.click(screen.getAllByRole('button', { name: /空位/ })[0]!);
    expect(screen.getByRole('button', { name: /南蠻寺/ }).hasAttribute('disabled')).toBe(true);
  });
});

describe('DistrictPanel', () => {
  it('sorts steward candidates by politics and emits fief/focus commands', async () => {
    const user = userEvent.setup();
    const commands: Command[] = [];
    render(
      <DistrictPanel
        districtId={DISTRICT_ID}
        onCommand={(command) => {
          commands.push(command);
        }}
      />,
    );

    const select = screen.getByRole('combobox', { name: '領主' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      '直轄',
      '政務高（侍大將・政92・忠70・知行0／1郡）',
      '政務低（侍大將・政68・忠95・知行0／1郡）',
      '當主（足輕組頭・政50・忠100・知行0／0郡） · 目標無效或已不存在',
    ]);
    expect(within(select).getByRole('option', { name: /當主/ }).hasAttribute('disabled')).toBe(
      true,
    );
    await user.selectOptions(select, HIGH_POL);
    await user.click(screen.getByRole('radio', { name: '商業優先' }));

    expect(commands).toEqual([
      { type: 'grantFief', clanId: TEST_CLAN, districtId: DISTRICT_ID, officerId: HIGH_POL },
      {
        type: 'setDevelopFocus',
        clanId: TEST_CLAN,
        districtId: DISTRICT_ID,
        focus: 'commerce',
      },
    ]);
  });

  it('keeps a rank-cap candidate visible but disabled', () => {
    const state = fixture();
    const otherId = 'dist.other' as DistrictId;
    state.districts[otherId] = {
      ...state.districts[DISTRICT_ID]!,
      id: otherId,
      name: '他郡',
      stewardId: HIGH_POL,
    };
    resetGameStoreForTests(state);
    render(<DistrictPanel districtId={DISTRICT_ID} />);
    expect(screen.getByRole('option', { name: /政務高/ }).hasAttribute('disabled')).toBe(true);
  });
});

describe('PolicyPanel', () => {
  it('uses the command validator for event unlocks and facility prerequisites', () => {
    const locked = fixture();
    locked.clans[TEST_CLAN]!.prestige = 1_000;
    locked.policies[TEST_CLAN] = { clanId: TEST_CLAN, active: [], cooldownUntil: {} };
    resetGameStoreForTests(locked);
    const view = render(<PolicyPanel />);
    const nanban = screen.getByRole('heading', { name: '南蠻貿易' }).closest('article')!;
    expect(within(nanban).getByRole('button', { name: '採用' }).hasAttribute('disabled')).toBe(
      true,
    );

    const enabled = () =>
      !within(screen.getByRole('heading', { name: '南蠻貿易' }).closest('article')!)
        .getByRole('button', { name: '採用' })
        .hasAttribute('disabled');
    const publish = (state: ReturnType<typeof fixture>) => {
      act(() => resetGameStoreForTests(state));
      view.rerender(<PolicyPanel />);
    };
    // Prestige plus the required facility remains an independent unlock route.
    const facilityUnlocked = structuredClone(locked);
    facilityUnlocked.castles[TEST_CASTLE]!.facilities.push('fac.minato' as FacilityTypeId);
    publish(facilityUnlocked);
    expect(enabled()).toBe(true);

    const eventUnlocked = fixture();
    eventUnlocked.clans[TEST_CLAN]!.prestige = 0;
    eventUnlocked.policies[TEST_CLAN] = { clanId: TEST_CLAN, active: [], cooldownUntil: {} };
    eventUnlocked.events.fired['evt.nanban-visit' as EventId] = eventUnlocked.time.day;
    publish(eventUnlocked);
    expect(enabled()).toBe(false); // A fired offer alone does not establish acceptance.
    const refused = structuredClone(eventUnlocked);
    refused.events.flags[`unlock.pol.nanban.${TEST_CLAN}`] = 0;
    refused.events.flags['unlock.pol.nanban.clan.other'] = 1;
    publish(refused);
    expect(enabled()).toBe(false); // Another clan's acceptance cannot leak into this clan.
    const accepted = structuredClone(refused);
    accepted.events.flags[`unlock.pol.nanban.${TEST_CLAN}`] = 1;
    publish(accepted);
    expect(enabled()).toBe(true);
  });
});
