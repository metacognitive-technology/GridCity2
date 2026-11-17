/**
 * In-game task criteria. Pure: the server checker and the task form both use it.
 *
 * House tiles are NEIGHBORHOOD_HOME_TILES, the ids planNeighborhood places.
 * Bus routes are economy.buildings[anchorKey].busRoutes ({id, stops: "x,y"[]}),
 * with legacy economy.buildings[anchorKey].busRoute as a fallback.
 * A bus counts for a route when worlds.vehicles[*].busRouteId equals that route id
 * (Vehicle.busRouteId, the station route id). Population is economy.people.
 */
import { NEIGHBORHOOD_HOME_TILES } from '../botActions';
import { oppositePort, PORT_DELTA, worldPorts } from './roadPorts';

export type Region = { minX: number; minY: number; maxX: number; maxY: number };
export type Cell = { x: number; y: number };

export type TileCountCriteria = { type: 'tile_count'; tiles: string[]; min: number; region?: Region };
export type HomesCriteria = { type: 'homes_in_region'; min: number; region: Region };
export type RoadCriteria = { type: 'road_connected'; from: Cell; to: Cell };
export type BusCriteria = { type: 'bus_line_serves'; stops: Cell[]; minBuses?: number };
export type CountMetric = 'buildings' | 'homes' | 'population' | 'buses';
export type CountCriteria = { type: 'count'; metric: CountMetric; min: number; region?: Region };
export type AllCriteria = { type: 'all'; of: Criteria[] };
export type AnyCriteria = { type: 'any'; of: Criteria[] };

export type Criteria =
  | TileCountCriteria
  | HomesCriteria
  | RoadCriteria
  | BusCriteria
  | CountCriteria
  | AllCriteria
  | AnyCriteria;

export type CheckResult = {
  met: boolean;
  progress: number;
  detail: string;
  checkedAt?: number;
};

export type GridTileLike = { type?: string; rotation?: number; part?: string };
export type CriteriaGrid = Record<string, GridTileLike[] | null | undefined>;

export type BusRouteLike = { id?: string; stops?: unknown; name?: string };
export type BuildingLike = {
  busRoutes?: BusRouteLike[];
  busRoute?: unknown;
  busFleetIds?: unknown;
  anchorKey?: string;
};
export type PersonLike = { homeKey?: string; location?: unknown };
export type VehicleLike = {
  type?: string;
  busRouteId?: string;
  busStationKey?: string;
  busRoute?: unknown;
  x?: number;
  y?: number;
};

export type CriteriaWorld = {
  grid: CriteriaGrid;
  economy: {
    buildings?: Record<string, BuildingLike>;
    people?: Record<string, PersonLike>;
  };
  vehicles: Record<string, VehicleLike>;
};

const REGION_CAP = 200;
const BFS_CAP = REGION_CAP * REGION_CAP;
const MAX_DEPTH = 6;

const emptyWorld = (): CriteriaWorld => ({ grid: {}, economy: {}, vehicles: {} });

export function criteriaTemplate(type: string): Criteria {
  if (type === 'tile_count') {
    return { type: 'tile_count', tiles: ['building-home'], min: 1, region: { minX: 0, minY: 0, maxX: 10, maxY: 10 } };
  }
  if (type === 'road_connected') {
    return { type: 'road_connected', from: { x: 0, y: 0 }, to: { x: 2, y: 0 } };
  }
  if (type === 'bus_line_serves') {
    return { type: 'bus_line_serves', stops: [{ x: 0, y: 0 }, { x: 2, y: 0 }], minBuses: 1 };
  }
  if (type === 'count') {
    return { type: 'count', metric: 'population', min: 10 };
  }
  return { type: 'homes_in_region', min: 3, region: { minX: 0, minY: 0, maxX: 10, maxY: 10 } };
}

