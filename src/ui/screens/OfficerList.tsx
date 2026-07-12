/* eslint-disable react-refresh/only-export-components -- deterministic table helpers are exported for focused M3-21 tests */
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { BAL } from '@core/balance';
import { RANK_VALUES, type Rank } from '@core/state/enums';
import type { GameState, Officer } from '@core/state/gameState';
import type { CastleId, DistrictId, OfficerId } from '@core/state/ids';
import { formatNumber, t } from '@i18n/zh-TW';
import { DataTable, Panel, type ColumnDef, type SortState } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { useUIStore } from '@ui/hooks/uiStore';
import styles from './OfficerList.module.css';

export type OfficerRoleKind = 'none' | 'lord' | 'steward' | 'corpsLeader';
export type OfficerSortKey =
  'name' | 'ldr' | 'val' | 'int' | 'pol' | 'rank' | 'loyalty' | 'location' | 'role';

export interface OfficerTableSort {
  key: OfficerSortKey;
  dir: 'asc' | 'desc';
}

export interface OfficerRow {
  id: OfficerId;
  name: string;
  ldr: number;
  val: number;
  int: number;
  pol: number;
  rank: Rank;
  rankIndex: number;
  merit: number;
  loyalty: number;
  location: string;
  locationCastleId: CastleId | null;
  role: OfficerRoleKind;
  roleLabel: string;
  loyaltyRisk: boolean;
}

export interface OfficerFilters {
  search: string;
  castleId: CastleId | 'all';
  rank: Rank | 'all';
  role: OfficerRoleKind | 'all';
}

export const DEFAULT_OFFICER_SORT: OfficerTableSort = { key: 'rank', dir: 'desc' };

const collator = new Intl.Collator('zh-Hant');

function effectiveStats(officer: Officer) {
  return {
    ldr: Math.min(BAL.abilityMax, officer.ldr + officer.statGrowth.ldr),
    val: Math.min(BAL.abilityMax, officer.val + officer.statGrowth.val),
    int: Math.min(BAL.abilityMax, officer.int + officer.statGrowth.int),
    pol: Math.min(BAL.abilityMax, officer.pol + officer.statGrowth.pol),
  };
}

const RANK_KEYS: Record<Rank, string> = {
  kumigashira: 'term.rank.ashigaruKumigashira',
  'ashigaru-taisho': 'term.rank.ashigaruTaisho',
  'samurai-taisho': 'term.rank.samuraiTaisho',
  busho: 'term.rank.busho',
  karo: 'term.rank.karo',
  shukuro: 'term.rank.shukuro',
};

const ROLE_KEYS: Record<OfficerRoleKind, string> = {
  none: 'ui.officer.role.none',
  lord: 'term.title.lord',
  steward: 'term.title.steward',
  corpsLeader: 'term.title.corpsLeader',
};

export function rankLabel(rank: Rank): string {
  return t(RANK_KEYS[rank]);
}

export function roleLabel(role: OfficerRoleKind): string {
  return t(ROLE_KEYS[role]);
}

function nodeName(game: GameState, nodeId: string | null): string {
  if (nodeId === null) return t('ui.officer.location.unknown');
  return (
    game.castles[nodeId as CastleId]?.name ?? game.districts[nodeId as DistrictId]?.name ?? nodeId
  );
}

/** UI 投影：只列玩家勢力已元服的在籍武將。 */
export function buildOfficerRows(game: GameState): OfficerRow[] {
  const playerClanId = game.meta.playerClanId;
  const roleByOfficer = new Map<OfficerId, OfficerRoleKind>();
  for (const castle of Object.values(game.castles)) {
    if (castle.lordId !== null) roleByOfficer.set(castle.lordId, 'lord');
  }
  for (const district of Object.values(game.districts)) {
    if (district.stewardId !== null && !roleByOfficer.has(district.stewardId)) {
      roleByOfficer.set(district.stewardId, 'steward');
    }
  }
  for (const corps of Object.values(game.corps)) {
    if (!roleByOfficer.has(corps.corpsLeaderId)) {
      roleByOfficer.set(corps.corpsLeaderId, 'corpsLeader');
    }
  }

  return Object.values(game.officers)
    .filter(
      (officer) =>
        officer.hasComeOfAge && officer.status === 'serving' && officer.clanId === playerClanId,
    )
    .map((officer) => {
      const stats = effectiveStats(officer);
      const army = officer.armyId === null ? undefined : game.armies[officer.armyId];
      const locationCastle =
        officer.locationCastleId === null ? undefined : game.castles[officer.locationCastleId];
      const location =
        army === undefined
          ? (locationCastle?.name ?? t('ui.officer.location.unknown'))
          : t('ui.officer.marchingTo', { target: nodeName(game, army.targetNodeId) });
      const role = roleByOfficer.get(officer.id) ?? 'none';
      return {
        id: officer.id,
        name: officer.name,
        ...stats,
        rank: officer.rank,
        rankIndex: RANK_VALUES.indexOf(officer.rank),
        merit: officer.merit,
        loyalty: officer.loyalty,
        location,
        locationCastleId: officer.locationCastleId,
        role,
        roleLabel: roleLabel(role),
        loyaltyRisk: officer.loyalty < 30,
      };
    });
}

