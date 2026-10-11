import type { MapGraph } from '@core/state/mapGraph';
import { collectCoastFootprints } from '../constrainedCoast';
import { DISPLAY_COAST, type OutlineGeometry } from '../displayCoast';
import { WORLD_SIZE } from '../mapViewConfig';
import { CASTLE_NODE_GEOMETRY } from '../sceneParts/castleNode';
import { CASTLE_BODY_ART_BY_TIER, castleBodyArtPlacement } from '../sceneParts/castleBodyArt';
import { DISTRICT_NODE_GEOMETRY } from '../sceneParts/districtNode';

// Cover every authored body variant rather than assuming the node's point is its
// painted footprint. Labels are screen-space and are checked separately in QA.
function castleRadius(): number {
  const geometry = CASTLE_NODE_GEOMETRY;
  let radius = Math.hypot(geometry.mainSize, geometry.mainSize) * geometry.farMainBodyScale;
  for (const tier of ['main', 'branch'] as const) {
    const width = tier === 'main' ? geometry.paintedMainWidth : geometry.paintedBranchWidth;
    for (const spec of Object.values(CASTLE_BODY_ART_BY_TIER[tier])) {
      const placement = castleBodyArtPlacement(spec, width);
      const frame = spec.contentBounds;
      for (const x of [frame.x, frame.x + frame.width])
        for (const y of [frame.y, frame.y + frame.height])
          radius = Math.max(
            radius,
            Math.hypot(placement.x + x * placement.scale, placement.y + y * placement.scale),
          );
    }
  }
  return (
    radius + Math.max(geometry.shadowOffsetMain, geometry.paintedStatusGap + geometry.ringWidth)
  );
}

/** Build-only conservative guards; invalid inputs never authorize new water. */
export function collectRiverDisplayConstraints(graph: MapGraph, coast: OutlineGeometry) {
  if (
    !coast.polygons.length ||
    coast.polygons.length > 16 ||
    coast.polygons.reduce((total, polygon) => total + polygon.points.length / 2, 0) >
      DISPLAY_COAST.outputPointBudget
  )
    return null;
  const footprints = collectCoastFootprints(graph, []);
  if (!footprints) return null;
  const castle = castleRadius();
  const district = Math.max(
    DISTRICT_NODE_GEOMETRY.subjugationRingRadius + DISTRICT_NODE_GEOMETRY.subjugationRingWidth / 2,
    DISTRICT_NODE_GEOMETRY.ikkiOffsetY + DISTRICT_NODE_GEOMETRY.ikkiTriangleSize,
  );
  const nodes = new Map([...graph.nodes.values()].map((node) => [`node:${node.id}`, node]));
  const obstacles = footprints.map((footprint) => {
    if (!footprint.id.startsWith('node:')) return footprint;
    const node = nodes.get(footprint.id);
    if (!node) return footprint;
    return Object.freeze({ ...footprint, radius: node.kind === 'castle' ? castle : district });
  });
  const boundaryPolygons = coast.polygons.map((polygon) => {
    if (polygon.points.length < 6 || polygon.points.length % 2) return null;
    const points = Array.from({ length: polygon.points.length / 2 }, (_, i) =>
      Object.freeze({ x: polygon.points[i * 2]!, y: polygon.points[i * 2 + 1]! }),
    );
    return points.every(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= WORLD_SIZE &&
        point.y <= WORLD_SIZE,
    )
      ? Object.freeze(points)
      : null;
  });
  if (boundaryPolygons.some((polygon) => polygon === null)) return null;
  return Object.freeze({
    obstacles: Object.freeze(obstacles),
    boundaryPolygons: Object.freeze(boundaryPolygons.filter((polygon) => polygon !== null)),
  });
}
