import { Connection, Node } from '../types';
import {
  CONNECTION_CURVE_BASE,
  CONNECTION_CURVE_STEP,
  NODE_HEIGHT,
  NODE_WIDTH,
} from './constants';

export interface Point {
  x: number;
  y: number;
}

interface BuildConnectionGeometryOptions {
  conn: Connection;
  getNode: (id: string) => Node | undefined;
  getNodeBoxSize: (text: string) => { width: number; height: number };
  lastDirection: Point;
  isNodeFocused?: (nodeId: string) => boolean;
}

export interface ConnectionGeometry {
  rawStart: Point;
  rawEnd: Point;
  start: Point;
  end: Point;
  c1: Point;
  c2: Point;
  curveOffsetRaw: number;
  curveOffset: number;
  centerLen: number;
  normalX: number;
  normalY: number;
  pathD: string;
  labelCenter: Point;
  curveControl: Point;
}

function getBezierMidpoint(from: Point, c1: Point, c2: Point, to: Point): Point {
  return {
    x: 0.125 * from.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * to.x,
    y: 0.125 * from.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * to.y,
  };
}

export function getRenderedCurveBend(fromId: string, toId: string, rawBend: number): number {
  return fromId > toId ? -rawBend : rawBend;
}

export function getConnectionCurveOffsetRaw(conn: Connection, from: Point, to: Point): number {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (typeof conn.curveBendRatio === 'number' && Number.isFinite(conn.curveBendRatio)) {
    return conn.curveBendRatio * len;
  }
  return conn.curveBend ?? 0;
}

export function sampleConnectionCenterPath(from: Point, to: Point, renderedBend: number, steps = 16): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [from, to];

  const dirX = dx / len;
  const dirY = dy / len;
  const normalX = -dirY;
  const normalY = dirX;
  const tangentLen = Math.max(26, len * 0.22);

  const c1 = {
    x: from.x + dirX * tangentLen + normalX * renderedBend,
    y: from.y + dirY * tangentLen + normalY * renderedBend,
  };
  const c2 = {
    x: to.x - dirX * tangentLen + normalX * renderedBend,
    y: to.y - dirY * tangentLen + normalY * renderedBend,
  };

  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * mt * from.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * to.x,
      y: mt * mt * mt * from.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * to.y,
    });
  }

  return points;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function nearlyEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

function pointsNearlyEqual(a: Point, b: Point, epsilon = 1e-6): boolean {
  return nearlyEqual(a.x, b.x, epsilon) && nearlyEqual(a.y, b.y, epsilon);
}

function segmentsShareEndpoint(a: Point, b: Point, c: Point, d: Point): boolean {
  return (
    pointsNearlyEqual(a, c) ||
    pointsNearlyEqual(a, d) ||
    pointsNearlyEqual(b, c) ||
    pointsNearlyEqual(b, d)
  );
}

function segmentsOverlapOrIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const epsilon = 1e-6;
  const orient = (p: Point, q: Point, r: Point) => cross(q.x - p.x, q.y - p.y, r.x - p.x, r.y - p.y);
  const onSegment = (p: Point, q: Point, r: Point) =>
    q.x <= Math.max(p.x, r.x) + epsilon &&
    q.x >= Math.min(p.x, r.x) - epsilon &&
    q.y <= Math.max(p.y, r.y) + epsilon &&
    q.y >= Math.min(p.y, r.y) - epsilon;

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  const properIntersection =
    ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
    ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon));
  if (properIntersection) {
    return true;
  }

  const colinear =
    Math.abs(o1) <= epsilon &&
    Math.abs(o2) <= epsilon &&
    Math.abs(o3) <= epsilon &&
    Math.abs(o4) <= epsilon;

  if (colinear) {
    const overlapX = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    const overlapY = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    const overlap = Math.max(overlapX, overlapY);
    return overlap > epsilon;
  }

  const cOnAb = Math.abs(o1) <= epsilon && onSegment(a, c, b);
  const dOnAb = Math.abs(o2) <= epsilon && onSegment(a, d, b);
  const aOnCd = Math.abs(o3) <= epsilon && onSegment(c, a, d);
  const bOnCd = Math.abs(o4) <= epsilon && onSegment(c, b, d);

  const sharedEndpointTouch =
    (pointsNearlyEqual(a, c, epsilon) || pointsNearlyEqual(a, d, epsilon) || pointsNearlyEqual(b, c, epsilon) || pointsNearlyEqual(b, d, epsilon)) &&
    !(cOnAb || dOnAb || aOnCd || bOnCd);

  return (cOnAb || dOnAb || aOnCd || bOnCd) && !sharedEndpointTouch;
}

