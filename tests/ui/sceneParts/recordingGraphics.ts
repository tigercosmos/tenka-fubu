// 錄製用 mock Graphics（供 sceneParts 純繪製函式測試共用）。
// 沿用 tests/ui/mapDraw.spec.ts（M2-13）的錄製慣例，擴充 circle/arc（耐久環／制壓弧／選取環用）。

import type { Graphics } from 'pixi.js';

export class RecordingGraphics {
  readonly calls: unknown[][] = [];
  private rec(name: string, args: unknown[]): this {
    this.calls.push([name, ...args]);
    return this;
  }
  clear(): this {
    return this.rec('clear', []);
  }
  rect(...a: unknown[]): this {
    return this.rec('rect', a);
  }
  poly(...a: unknown[]): this {
    return this.rec('poly', a);
  }
  circle(...a: unknown[]): this {
    return this.rec('circle', a);
  }
  arc(...a: unknown[]): this {
    return this.rec('arc', a);
  }
  moveTo(...a: unknown[]): this {
    return this.rec('moveTo', a);
  }
  lineTo(...a: unknown[]): this {
    return this.rec('lineTo', a);
  }
  fill(...a: unknown[]): this {
    return this.rec('fill', a);
  }
  stroke(...a: unknown[]): this {
    return this.rec('stroke', a);
  }
  countOf(name: string): number {
    return this.calls.filter((c) => c[0] === name).length;
  }
  argsOf(name: string): unknown[][] {
    return this.calls.filter((c) => c[0] === name).map((c) => c.slice(1));
  }
}

export function makeRec(): { rec: RecordingGraphics; g: Graphics } {
  const rec = new RecordingGraphics();
  return { rec, g: rec as unknown as Graphics };
}

/** 由扁平座標陣列（`[x0,y0,x1,y1,...]`）算外接盒 `{minX,maxX,minY,maxY,width,height}`。 */
export function boundingBoxOf(points: readonly number[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
