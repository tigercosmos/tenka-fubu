import type { EmitFn } from '../../commands/registry';
import { REGION_VALUES, type Region } from '../../state/enums';
import type { GameState } from '../../state/gameState';
import type { ClanId } from '../../state/ids';
import { applyScalarEffects } from './scalarEffects';
import type { EffectOp, EventBinding, RegionEffect, RegionRef } from './types';

export function resolveRegionRef(
  ref: RegionRef,
  binding: Readonly<EventBinding> | null,
): Region | null {
  const region = ref === '$region' ? binding?.region : ref;
  return region != null && (REGION_VALUES as readonly string[]).includes(region) ? region : null;
}

function targets(state: Readonly<GameState>, region: Region) {
  const castleRegion = (castleId: string) => {
    const castle = state.castles[castleId as keyof typeof state.castles];
    return castle && state.provinces[castle.provinceId]?.region;
  };
  return {
    castles: Object.values(state.castles)
      .filter((castle) => castleRegion(castle.id) === region)
      .sort((a, b) => a.id.localeCompare(b.id)),
    districts: Object.values(state.districts)
      .filter((district) => castleRegion(district.castleId) === region)
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Territory presence, not the player or the selected region's first owner, determines recipients. */
export function affectedRegionClanIds(
  state: Readonly<GameState>,
  region: Region | null | undefined,
): ClanId[] {
  if (region == null) return [];
  const { castles, districts } = targets(state, region);
  return [
    ...new Set(
      [...castles, ...districts]
        .map((entity) => entity.ownerClanId)
        .filter((id) => state.clans[id]?.alive),
    ),
  ].sort();
}

export function supportsRegionEffects(ops: readonly RegionEffect[]): boolean {
  return ops.every((op) =>
    ['scaleCastleDurability', 'addDistrictOrder', 'scalePopulation'].includes(op.op),
  );
}

/** Ordered regional fanout reuses scalar guards, rounding and bounds; no RNG or extra events. */
export function applyRegionEffects(
  state: GameState,
  op: Extract<EffectOp, { op: 'affectRegion' }>,
  binding: Readonly<EventBinding> | null,
  emit: EmitFn,
): void {
  const region = resolveRegionRef(op.region, binding);
  if (region === null) return;
  const { castles, districts } = targets(state, region);
  for (const effect of op.effects) {
    if (effect.op === 'scaleCastleDurability') {
      for (const castle of castles)
        applyScalarEffects(state, [{ ...effect, castleId: castle.id }], binding, emit);
    } else {
      for (const district of districts)
        applyScalarEffects(state, [{ ...effect, districtId: district.id }], binding, emit);
    }
  }
}
