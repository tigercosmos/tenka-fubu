import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BitmapText, TextStyle } from 'pixi.js';
import { createCastleNameplate, type CastleNameplateProps } from './castleNameplate';
import { NAMEPLATE_GEOMETRY } from './nameplateStyle';

// Real installed Pixi constructors/styles, not the shared identity mock. Only
// width measurement is stubbed: jsdom has no font canvas/GPU. This proves style
// ownership/allocation behavior, not rendered pixels or post-GC heap bounds.
const ownWidth = Object.getOwnPropertyDescriptor(BitmapText.prototype, 'width');
beforeEach(() =>
  Object.defineProperty(BitmapText.prototype, 'width', {
    configurable: true,
    get: () => 24,
  }),
);
const parts: ReturnType<typeof createCastleNameplate>[] = [];
function createPart() {
  const part = createCastleNameplate();
  parts.push(part);
  return part;
}
afterEach(() => {
  for (const part of parts.splice(0)) if (!part.container.destroyed) part.destroy();
  if (ownWidth) Object.defineProperty(BitmapText.prototype, 'width', ownWidth);
  else Reflect.deleteProperty(BitmapText.prototype, 'width');
});

const props: CastleNameplateProps = {
  pos: { x: 100, y: 120 },
  name: '測試城',
  tier: 'main',
  colorIndex: 0,
  relation: 'friendly',
  isPlayer: true,
  warning: 'none',
  soldiers: 1000,
};
function labels(part: ReturnType<typeof createCastleNameplate>) {
  return part.container.children.filter(
    (child): child is BitmapText => child instanceof BitmapText,
  );
}

describe('privately owned nameplate TextStyle lifetime', () => {
  it('retains actual public TextStyle identity/key across unchanged-font redraws', () => {
    const part = createPart();
    part.update(props);
    const [name, troops] = labels(part);
    const styles = [name!.style, troops!.style];
    expect(styles.every((style) => style instanceof TextStyle)).toBe(true);
    const keys = styles.map((style) => style.styleKey);
    const ids = styles.map((style) => style.uid);
    expect(troops!.text).toBe('1,000');
    const size = part.getRibbonSize();
    part.update({ ...props, soldiers: 999, warning: 'threatened', colorIndex: 1 });
    expect([name!.style.uid, troops!.style.uid]).toEqual(ids);
    expect([name!.style.styleKey, troops!.style.styleKey]).toEqual(keys);
    expect(part.getRibbonSize()).toEqual(size);
    expect(troops!.text).toBe('999');
    part.destroy();
    expect(part.container.destroyed).toBe(true);
    expect(name!.destroyed).toBe(true);
    expect(troops!.destroyed).toBe(true);
  });

  it('updates tier font sizes and geometry while keeping distinct label ownership', () => {
    const part = createPart();
    const other = createPart();
    const initialBranch = createPart();
    initialBranch.update({ ...props, tier: 'branch' });
    const [branchName, branchTroops] = labels(initialBranch);
    expect(branchName!.style.fontSize).toBe(NAMEPLATE_GEOMETRY.branch.nameSize);
    expect(branchTroops!.style.fontSize).toBe(NAMEPLATE_GEOMETRY.branch.troopNumSize);
    expect(initialBranch.getRibbonSize().h).toBe(NAMEPLATE_GEOMETRY.branch.ribbonH);
    const initialBranchIds = [branchName!.style.uid, branchTroops!.style.uid];
    initialBranch.update({ ...props, tier: 'branch', soldiers: 700 });
    expect([branchName!.style.uid, branchTroops!.style.uid]).toEqual(initialBranchIds);
    initialBranch.destroy();
    expect(branchName!.destroyed).toBe(true);
    expect(branchTroops!.destroyed).toBe(true);
    part.update(props);
    other.update(props);
    const [name, troops] = labels(part);
    const [otherName, otherTroops] = labels(other);
    expect(name!.style.uid).not.toBe(troops!.style.uid);
    expect(name!.style.uid).not.toBe(otherName!.style.uid);
    expect(troops!.style.uid).not.toBe(otherTroops!.style.uid);
    part.update({ ...props, tier: 'branch' });
    expect(name!.style.fontSize).toBe(NAMEPLATE_GEOMETRY.branch.nameSize);
    expect(troops!.style.fontSize).toBe(NAMEPLATE_GEOMETRY.branch.troopNumSize);
    expect(part.getRibbonSize().h).toBe(NAMEPLATE_GEOMETRY.branch.ribbonH);
    const branchIds = [name!.style.uid, troops!.style.uid];
    part.update({ ...props, tier: 'branch', soldiers: 800 });
    expect([name!.style.uid, troops!.style.uid]).toEqual(branchIds);
    part.update(props);
    expect(name!.style.fontSize).toBe(NAMEPLATE_GEOMETRY.main.nameSize);
    expect(troops!.style.fontSize).toBe(NAMEPLATE_GEOMETRY.main.troopNumSize);
    expect(part.getRibbonSize().h).toBe(NAMEPLATE_GEOMETRY.main.ribbonH);
    part.destroy();
    expect(otherName!.destroyed).toBe(false);
    expect(otherName!.style.fontSize).toBe(NAMEPLATE_GEOMETRY.main.nameSize);
    other.destroy();
  });
});