export function filterOfficerRows(
  rows: readonly OfficerRow[],
  filters: OfficerFilters,
): OfficerRow[] {
  const query = filters.search.trim().toLocaleLowerCase('zh-Hant');
  return rows.filter(
    (row) =>
      (query === '' || row.name.toLocaleLowerCase('zh-Hant').includes(query)) &&
      (filters.castleId === 'all' || row.locationCastleId === filters.castleId) &&
      (filters.rank === 'all' || row.rank === filters.rank) &&
      (filters.role === 'all' || row.role === filters.role),
  );
}

function primaryCompare(a: OfficerRow, b: OfficerRow, key: OfficerSortKey): number {
  switch (key) {
    case 'name':
      return collator.compare(a.name, b.name);
    case 'rank':
      return a.rankIndex - b.rankIndex;
    case 'location':
      return collator.compare(a.location, b.location);
    case 'role':
      return collator.compare(a.roleLabel, b.roleLabel);
    default:
      return a[key] - b[key];
  }
}

/** 規格 §5.5：primary → merit desc → OfficerId asc。 */
export function sortOfficerRows(
  rows: readonly OfficerRow[],
  sort: OfficerTableSort = DEFAULT_OFFICER_SORT,
): OfficerRow[] {
  const direction = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = primaryCompare(a, b, sort.key) * direction;
    if (primary !== 0) return primary;
    const merit = b.merit - a.merit;
    return merit !== 0 ? merit : a.id.localeCompare(b.id);
  });
}

const selectRows = makeCachedSelector((game: GameState) => buildOfficerRows(game));
const selectClanModel = makeCachedSelector((game: GameState) => ({
  name: game.clans[game.meta.playerClanId]?.name ?? '',
  castles: Object.values(game.castles)
    .filter((castle) => castle.ownerClanId === game.meta.playerClanId)
    .map((castle) => ({ id: castle.id, name: castle.name }))
    .sort((a, b) => collator.compare(a.name, b.name)),
}));

function ordinalMap(values: readonly string[]): Map<string, number> {
  return new Map(
    [...new Set(values)]
      .sort((a, b) => collator.compare(a, b))
      .map((value, index) => [value, index]),
  );
}

export interface OfficerListProps {
  onClose?: () => void;
  onOpenOfficer?: (officerId: OfficerId) => void;
}

