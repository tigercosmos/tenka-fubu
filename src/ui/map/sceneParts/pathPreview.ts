import { Container, Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import type { MapNodeId } from '@core/state/ids';
import type { PathResult } from '@core/index';
import { TOKENS_NUM } from '@ui/styles/tokens';
import {
  edgeBetween,
  edgeVisualPolyline,
  pointAtPolyline,
  tangentAtPolyline,
  type RoadPoint,
} from '../roads/roadGeometry';
import {
  flatProjectionRecord,
  projectPolyline,
  assertProjectedStationBudget,
  type PointProjection,
  type RoadProjectionRecord,
  type ProjectedPolyline,
} from '../roads/projectPolyline';

const sourceMetrics = new WeakMap<
  ProjectedPolyline,
  { cumulative: readonly number[]; total: number }
>();
const segmentSources = new WeakMap<PathSegment, { path: ProjectedPolyline; reverse: boolean }>();

/** Interpolate emitted scene stations using canonical source-distance progress.
 * Never resample the projection at ETA points or redistribute time by scene length.
 */
function pointAtSourceFraction(
  path: ProjectedPolyline,
  fraction: number,
  reverse: boolean,
): RoadPoint | null {
  const stations = path.stations;
  if (stations.length === 0) return null;
  const ratio = reverse ? 1 - fraction : fraction;
  if (ratio <= 0) return { ...stations[0]!.scene };
  if (ratio >= 1) return { ...stations.at(-1)!.scene };
  let metrics = sourceMetrics.get(path);
  if (metrics === undefined) {
    const cumulative = [0];
    for (let i = 1; i < stations.length; i++) {
      const a = stations[i - 1]!.source,
        b = stations[i]!.source;
      cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    metrics = { cumulative: Object.freeze(cumulative), total: cumulative.at(-1)! };
    sourceMetrics.set(path, metrics);
  }
  if (metrics.total === 0) return { ...stations[0]!.scene };
  const target = ratio * metrics.total;
  let low = 1,
    high = stations.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (metrics.cumulative[middle]! >= target) high = middle;
    else low = middle + 1;
  }
  const fromDistance = metrics.cumulative[low - 1]!,
    length = metrics.cumulative[low]! - fromDistance;
  const a = stations[low - 1]!.scene,
    b = stations[low]!.scene;
  const t = length === 0 ? 0 : (target - fromDistance) / length;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export interface PathPreviewProps {
  graph: MapGraph;
  result: PathResult;
  originNodeId: MapNodeId;
  targetNodeId: MapNodeId;
  unreachable?: boolean;
  hostileNodeIds?: ReadonlySet<string>;
}

export interface PathSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Shared display curve through authored anchors, ordered in the actual travel direction. */
  pts: readonly RoadPoint[];
  kind: 'friendly' | 'hostile' | 'sea';
  days: number;
  unreachable: boolean;
  needsSubjugate: boolean;
}

export function pathSegments(
  props: PathPreviewProps,
  project?: PointProjection,
  records?: RoadProjectionRecord[],
): PathSegment[] {
  const result: PathSegment[] = [];
  const pending: { source: readonly RoadPoint[]; reverse: boolean; roadId: string }[] = [];
  const nodes = props.result.found ? [...props.result.nodes] : [props.originNodeId];
  const hasConnector =
    (props.unreachable ?? !props.result.found) && nodes.at(-1) !== props.targetNodeId;
  if (hasConnector) {
    nodes.push(props.targetNodeId);
  }
  for (let index = 0; index + 1 < nodes.length; index += 1) {
    const fromId = nodes[index];
    const toId = nodes[index + 1];
    if (fromId === undefined || toId === undefined) continue;
    const from = props.graph.nodes.get(fromId);
    const to = props.graph.nodes.get(toId);
    if (from === undefined || to === undefined) continue;
    const recordedEdgeId = props.result.edgeIds[index];
    const recordedEdge =
      recordedEdgeId === undefined ? undefined : props.graph.edges.get(recordedEdgeId);
    const recordedConnects =
      recordedEdge !== undefined &&
      ((recordedEdge.a === fromId && recordedEdge.b === toId) ||
        (recordedEdge.b === fromId && recordedEdge.a === toId));
    const edge = recordedConnects ? recordedEdge : edgeBetween(props.graph, fromId, toId);
    const toStep = props.result.steps[index + 1];
    const fromEta = props.result.steps[index]?.etaDays ?? 0;
    const unreachable = hasConnector && index === nodes.length - 2;
    const needsSubjugate = toStep?.needsSubjugate ?? false;
    const kind =
      edge?.type === 'sea' && !unreachable
        ? 'sea'
        : unreachable || needsSubjugate || props.hostileNodeIds?.has(toId)
          ? 'hostile'
          : 'friendly';
    const days = Math.max(0, (toStep?.etaDays ?? fromEta) - fromEta);
    const authored =
      !unreachable && edge !== undefined ? edgeVisualPolyline(edge, props.graph) : null;
    const pts =
      authored === null
        ? [from.pos, to.pos]
        : edge?.a === fromId
          ? authored
          : authored.slice().reverse();
    if (project === undefined) {
      records?.push(flatProjectionRecord(edge?.id ?? `${fromId}->${toId}`, pts));
      result.push({ from: from.pos, to: to.pos, pts, kind, days, unreachable, needsSubjugate });
    } else {
      pending.push({
        source: authored ?? pts,
        reverse: authored !== null && edge?.a !== fromId,
        roadId: edge?.id ?? `${fromId}->${toId}`,
      });
      result.push({ from: from.pos, to: to.pos, pts, kind, days, unreachable, needsSubjugate });
    }
  }
  if (project !== undefined) {
    assertProjectedStationBudget(pending.map((entry) => entry.source));
    return result.map((segment, index) => {
      const { source, reverse, roadId } = pending[index]!;
      const projected = projectPolyline(source, project);
      const actual = reverse ? Object.freeze([...projected.points].reverse()) : projected.points;
      const stations = reverse
        ? Object.freeze(
            [...projected.stations]
              .reverse()
              .map((station, ordinal) => Object.freeze({ ...station, ordinal })),
          )
        : projected.stations;
      records?.push(Object.freeze({ roadId, stations }));
      const emitted = { ...segment, from: actual[0]!, to: actual.at(-1)!, pts: actual };
      segmentSources.set(emitted, { path: projected, reverse });
      return emitted;
    });
  }
  return result;
}

function dashedLine(g: Graphics, segment: PathSegment): void {
  const dash = segment.kind === 'sea' ? 2 : 8;
  const gap = 6;
  const color =
    segment.kind === 'hostile' ? TOKENS_NUM.accentVermilionBright : TOKENS_NUM.accentGold;
  let distance = 0;
  for (let index = 1; index < segment.pts.length; index++) {
    const from = segment.pts[index - 1]!,
      to = segment.pts[index]!;
    const dx = to.x - from.x,
      dy = to.y - from.y,
      length = Math.hypot(dx, dy);
    let at = 0;
    while (at < length) {
      const phase = (distance + at) % (dash + gap);
      const painted = phase < dash;
      const end = Math.min(length, at + (painted ? dash - phase : dash + gap - phase));
      if (end <= at) break;
      if (painted)
        g.moveTo(from.x + (dx * at) / length, from.y + (dy * at) / length)
          .lineTo(from.x + (dx * end) / length, from.y + (dy * end) / length)
          .stroke({ width: 3, color });
      at = end;
    }
    distance += length;
  }
}

export function drawPathPreview(
  g: Graphics,
  props: PathPreviewProps,
  project?: PointProjection,
): readonly RoadProjectionRecord[] {
  g.clear();
  const records: RoadProjectionRecord[] = [];
  const segments = pathSegments(props, project, records);
  for (const segment of segments) {
    dashedLine(g, segment);
    for (let day = 1; day <= Math.floor(segment.days); day += 1) {
      const ratio = Math.min(1, day / segment.days);
      const source = segmentSources.get(segment);
      const point =
        source === undefined
          ? pointAtPolyline(segment.pts, ratio)
          : pointAtSourceFraction(source.path, ratio, source.reverse);
      if (point === null) continue;
      g.circle(point.x, point.y, 2.5)
        .fill({ color: TOKENS_NUM.washi100 })
        .stroke({ width: 1, color: TOKENS_NUM.ink900 });
    }
    if (segment.needsSubjugate) {
      const midpoint = pointAtPolyline(segment.pts, 0.5);
      if (midpoint === null) continue;
      const { x, y } = midpoint;
      g.moveTo(x - 4, y - 4)
        .lineTo(x + 4, y + 4)
        .moveTo(x + 4, y - 4)
        .lineTo(x - 4, y + 4)
        .stroke({ width: 2, color: TOKENS_NUM.accentVermilionBright });
    }
  }
  const last = segments.at(-1);
  if (last !== undefined) {
    const angle = tangentAtPolyline(last.pts, 1);
    if (angle === null) return Object.freeze(records);
    const size = 10;
    g.poly([
      last.to.x,
      last.to.y,
      last.to.x - Math.cos(angle - Math.PI / 6) * size,
      last.to.y - Math.sin(angle - Math.PI / 6) * size,
      last.to.x - Math.cos(angle + Math.PI / 6) * size,
      last.to.y - Math.sin(angle + Math.PI / 6) * size,
    ]).fill({
      color: last.kind === 'hostile' ? TOKENS_NUM.accentVermilionBright : TOKENS_NUM.accentGold,
    });
  }
  return Object.freeze(records);
}

export function createPathPreview(project?: PointProjection): {
  container: Container;
  update: (props: PathPreviewProps | null) => void;
  getProjectionDiagnostics(): readonly RoadProjectionRecord[];
} {
  const container = new Container();
  const graphics = new Graphics();
  container.addChild(graphics);
  let diagnostics: readonly RoadProjectionRecord[] = Object.freeze([]);
  return {
    container,
    update(props) {
      if (props === null) {
        graphics.clear();
        diagnostics = Object.freeze([]);
      } else diagnostics = drawPathPreview(graphics, props, project);
    },
    getProjectionDiagnostics: () => diagnostics,
  };
}