export function parseCriteria(raw: unknown, depth = 0): { ok: true; value: Criteria } | { ok: false; error: string } {
  if (depth > MAX_DEPTH) return { ok: false, error: 'invalid criteria' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'invalid criteria' };
  const body = raw as Record<string, unknown>;
  const type = body.type;
  if (type === 'tile_count') {
    if (!Array.isArray(body.tiles) || body.tiles.length === 0 || body.tiles.length > 40) {
      return { ok: false, error: 'invalid criteria' };
    }
    const tiles: string[] = [];
    for (const tile of body.tiles) {
      if (typeof tile !== 'string' || !tile.trim() || tile.length > 80) return { ok: false, error: 'invalid criteria' };
      tiles.push(tile.trim());
    }
    const min = readMin(body.min);
    if (min == null) return { ok: false, error: 'invalid criteria' };
    const region = readRegion(body.region, false);
    if (region === 'bad') return { ok: false, error: 'invalid criteria' };
    return { ok: true, value: region ? { type, tiles, min, region } : { type, tiles, min } };
  }
  if (type === 'homes_in_region') {
    const min = readMin(body.min);
    const region = readRegion(body.region, true);
    if (min == null || region === 'bad' || region == null) return { ok: false, error: 'invalid criteria' };
    return { ok: true, value: { type, min, region } };
  }
  if (type === 'road_connected') {
    const from = readCell(body.from);
    const to = readCell(body.to);
    if (!from || !to) return { ok: false, error: 'invalid criteria' };
    return { ok: true, value: { type, from, to } };
  }
  if (type === 'bus_line_serves') {
    if (!Array.isArray(body.stops) || body.stops.length === 0 || body.stops.length > 40) {
      return { ok: false, error: 'invalid criteria' };
    }
    const stops: Cell[] = [];
    for (const stop of body.stops) {
      const cell = readCell(stop);
      if (!cell) return { ok: false, error: 'invalid criteria' };
      stops.push(cell);
    }
    let minBuses: number | undefined;
    if (body.minBuses != null && body.minBuses !== '') {
      const parsed = readMin(body.minBuses);
      if (parsed == null) return { ok: false, error: 'invalid criteria' };
      minBuses = parsed;
    }
    return { ok: true, value: minBuses == null ? { type, stops } : { type, stops, minBuses } };
  }
  if (type === 'count') {
    if (body.metric !== 'buildings' && body.metric !== 'homes' && body.metric !== 'population' && body.metric !== 'buses') {
      return { ok: false, error: 'invalid criteria' };
    }
    const min = readMin(body.min);
    if (min == null) return { ok: false, error: 'invalid criteria' };
    const region = readRegion(body.region, false);
    if (region === 'bad') return { ok: false, error: 'invalid criteria' };
    return { ok: true, value: region ? { type, metric: body.metric, min, region } : { type, metric: body.metric, min } };
  }
  if (type === 'all' || type === 'any') {
    if (!Array.isArray(body.of) || body.of.length === 0 || body.of.length > 12) {
      return { ok: false, error: 'invalid criteria' };
    }
    const of: Criteria[] = [];
    for (const child of body.of) {
      const parsed = parseCriteria(child, depth + 1);
      if (!parsed.ok) return parsed;
      of.push(parsed.value);
    }
    return { ok: true, value: { type, of } };
  }
  return { ok: false, error: 'invalid criteria' };
}

export function evaluateCriteria(raw: unknown, world: CriteriaWorld = emptyWorld()): CheckResult {
  const parsed = parseCriteria(raw);
  if (!parsed.ok) return { met: false, progress: 0, detail: 'invalid criteria' };
  return evaluateNode(parsed.value, world);
}

/** Absolute measured value of the first count criterion, for manual goals. */
export function countMetricValue(raw: unknown, world: CriteriaWorld): number | null {
  const parsed = parseCriteria(raw);
  if (!parsed.ok) return null;
  return firstCount(parsed.value, world);
}

function evaluateNode(node: Criteria, world: CriteriaWorld): CheckResult {
  if (node.type === 'tile_count') {
    const have = countTiles(world.grid, node.tiles, node.region);
    return ratioResult(have, node.min, 'tiles');
  }
  if (node.type === 'homes_in_region') {
    const have = countTiles(world.grid, [...NEIGHBORHOOD_HOME_TILES], node.region);
    return ratioResult(have, node.min, 'homes');
  }
  if (node.type === 'road_connected') {
    const met = roadsConnect(world.grid, node.from, node.to);
    return { met, progress: met ? 1 : 0, detail: met ? 'connected' : 'not connected' };
  }
  if (node.type === 'bus_line_serves') {
    return evaluateBus(world, node);
  }
  if (node.type === 'count') {
    const have = measureCount(world, node.metric, node.region);
    const label = node.metric === 'population' ? 'population' : node.metric;
    return ratioResult(have, node.min, label);
  }
  const children = node.of.map((child) => evaluateNode(child, world));
  if (node.type === 'all') {
    const met = children.every((child) => child.met);
    const progress = children.length
      ? clamp01(children.reduce((sum, child) => sum + child.progress, 0) / children.length)
      : 1;
    const detail = (met ? children : children.filter((child) => !child.met)).map((child) => child.detail).join('; ')
      || (met ? 'all met' : 'not met');
    return { met, progress, detail: detail.slice(0, 240) };
  }
  const met = children.some((child) => child.met);
  const progress = children.reduce((best, child) => Math.max(best, child.progress), 0);
  const winner = children.find((child) => child.met) || children[0];
  return { met, progress: clamp01(progress), detail: (winner?.detail || 'not met').slice(0, 240) };
}

