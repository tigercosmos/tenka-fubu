// 日本海岸線 outline 幾何檢查——04 §3.3.4「跨 polygon 語意驗收」中可不依賴劇本資料、
// 獨立於單一 outline 檔案即可驗證的子集：全部島嶼合計總點數（300~600）、單一 polygon
// 逆時針纏繞、無自交（線段兩兩相交檢查）、honshu/shikoku/kyushu 三 polygon 互不重疊。
// 規格：plan/04-map-and-movement.md §3.3.1（OutlinePolygon.points 格式：世界座標整數扁平陣列、
// 逆時針纏繞、首尾不重複）、§3.3.4（自動檢查標準）、T2（04-T2 驗收）。
// 18-roadmap.md M2-5 實作；驗收見 tests/data/outline-file.spec.ts。
//
// 範圍界定：本檔只驗證 outline 檔案自身的幾何正確性；「全部城/郡節點座標必須落在某 polygon
// 內部」一項需要劇本城/郡座標資料（14 批次 B1/B2 於 M2-9/M2-10 才產出），留待 `tools/validate.ts`
// 完整版（M2-2 之後）串接本檔匯出的 `pointInPolygon` 一併檢查（src/data/schemas/outline.ts
// 檔頭註解已預告此分工）。

/** 世界座標整數點（04 §3.2）。 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 扁平陣列 [x0,y0,x1,y1,...] → 點陣列（04 §3.3.1 格式）。 */
function toPoints(flat: readonly number[]): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i];
    const y = flat[i + 1];
    if (x === undefined || y === undefined) continue; // 不可能發生：flat 長度恆為偶數（zod 已保證）
    pts.push({ x, y });
  }
  return pts;
}

interface Edge {
  readonly a: Point;
  readonly b: Point;
}

/** 依序取相鄰點對（環狀纏繞，含首尾相接的收尾邊；`points` 首尾不重複，04 §3.3.1）。 */
function edgesOf(points: readonly Point[]): Edge[] {
  const edges: Edge[] = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a === undefined || b === undefined) continue; // 不可能發生：i 恆在 [0,n) 範圍內
    edges.push({ a, b });
  }
  return edges;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    Math.min(p.x, q.x) <= r.x &&
    r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y &&
    r.y <= Math.max(p.y, q.y)
  );
}

/** 兩線段是否相交（含端點觸碰／共線重疊；標準 orientation 測試）。 */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  const straddles =
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  if (straddles) return true;
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

/**
 * 帶號面積（shoelace 公式；世界座標 y 軸向下）。
 * 負值 ⇔ 視覺上逆時針纏繞（04 §3.3.1「land 在左側」；world 座標 y 軸向下時，
 * 標準 shoelace 公式的正負號與數學平面座標系相反）。
 */
export function signedArea(flatPoints: readonly number[]): number {
  const points = toPoints(flatPoints);
  let sum = 0;
  for (const { a, b } of edgesOf(points)) {
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** 是否逆時針纏繞（世界座標視覺逆時針，04 §3.3.1／§3.3.4）。 */
export function isCounterClockwise(flatPoints: readonly number[]): boolean {
  return signedArea(flatPoints) < 0;
}

/**
 * 是否為簡單多邊形（無自交；04 §3.3.4「線段兩兩相交檢查」）。
 * 僅比對非相鄰邊（相鄰邊本就共用一個端點，不計入自交）。
 */
export function isSimplePolygon(flatPoints: readonly number[]): boolean {
  const points = toPoints(flatPoints);
  if (points.length < 3) return false;
  const edges = edgesOf(points);
  for (let i = 0; i < edges.length; i += 1) {
    const edgeI = edges[i];
    if (edgeI === undefined) continue; // 不可能發生：i 恆在 [0, edges.length) 範圍內
    for (let j = i + 1; j < edges.length; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === edges.length - 1);
      if (adjacent) continue;
      const edgeJ = edges[j];
      if (edgeJ === undefined) continue; // 不可能發生
      if (segmentsIntersect(edgeI.a, edgeI.b, edgeJ.a, edgeJ.b)) return false;
    }
  }
  return true;
}

/**
 * Ray casting：世界座標點是否落在多邊形內部。
 * 供本檔 `polygonsOverlap` 與未來 `tools/validate.ts`（M2-2 起）之城/郡節點落點檢查共用。
 */
export function pointInPolygon(x: number, y: number, flatPoints: readonly number[]): boolean {
  const points = toPoints(flatPoints);
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const pi = points[i];
    const pj = points[j];
    if (pi === undefined || pj === undefined) continue; // 不可能發生：i,j 恆在 [0,n) 範圍內
    const intersects =
      pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * 兩多邊形是否重疊（邊對邊相交，或一方完全落在另一方內部；04 §3.3.4
 * 「honshu/shikoku/kyushu 三 polygon 必須存在且互不重疊」）。
 */
export function polygonsOverlap(flatA: readonly number[], flatB: readonly number[]): boolean {
  const ptsA = toPoints(flatA);
  const ptsB = toPoints(flatB);
  const edgesA = edgesOf(ptsA);
  const edgesB = edgesOf(ptsB);
  for (const eA of edgesA) {
    for (const eB of edgesB) {
      if (segmentsIntersect(eA.a, eA.b, eB.a, eB.b)) return true;
    }
  }
  const firstA = ptsA[0];
  const firstB = ptsB[0];
  if (firstA !== undefined && pointInPolygon(firstA.x, firstA.y, flatB)) return true;
  if (firstB !== undefined && pointInPolygon(firstB.x, firstB.y, flatA)) return true;
  return false;
}

/** 全部島嶼合計總點數（04 §3.3.1：規定 300~600）。 */
export function totalPointCount(polygons: readonly { points: readonly number[] }[]): number {
  return polygons.reduce((sum, p) => sum + p.points.length / 2, 0);
}
