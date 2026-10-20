import type { GridData, GridTile, Point } from './types';

const MAX_ROUTE_CELLS = 6000;

function parseStop(key: string): Point | null {
  const [x, y] = key.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function isRoadCell(tiles: GridTile[] | undefined): boolean {
  if (!tiles?.length) return false;
  return tiles.some(t => t.type.startsWith('road') || t.type === 'rail-road-crossing');
}

/**
 * Shortest road walk from one stop to the next.
 * When the stops are not connected by road, the segment is the straight pair
 * so the order is still visible.
 */
export function traceRoadLeg(grid: GridData, from: Point, to: Point): Point[] {
  if (from.x === to.x && from.y === to.y) return [from];
  const startKey = `${from.x},${from.y}`;
  const goalKey = `${to.x},${to.y}`;
  const prev = new Map<string, string>();
  const seen = new Set<string>([startKey]);
  const queue: Point[] = [from];
  let found = false;
  let expanded = 0;
  while (queue.length > 0 && expanded < MAX_ROUTE_CELLS) {
    const cur = queue.shift()!;
    expanded += 1;
    const curKey = `${cur.x},${cur.y}`;
    if (curKey === goalKey) {
      found = true;
      break;
    }
    const neighbors: Point[] = [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ];
    for (const next of neighbors) {
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      const onGoal = key === goalKey;
      if (!onGoal && !isRoadCell(grid[key])) continue;
      seen.add(key);
      prev.set(key, curKey);
      queue.push(next);
    }
  }
  if (!found) return [from, to];
  const path: Point[] = [];
  let key: string | undefined = goalKey;
  while (key) {
    const [x, y] = key.split(',').map(Number);
    path.push({ x, y });
    key = prev.get(key);
  }
  path.reverse();
  return path;
}

/**
 * Cell centers of the selected route, in stop order.
 * A route with two or more stops is closed back to the first stop,
 * matching the loop a bus drives.
 */
export function traceBusRouteCells(grid: GridData, stopKeys: string[]): Point[] {
  const stops: Point[] = [];
  for (const key of stopKeys) {
    const p = parseStop(key);
    if (p) stops.push(p);
  }
  if (stops.length === 0) return [];
  if (stops.length === 1) return [stops[0]];
  const last = stops[stops.length - 1];
  const first = stops[0];
  const seq =
    last.x === first.x && last.y === first.y ? stops : [...stops, first];
  const cells: Point[] = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const leg = traceRoadLeg(grid, seq[i], seq[i + 1]);
    if (cells.length > 0 && leg.length > 0) leg.shift();
    cells.push(...leg);
  }
  return cells;
}