function straightSegmentsRequireBend(a: Point, b: Point, c: Point, d: Point): boolean {
  const epsilon = 1e-6;
  const sameUnorderedEndpoints =
    (pointsNearlyEqual(a, c, epsilon) && pointsNearlyEqual(b, d, epsilon)) ||
    (pointsNearlyEqual(a, d, epsilon) && pointsNearlyEqual(b, c, epsilon));

  if (sameUnorderedEndpoints) {
    return true;
  }

  if (segmentsShareEndpoint(a, b, c, d)) {
    return false;
  }

  const orient = (p: Point, q: Point, r: Point) => cross(q.x - p.x, q.y - p.y, r.x - p.x, r.y - p.y);
  const onSegment = (p: Point, q: Point, r: Point) =>
    q.x <= Math.max(p.x, r.x) + epsilon &&
    q.x >= Math.min(p.x, r.x) - epsilon &&
    q.y <= Math.max(p.y, r.y) + epsilon &&
    q.y >= Math.min(p.y, r.y) - epsilon;

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  const properIntersection =
    ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
    ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon));
  if (properIntersection) {
    return true;
  }

  const colinear =
    Math.abs(o1) <= epsilon &&
    Math.abs(o2) <= epsilon &&
    Math.abs(o3) <= epsilon &&
    Math.abs(o4) <= epsilon;

  if (colinear) {
    const overlapX = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    const overlapY = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    return Math.max(overlapX, overlapY) > epsilon;
  }

  const cOnAb = Math.abs(o1) <= epsilon && onSegment(a, c, b);
  const dOnAb = Math.abs(o2) <= epsilon && onSegment(a, d, b);
  const aOnCd = Math.abs(o3) <= epsilon && onSegment(c, a, d);
  const bOnCd = Math.abs(o4) <= epsilon && onSegment(c, b, d);

  return cOnAb || dOnAb || aOnCd || bOnCd;
}

function pathIntersectsSegment(path: Point[], segmentStart: Point, segmentEnd: Point): boolean {
  for (let i = 0; i < path.length - 1; i += 1) {
    if (segmentsOverlapOrIntersect(path[i], path[i + 1], segmentStart, segmentEnd)) {
      return true;
    }
  }
  return false;
}

function getEdgePoint(from: Point, to: Point, nodeSize: { width: number; height: number }, isNodeFocused: boolean): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return to;

  const scaleFactor = isNodeFocused ? 1.05 : 1;
  const halfWidth = (nodeSize.width * scaleFactor) / 2 + 1;
  const halfHeight = (nodeSize.height * scaleFactor) / 2 + 1;
  const scaleX = dx === 0 ? Infinity : Math.abs(halfWidth / dx);
  const scaleY = dy === 0 ? Infinity : Math.abs(halfHeight / dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: to.x - dx * scale,
    y: to.y - dy * scale,
  };
}

export function getConnectionFocusPoint(
  conn: Connection,
  getNode: (id: string) => Node | undefined,
  lastDirection: Point,
): Point | null {
  const from = getNode(conn.fromId);
  if (!from) return null;

  const toNode = conn.toId ? getNode(conn.toId) : null;
  const to = toNode
    ? { x: toNode.x, y: toNode.y }
    : (conn.tempToPos ?? { x: from.x + lastDirection.x, y: from.y + lastDirection.y });

  const rawBend = getConnectionCurveOffsetRaw(conn, from, to);
  const renderedBend = conn.toId ? getRenderedCurveBend(conn.fromId, conn.toId, rawBend) : rawBend;

  if (renderedBend === 0) {
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: from.x, y: from.y };

  const dirX = dx / len;
  const dirY = dy / len;
  const normalX = -dirY;
  const normalY = dirX;
  const tangentLen = Math.max(26, len * 0.22);

  const c1 = {
    x: from.x + dirX * tangentLen + normalX * renderedBend,
    y: from.y + dirY * tangentLen + normalY * renderedBend,
  };
  const c2 = {
    x: to.x - dirX * tangentLen + normalX * renderedBend,
    y: to.y - dirY * tangentLen + normalY * renderedBend,
  };

  return getBezierMidpoint(from, c1, c2, to);
}

