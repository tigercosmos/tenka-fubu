import { Container, Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import type { MapNodeId } from '@core/state/ids';
import type { PathResult } from '@core/index';
import { TOKENS_NUM } from '@ui/styles/tokens';

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
  kind: 'friendly' | 'hostile' | 'sea';
  days: number;
  unreachable: boolean;
  needsSubjugate: boolean;
}

export function pathSegments(props: PathPreviewProps): PathSegment[] {
  const result: PathSegment[] = [];
  const nodes = props.result.found ? [...props.result.nodes] : [props.originNodeId];
  if ((props.unreachable ?? !props.result.found) && nodes.at(-1) !== props.targetNodeId) {
    nodes.push(props.targetNodeId);
  }
  for (let index = 0; index + 1 < nodes.length; index += 1) {
    const fromId = nodes[index];
    const toId = nodes[index + 1];
    if (fromId === undefined || toId === undefined) continue;
    const from = props.graph.nodes.get(fromId);
    const to = props.graph.nodes.get(toId);
    if (from === undefined || to === undefined) continue;
    const edgeId = (props.graph.adjacency.get(fromId) ?? []).find((id) => {
      const edge = props.graph.edges.get(id);
      return edge !== undefined && (edge.a === toId || edge.b === toId);
    });
    const edge = edgeId === undefined ? undefined : props.graph.edges.get(edgeId);
    const toStep = props.result.steps[index + 1];
    const fromEta = props.result.steps[index]?.etaDays ?? 0;
    const unreachable = (props.unreachable ?? !props.result.found) && index === nodes.length - 2;
    const needsSubjugate = toStep?.needsSubjugate ?? false;
    const kind =
      edge?.type === 'sea' && !unreachable
        ? 'sea'
        : unreachable || needsSubjugate || props.hostileNodeIds?.has(toId)
          ? 'hostile'
          : 'friendly';
    const days = Math.max(0, (toStep?.etaDays ?? fromEta) - fromEta);
    result.push({ from: from.pos, to: to.pos, kind, days, unreachable, needsSubjugate });
  }
  return result;
}

function dashedLine(g: Graphics, segment: PathSegment): void {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const dash = segment.kind === 'sea' ? 2 : 8;
  const gap = 6;
  const color =
    segment.kind === 'hostile' ? TOKENS_NUM.accentVermilionBright : TOKENS_NUM.accentGold;
  for (let at = 0; at < length; at += dash + gap) {
    const end = Math.min(length, at + dash);
    g.moveTo(segment.from.x + (dx * at) / length, segment.from.y + (dy * at) / length)
      .lineTo(segment.from.x + (dx * end) / length, segment.from.y + (dy * end) / length)
      .stroke({ width: 3, color });
  }
}

export function drawPathPreview(g: Graphics, props: PathPreviewProps): void {
  g.clear();
  const segments = pathSegments(props);
  for (const segment of segments) {
    dashedLine(g, segment);
    for (let day = 1; day <= Math.floor(segment.days); day += 1) {
      const ratio = Math.min(1, day / segment.days);
      g.circle(
        segment.from.x + (segment.to.x - segment.from.x) * ratio,
        segment.from.y + (segment.to.y - segment.from.y) * ratio,
        2.5,
      )
        .fill({ color: TOKENS_NUM.washi100 })
        .stroke({ width: 1, color: TOKENS_NUM.ink900 });
    }
    if (segment.needsSubjugate) {
      const x = (segment.from.x + segment.to.x) / 2;
      const y = (segment.from.y + segment.to.y) / 2;
      g.moveTo(x - 4, y - 4)
        .lineTo(x + 4, y + 4)
        .moveTo(x + 4, y - 4)
        .lineTo(x - 4, y + 4)
        .stroke({ width: 2, color: TOKENS_NUM.accentVermilionBright });
    }
  }
  const last = segments.at(-1);
  if (last !== undefined) {
    const angle = Math.atan2(last.to.y - last.from.y, last.to.x - last.from.x);
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
}

export function createPathPreview(): {
  container: Container;
  update: (props: PathPreviewProps | null) => void;
} {
  const container = new Container();
  const graphics = new Graphics();
  container.addChild(graphics);
  return {
    container,
    update(props) {
      if (props === null) graphics.clear();
      else drawPathPreview(graphics, props);
    },
  };
}