function firstCount(node: Criteria, world: CriteriaWorld): number | null {
  if (node.type === 'count') return measureCount(world, node.metric, node.region);
  if (node.type === 'all' || node.type === 'any') {
    for (const child of node.of) {
      const value = firstCount(child, world);
      if (value != null) return value;
    }
  }
  return null;
}

function ratioResult(have: number, min: number, label: string): CheckResult {
  const met = have >= min;
  const progress = min <= 0 ? 1 : clamp01(have / min);
  return { met, progress, detail: `${have} / ${min} ${label}` };
}

function countTiles(grid: CriteriaGrid, patterns: string[], region?: Region): number {
  let count = 0;
  forEachCell(grid, region, (tiles) => {
    for (const tile of anchors(tiles)) {
      if (tileMatches(tile.type || '', patterns)) count += 1;
    }
  });
  return count;
}

function measureCount(world: CriteriaWorld, metric: CountMetric, region?: Region): number {
  if (metric === 'buildings') return countTiles(world.grid, ['building-*'], region);
  if (metric === 'homes') return countTiles(world.grid, [...NEIGHBORHOOD_HOME_TILES], region);
  if (metric === 'buses') return countBuses(world.vehicles, region);
  return countPeople(world.economy.people || {}, region);
}

function evaluateBus(world: CriteriaWorld, node: BusCriteria): CheckResult {
  const needStops = node.stops.map((stop) => `${stop.x},${stop.y}`);
  const minBuses = node.minBuses == null ? 1 : node.minBuses;
  let bestBuses = 0;
  let covered = false;
  for (const route of busRoutes(world)) {
    const stopSet = new Set(route.stops.map(normalizeStopKey).filter(Boolean));
    if (!needStops.every((key) => stopSet.has(key))) continue;
    covered = true;
    const buses = busesOnRoute(world, route);
    if (buses > bestBuses) bestBuses = buses;
  }
  if (!covered) {
    return { met: false, progress: 0, detail: `0 / ${needStops.length} stops` };
  }
  const met = bestBuses >= minBuses;
  const progress = minBuses <= 0 ? 1 : clamp01(bestBuses / minBuses);
  return { met, progress, detail: `${bestBuses} / ${minBuses} buses` };
}

type FoundRoute = { id: string; anchor: string; stops: string[] };

function busRoutes(world: CriteriaWorld): FoundRoute[] {
  const routes: FoundRoute[] = [];
  const buildings = world.economy.buildings || {};
  for (const [anchor, cfg] of Object.entries(buildings)) {
    if (!cfg || typeof cfg !== 'object') continue;
    if (Array.isArray(cfg.busRoutes) && cfg.busRoutes.length) {
      for (const route of cfg.busRoutes) {
        if (!route || typeof route.id !== 'string' || !route.id) continue;
        routes.push({ id: route.id, anchor, stops: stopList(route.stops) });
      }
      continue;
    }
    const legacy = stopList(cfg.busRoute);
    if (legacy.length) routes.push({ id: `legacy:${anchor}`, anchor, stops: legacy });
  }
  return routes;
}

function busesOnRoute(world: CriteriaWorld, route: FoundRoute): number {
  let count = 0;
  for (const vehicle of Object.values(world.vehicles || {})) {
    if (!vehicle || vehicle.type !== 'bus') continue;
    if (vehicle.busRouteId && vehicle.busRouteId === route.id) {
      count += 1;
      continue;
    }
    if (!vehicle.busRouteId && route.id.startsWith('legacy:') && vehicle.busStationKey === route.anchor) {
      const stops = stopList(vehicle.busRoute);
      if (route.stops.every((stop) => stops.includes(stop))) count += 1;
    }
  }
  return count;
}