export function chooseBestCurveBend(params: {
  fromId: string;
  toId: string;
  connections: Connection[];
  getNode: (id: string) => Node | undefined;
  excludeConnId?: string;
}): number {
  const { fromId, toId, connections, getNode, excludeConnId } = params;
  const from = getNode(fromId);
  const to = getNode(toId);
  if (!from || !to) return 0;

  const completedConnections = connections.filter(
    (connection): connection is Connection & { toId: string } => !!connection.toId && connection.id !== excludeConnId,
  );

  const existingSegments = completedConnections
    .map(connection => {
      const startNode = getNode(connection.fromId);
      const endNode = getNode(connection.toId);
      if (!startNode || !endNode) return null;
      return {
        fromId: connection.fromId,
        toId: connection.toId,
        start: { x: startNode.x, y: startNode.y },
        end: { x: endNode.x, y: endNode.y },
      };
    })
    .filter((segment): segment is { fromId: string; toId: string; start: Point; end: Point } => !!segment);

  const hasStraightOverlap = existingSegments.some(segment =>
    straightSegmentsRequireBend(from, to, segment.start, segment.end),
  );
  if (!hasStraightOverlap) {
    return 0;
  }

  const candidates: number[] = [0];
  const maxLevel = 5;
  for (let level = 1; level <= maxLevel; level += 1) {
    const magnitude = CONNECTION_CURVE_BASE + (level - 1) * CONNECTION_CURVE_STEP;
    candidates.push(magnitude, -magnitude);
  }

  let bestBend = 0;
  let bestScore = Infinity;

  for (const rawBend of candidates) {
    const renderedBend = getRenderedCurveBend(fromId, toId, rawBend);
    const testPath = sampleConnectionCenterPath(from, to, renderedBend);

    let intersections = 0;
    for (const segment of existingSegments) {
      if (straightSegmentsRequireBend(from, to, segment.start, segment.end)) {
        continue;
      }
      if (pathIntersectsSegment(testPath, segment.start, segment.end)) {
        intersections += 1;
      }
    }

    const score = intersections * 1000 + (rawBend === 0 ? 10000 : 0) + Math.abs(rawBend) * 0.1;

    if (score < bestScore) {
      bestScore = score;
      bestBend = rawBend;
    }
  }

  return bestBend;
}

export function buildConnectionGeometry(options: BuildConnectionGeometryOptions): ConnectionGeometry | null {
  const { conn, getNode, getNodeBoxSize, lastDirection, isNodeFocused } = options;
  const fromNode = getNode(conn.fromId);
  if (!fromNode) return null;

  const toNode = conn.toId ? getNode(conn.toId) : null;
  const rawStart = { x: fromNode.x, y: fromNode.y };
  const rawEnd = toNode
    ? { x: toNode.x, y: toNode.y }
    : (conn.tempToPos ?? { x: rawStart.x + lastDirection.x, y: rawStart.y + lastDirection.y });

  const curveOffsetRaw = getConnectionCurveOffsetRaw(conn, rawStart, rawEnd);
  const curveOffset = conn.toId ? getRenderedCurveBend(conn.fromId, conn.toId, curveOffsetRaw) : curveOffsetRaw;

  const centerDx = rawEnd.x - rawStart.x;
  const centerDy = rawEnd.y - rawStart.y;
  const centerLen = Math.hypot(centerDx, centerDy);
  const normalX = centerLen === 0 ? 0 : -centerDy / centerLen;
  const normalY = centerLen === 0 ? 0 : centerDx / centerLen;
  const tangentLen = Math.max(26, centerLen * 0.22);
  const c1Center = {
    x: rawStart.x + (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset,
    y: rawStart.y + (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset,
  };
  const c2Center = {
    x: rawEnd.x - (centerLen === 0 ? 0 : (centerDx / centerLen) * tangentLen) + normalX * curveOffset,
    y: rawEnd.y - (centerLen === 0 ? 0 : (centerDy / centerLen) * tangentLen) + normalY * curveOffset,
  };

  const start = getEdgePoint(
    c1Center,
    rawStart,
    getNodeBoxSize(fromNode.text) ?? { width: NODE_WIDTH, height: NODE_HEIGHT },
    isNodeFocused?.(fromNode.id) ?? false,
  );
  const end = toNode
    ? getEdgePoint(
        c2Center,
        rawEnd,
        getNodeBoxSize(toNode.text) ?? { width: NODE_WIDTH, height: NODE_HEIGHT },
        isNodeFocused?.(toNode.id) ?? false,
      )
    : rawEnd;

  const c1 = {
    x: start.x + (c1Center.x - rawStart.x),
    y: start.y + (c1Center.y - rawStart.y),
  };
  const c2 = {
    x: end.x + (c2Center.x - rawEnd.x),
    y: end.y + (c2Center.y - rawEnd.y),
  };
  const pathD =
    curveOffset === 0
      ? `M ${start.x} ${start.y} L ${end.x} ${end.y}`
      : `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;

  return {
    rawStart,
    rawEnd,
    start,
    end,
    c1,
    c2,
    curveOffsetRaw,
    curveOffset,
    centerLen,
    normalX,
    normalY,
    pathD,
    labelCenter: curveOffset === 0 ? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } : getBezierMidpoint(start, c1, c2, end),
    curveControl: {
      x: (rawStart.x + rawEnd.x) / 2 + normalX * curveOffset * 0.75,
      y: (rawStart.y + rawEnd.y) / 2 + normalY * curveOffset * 0.75,
    },
  };
}