export function OfficerList({ onClose, onOpenOfficer }: OfficerListProps): ReactElement {
  const rows = useCachedGameSelector(selectRows);
  const clan = useCachedGameSelector(selectClanModel);
  const actions = useUIStore((state) => state.actions);
  const [sort, setSort] = useState<OfficerTableSort>(DEFAULT_OFFICER_SORT);
  const [filters, setFilters] = useState<OfficerFilters>({
    search: '',
    castleId: 'all',
    rank: 'all',
    role: 'all',
  });

  const filtered = useMemo(() => filterOfficerRows(rows, filters), [rows, filters]);
  const nameOrdinals = useMemo(() => ordinalMap(filtered.map((row) => row.name)), [filtered]);
  const locationOrdinals = useMemo(
    () => ordinalMap(filtered.map((row) => row.location)),
    [filtered],
  );
  const roleOrdinals = useMemo(() => ordinalMap(filtered.map((row) => row.roleLabel)), [filtered]);
  const meritMax = Math.max(0, ...filtered.map((row) => row.merit));
  const scale = meritMax + 1;
  const sortValue = useCallback(
    (row: OfficerRow, key: OfficerSortKey): number => {
      const primary =
        key === 'name'
          ? (nameOrdinals.get(row.name) ?? 0)
          : key === 'location'
            ? (locationOrdinals.get(row.location) ?? 0)
            : key === 'role'
              ? (roleOrdinals.get(row.roleLabel) ?? 0)
              : key === 'rank'
                ? row.rankIndex
                : row[key];
      // DataTable 套用 primary 方向；同值時讓 merit 永遠降冪。
      const meritTie = sort.dir === 'asc' ? meritMax - row.merit : row.merit;
      return primary * scale + meritTie;
    },
    [locationOrdinals, meritMax, nameOrdinals, roleOrdinals, scale, sort.dir],
  );

  const columns = useMemo<ColumnDef<OfficerRow>[]>(
    () =>
      (
        [
          ['name', t('ui.officer.name'), 170, 'left'],
          ['ldr', t('ui.officer.ldr'), 64, 'right'],
          ['val', t('ui.officer.val'), 64, 'right'],
          ['int', t('ui.officer.int'), 64, 'right'],
          ['pol', t('ui.officer.pol'), 64, 'right'],
          ['rank', t('ui.officer.rank'), 110, 'left'],
          ['loyalty', t('ui.officer.loyalty'), 80, 'right'],
          ['location', t('ui.officer.location'), 160, 'left'],
          ['role', t('ui.officer.role'), 100, 'left'],
        ] as const
      ).map(([key, header, width, align]) => ({
        key,
        header,
        width,
        align,
        sortable: true,
        sortValue: (row) => sortValue(row, key),
        render: (row) => {
          const value =
            key === 'rank'
              ? rankLabel(row.rank)
              : key === 'role'
                ? row.roleLabel
                : key === 'loyalty' ||
                    key === 'ldr' ||
                    key === 'val' ||
                    key === 'int' ||
                    key === 'pol'
                  ? formatNumber(row[key])
                  : row[key];
          return (
            <span
              data-loyalty-risk={row.loyaltyRisk ? 'true' : undefined}
              title={row.loyaltyRisk ? t('ui.officer.loyaltyRisk') : undefined}
            >
              {value}
            </span>
          );
        },
      })),
    [sortValue],
  );

  const close = onClose ?? (() => actions.closePanelById('officers'));
  const openOfficer =
    onOpenOfficer ?? ((officerId: OfficerId) => actions.openPanel('officerDetail', { officerId }));
  return (
    <div className={styles.scrim} data-testid="officer-list">
      <div className={styles.panel}>
        <Panel
          variant="ornate"
          title={`${t('ui.officers.title')}（${t('ui.officer.count', {
            clan: clan.name,
            count: rows.length,
          })}）`}
          onClose={close}
        >
          <div className={styles.filters}>
            <label>
              {t('ui.officer.filter.castle')}
              <select
                aria-label={t('ui.officer.filter.castle')}
                value={filters.castleId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    castleId: event.target.value as CastleId | 'all',
                  }))
                }
              >
                <option value="all">{t('ui.officer.filter.all')}</option>
                {clan.castles.map((castle) => (
                  <option key={castle.id} value={castle.id}>
                    {castle.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ui.officer.filter.rank')}
              <select
                aria-label={t('ui.officer.filter.rank')}
                value={filters.rank}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    rank: event.target.value as Rank | 'all',
                  }))
                }
              >
                <option value="all">{t('ui.officer.filter.all')}</option>
                {RANK_VALUES.map((rank) => (
                  <option key={rank} value={rank}>
                    {rankLabel(rank)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ui.officer.filter.role')}
              <select
                aria-label={t('ui.officer.filter.role')}
                value={filters.role}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    role: event.target.value as OfficerRoleKind | 'all',
                  }))
                }
              >
                <option value="all">{t('ui.officer.filter.all')}</option>
                {(['lord', 'steward', 'corpsLeader', 'none'] as const).map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.search}>
              {t('ui.officer.search')}
              <input
                type="search"
                aria-label={t('ui.officer.search')}
                value={filters.search}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
              />
            </label>
          </div>
          <div className={styles.tableShell}>
            <DataTable
              rows={filtered}
              columns={columns}
              rowKey={(row) => row.id}
              rowHeight={40}
              height={720}
              sort={sort satisfies SortState}
              onSortChange={(next) => setSort(next as OfficerTableSort)}
              onRowClick={(row) => openOfficer(row.id)}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
