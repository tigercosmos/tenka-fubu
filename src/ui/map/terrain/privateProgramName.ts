export interface PrivateProgramNameLease {
  readonly name: string;
  release(): void;
}
const liveSlots = new Map<string, Set<number>>();
/** Pixi permanently interns shader-source strings, including their names. Reuse a
 * name only after its private program is destroyed; live owners keep distinct keys.
 * Interned names then grow with peak concurrent owners, not cumulative remounts.
 */
export function acquirePrivateProgramName(
  family: 'terrain-foothill-canopy' | 'terrain-elevated',
): PrivateProgramNameLease {
  let slots = liveSlots.get(family);
  if (!slots) liveSlots.set(family, (slots = new Set()));
  let slot = 1;
  while (slots.has(slot)) slot++;
  slots.add(slot);
  let released = false;
  return {
    name: `${family}-private-${slot}`,
    release() {
      if (released) return;
      released = true;
      slots.delete(slot);
    },
  };
}