function roadsConnect(grid: CriteriaGrid, from: Cell, to: Cell): boolean {
  const startKey = `${from.x},${from.y}`;
  if (!roadTile(grid[startKey])) return false;
  const goalKey = `${to.x},${to.y}`;
  if (startKey === goalKey) return true;
  const seen = new Set<string>([startKey]);
  const queue: Cell[] = [{ x: from.x, y: from.y }];
  let guard = 0;
  while (queue.length && guard < BFS_CAP) {
    guard += 1;
    const cur = queue.shift()!;
    const tile = roadTile(grid[`${cur.x},${cur.y}`]);
    if (!tile) continue;
    const ports = worldPorts(tile.type || '', tile.rotation || 0);
    for (const port of ports) {
      const step = PORT_DELTA[port];
      if (!step) continue;
      const nx = cur.x + step.x;
      const ny = cur.y + step.y;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      const next = roadTile(grid[key]);
      if (!next) continue;
      const nextPorts = worldPorts(next.type || '', next.rotation || 0);
      if (!nextPorts.includes(oppositePort(port))) continue;
      if (key === goalKey) return true;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

function roadTile(tiles: GridTileLike[] | null | undefined): GridTileLike | null {
  if (!Array.isArray(tiles)) return null;
  const roads = tiles.filter((tile) => {
    return !!tile && typeof tile.type === 'string' && tile.type.startsWith('road-') && tile.part !== 'member';
  });
  if (!roads.length) return null;
  return roads.find((tile) => !String(tile.type).includes('bridge')) || roads[0];
}

function anchors(tiles: GridTileLike[] | null | undefined): GridTileLike[] {
  if (!Array.isArray(tiles)) return [];
  return tiles.filter((tile) => !!tile && typeof tile.type === 'string' && tile.part !== 'member');
}

function tileMatches(type: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

function forEachCell(
  grid: CriteriaGrid,
  region: Region | undefined,
  visit: (tiles: GridTileLike[] | null | undefined) => void,
) {
  if (!region) {
    for (const tiles of Object.values(grid)) visit(tiles);
    return;
  }
  const minX = Math.trunc(region.minX);
  const minY = Math.trunc(region.minY);
  const maxX = Math.min(Math.trunc(region.maxX), minX + REGION_CAP - 1);
  const maxY = Math.min(Math.trunc(region.maxY), minY + REGION_CAP - 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) visit(grid[`${x},${y}`]);
  }
}

function countPeople(people: Record<string, PersonLike>, region?: Region): number {
  const list = Object.values(people || {});
  if (!region) return list.length;
  let count = 0;
  for (const person of list) {
    const cell = personCell(person);
    if (cell && inRegion(cell, region)) count += 1;
  }
  return count;
}

function countBuses(vehicles: Record<string, VehicleLike>, region?: Region): number {
  let count = 0;
  for (const vehicle of Object.values(vehicles || {})) {
    if (!vehicle || vehicle.type !== 'bus') continue;
    if (!region) {
      count += 1;
      continue;
    }
    if (typeof vehicle.x !== 'number' || typeof vehicle.y !== 'number') continue;
    if (inRegion({ x: Math.floor(vehicle.x), y: Math.floor(vehicle.y) }, region)) count += 1;
  }
  return count;
}

function personCell(person: PersonLike | undefined): Cell | null {
  if (!person) return null;
  const loc = person.location as { kind?: string; x?: number; y?: number; homeKey?: string; buildingKey?: string; atKey?: string } | undefined;
  if (loc && typeof loc === 'object') {
    if ((loc.kind === 'tile' || loc.kind === 'walking') && typeof loc.x === 'number' && typeof loc.y === 'number') {
      return { x: Math.floor(loc.x), y: Math.floor(loc.y) };
    }
    if (loc.kind === 'home') return keyCell(loc.homeKey);
    if (loc.kind === 'building') return keyCell(loc.buildingKey);
    if (loc.kind === 'outdoor') return keyCell(loc.atKey);
  }
  return keyCell(person.homeKey);
}

function keyCell(key: unknown): Cell | null {
  if (typeof key !== 'string') return null;
  const [xs, ys] = key.split(',');
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

function inRegion(cell: Cell, region: Region): boolean {
  return cell.x >= region.minX && cell.x <= region.maxX && cell.y >= region.minY && cell.y <= region.maxY;
}

function stopList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((stop) => (typeof stop === 'string' ? stop : '')).filter(Boolean);
}

function normalizeStopKey(raw: string): string {
  const [xs, ys] = raw.split(',');
  const x = Number(String(xs).trim());
  const y = Number(String(ys).trim());
  if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
  return `${Math.trunc(x)},${Math.trunc(y)}`;
}

function readMin(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
  return raw;
}

function readCell(raw: unknown): Cell | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as { x?: unknown; y?: unknown };
  if (typeof body.x !== 'number' || typeof body.y !== 'number') return null;
  if (!Number.isFinite(body.x) || !Number.isFinite(body.y)) return null;
  return { x: Math.trunc(body.x), y: Math.trunc(body.y) };
}

function readRegion(raw: unknown, required: boolean): Region | null | 'bad' {
  if (raw == null || raw === '') return required ? 'bad' : null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'bad';
  const body = raw as Record<string, unknown>;
  const minX = finite(body.minX);
  const minY = finite(body.minY);
  const maxX = finite(body.maxX);
  const maxY = finite(body.maxY);
  if (minX == null || minY == null || maxX == null || maxY == null) return 'bad';
  if (minX > maxX || minY > maxY) return 'bad';
  return { minX, minY, maxX, maxY };
}

function finite(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.trunc(raw);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 10000) / 10000));
}
