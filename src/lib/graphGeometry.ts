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

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const denom = abx * abx + aby * aby;
  if (denom === 0) return Math.hypot(apx, apy);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
  const qx = a.x + abx * t;
  const qy = a.y + aby * t;
  return Math.hypot(p.x - qx, p.y - qy);
}

function overlapPenalty(pathA: Point[], pathB: Point[]): number {
  const threshold = 22;
  let score = 0;

  for (const point of pathA) {
    let best = Infinity;
    for (let i = 0; i < pathB.length - 1; i += 1) {
      const distance = pointToSegmentDistance(point, pathB[i], pathB[i + 1]);
      if (distance < best) best = distance;
    }
    if (best < threshold) {
      const diff = threshold - best;
      score += diff * diff;
    }
  }

  return score;
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
  const pairKey = fromId < toId ? `${fromId}::${toId}` : `${toId}::${fromId}`;
  const existingPairCount = completedConnections.filter(connection => {
    const currentPairKey =
      connection.fromId < connection.toId
        ? `${connection.fromId}::${connection.toId}`
        : `${connection.toId}::${connection.fromId}`;
    return currentPairKey === pairKey;
  }).length;

  const existingPaths = completedConnections
    .map(connection => {
      const startNode = getNode(connection.fromId);
      const endNode = getNode(connection.toId);
      if (!startNode || !endNode) return null;
      const rawBend = getConnectionCurveOffsetRaw(connection, startNode, endNode);
      return sampleConnectionCenterPath(
        startNode,
        endNode,
        getRenderedCurveBend(connection.fromId, connection.toId, rawBend),
      );
    })
    .filter((path): path is Point[] => !!path);

  const maxLevel = Math.max(4, Math.ceil(existingPairCount / 2) + 3);
  const candidates: number[] = [0];
  for (let level = 1; level <= maxLevel; level += 1) {
    const magnitude = CONNECTION_CURVE_BASE + (level - 1) * CONNECTION_CURVE_STEP;
    candidates.push(magnitude, -magnitude);
  }

  let bestBend = 0;
  let bestScore = Infinity;

  for (const rawBend of candidates) {
    const renderedBend = getRenderedCurveBend(fromId, toId, rawBend);
    const testPath = sampleConnectionCenterPath(from, to, renderedBend);

    let score = 0;
    for (const path of existingPaths) {
      score += overlapPenalty(testPath, path);
      score += overlapPenalty(path, testPath) * 0.5;
    }

    if (existingPairCount > 0 && rawBend === 0) score += 9999;
    if (existingPairCount === 0 && rawBend !== 0) score += 40;
    score += Math.abs(rawBend) * 0.35;

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
