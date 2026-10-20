import type { BuildingConfig, BusRoute, Vehicle } from './types';

export type { BusRoute };

export type PendingBusRouteEdit = { stationKey: string; routeId: string };

const NAME_MAX = 48;

export function makeBusRouteId(): string {
  return `br-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanStops(stops: unknown): string[] {
  if (!Array.isArray(stops)) return [];
  return stops.filter((s): s is string => typeof s === 'string' && s.length > 0);
}

function sameStops(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Routes stored on a station. A legacy single `busRoute` becomes Route 1
 * with a stable id so repeated normalizes do not mint a new route.
 */
export function busRoutesOf(cfg: BuildingConfig): BusRoute[] {
  const raw = Array.isArray(cfg.busRoutes) ? cfg.busRoutes : [];
  const cleaned: BusRoute[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r || typeof r !== 'object') continue;
    const anchor = cfg.anchorKey || 'station';
    let id =
      typeof r.id === 'string' && r.id.trim()
        ? r.id.trim()
        : `br-fix-${anchor}-${i}`;
    if (seen.has(id)) id = `br-fix-${anchor}-${i}-${seen.size}`;
    seen.add(id);
    const fallback = `Route ${cleaned.length + 1}`;
    const name =
      typeof r.name === 'string' && r.name.trim()
        ? r.name.trim().slice(0, NAME_MAX)
        : fallback;
    cleaned.push({ id, name, stops: cleanStops(r.stops) });
  }
  if (cleaned.length === 0) {
    const legacy = cleanStops(cfg.busRoute);
    if (legacy.length > 0) {
      cleaned.push({
        id: `br-legacy-${cfg.anchorKey || 'station'}`,
        name: 'Route 1',
        stops: legacy,
      });
    }
  }
  return cleaned;
}

export function withBusRoutes(cfg: BuildingConfig, routes: BusRoute[]): BuildingConfig {
  const cleaned = routes.map((r, i) => ({
    id: r.id,
    name: (r.name || `Route ${i + 1}`).trim().slice(0, NAME_MAX) || `Route ${i + 1}`,
    stops: [...r.stops],
  }));
  return {
    ...cfg,
    busFleetIds: cfg.busFleetIds ?? [],
    busRoutes: cleaned,
    busRoute: cleaned[0] ? [...cleaned[0].stops] : [],
  };
}

export function findBusRoute(cfg: BuildingConfig, routeId: string): BusRoute | undefined {
  return busRoutesOf(cfg).find(r => r.id === routeId);
}

export function addBusRoute(cfg: BuildingConfig, name?: string): { cfg: BuildingConfig; route: BusRoute } {
  const routes = busRoutesOf(cfg);
  const route: BusRoute = {
    id: makeBusRouteId(),
    name: (name || `Route ${routes.length + 1}`).trim().slice(0, NAME_MAX) || `Route ${routes.length + 1}`,
    stops: [],
  };
  return { cfg: withBusRoutes(cfg, [...routes, route]), route };
}

export function renameBusRoute(cfg: BuildingConfig, routeId: string, name: string): BuildingConfig {
  const trimmed = name.trim().slice(0, NAME_MAX);
  const routes = busRoutesOf(cfg).map(r =>
    r.id === routeId ? { ...r, name: trimmed || r.name } : r,
  );
  return withBusRoutes(cfg, routes);
}

export function appendBusRouteStop(cfg: BuildingConfig, routeId: string, stopKey: string): BuildingConfig {
  const routes = busRoutesOf(cfg);
  const next = routes.map(r => {
    if (r.id !== routeId) return r;
    if (r.stops[r.stops.length - 1] === stopKey) return r;
    return { ...r, stops: [...r.stops, stopKey] };
  });
  return withBusRoutes(cfg, next);
}

export function removeBusRouteStopAt(cfg: BuildingConfig, routeId: string, index: number): BuildingConfig {
  const routes = busRoutesOf(cfg).map(r =>
    r.id === routeId ? { ...r, stops: r.stops.filter((_, i) => i !== index) } : r,
  );
  return withBusRoutes(cfg, routes);
}

export function deleteBusRoute(cfg: BuildingConfig, routeId: string): BuildingConfig {
  return withBusRoutes(
    cfg,
    busRoutesOf(cfg).filter(r => r.id !== routeId),
  );
}

/** Route id already stored, or the single route whose stops match the bus. */
export function resolveBusRouteId(bus: Vehicle, routes: BusRoute[]): string | null {
  if (bus.busRouteId && routes.some(r => r.id === bus.busRouteId)) return bus.busRouteId;
  const stops = bus.busRoute || [];
  if (stops.length === 0) return null;
  const matches = routes.filter(r => sameStops(r.stops, stops));
  return matches.length === 1 ? matches[0].id : null;
}

/** Remember route ids for fleet buses that already drive a matching stop list. */
export function stampRouteIds(
  vehicles: Record<string, Vehicle>,
  fleetIds: string[],
  routes: BusRoute[],
  stationKey: string,
): Record<string, Vehicle> {
  let changed = false;
  const next: Record<string, Vehicle> = { ...vehicles };
  for (const id of fleetIds) {
    const v = next[id];
    if (!v || v.type !== 'bus') continue;
    const resolved = resolveBusRouteId(v, routes);
    if (!resolved || resolved === v.busRouteId) continue;
    next[id] = { ...v, busRouteId: resolved, busStationKey: v.busStationKey || stationKey };
    changed = true;
  }
  return changed ? next : vehicles;
}

/** Copy a route onto a bus without starting it. */
export function assignBusToRoute(bus: Vehicle, route: BusRoute, stationKey: string): Vehicle {
  const next: Vehicle = {
    ...bus,
    busStationKey: stationKey,
    busRouteId: route.id,
    busRoute: [...route.stops],
    busRouteIndex: 0,
    busRouteLoops: 0,
    destination: null,
    isMoving: false,
  };
  delete next.busPhase;
  delete next.busStopUntil;
  delete next.busRefuelTicks;
  delete next.busRefuelAccumMs;
  return next;
}

/** Drop a bus's route assignment. The station link is left as-is. */
export function clearVehicleRoute(bus: Vehicle): Vehicle {
  const next: Vehicle = { ...bus, destination: null, isMoving: false };
  delete next.busRouteId;
  delete next.busRoute;
  delete next.busRouteIndex;
  delete next.busRouteLoops;
  delete next.busPhase;
  delete next.busStopUntil;
  delete next.busRefuelTicks;
  delete next.busRefuelAccumMs;
  return next;
}

/**
 * Push a route's current stops onto buses assigned to it.
 * Idle buses keep the copy and stay parked. Buses already on the route
 * follow the updated list. An empty list takes them off the road.
 */
export function syncAssignedBuses(
  vehicles: Record<string, Vehicle>,
  stationKey: string,
  routeId: string,
  stops: string[],
): Record<string, Vehicle> {
  let changed = false;
  const next: Record<string, Vehicle> = { ...vehicles };
  for (const [id, v] of Object.entries(vehicles)) {
    if (v.type !== 'bus' || v.busRouteId !== routeId) continue;
    if (v.busStationKey && v.busStationKey !== stationKey) continue;
    const prev = v.busRoute || [];
    if (stops.length === 0) {
      if (prev.length === 0 && !v.busPhase && !v.isMoving) continue;
      const cleared = clearVehicleRoute(v);
      next[id] = { ...cleared, busRouteId: routeId, busRoute: [], busStationKey: v.busStationKey };
      changed = true;
      continue;
    }
    const idx = Math.min(v.busRouteIndex ?? 0, stops.length - 1);
    const same = sameStops(prev, stops) && (v.busRouteIndex ?? 0) === idx;
    if (same) continue;
    const running = v.busPhase === 'route' || v.busPhase === 'boarding';
    const [x, y] = (stops[idx] || stops[0]).split(',').map(Number);
    const dest = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    next[id] = {
      ...v,
      busRoute: [...stops],
      busRouteIndex: idx,
      ...(running && v.busPhase === 'route' && dest
        ? { destination: dest, isMoving: true }
        : {}),
    };
    changed = true;
  }
  return changed ? next : vehicles;
}

/** Stop buses that were assigned to a route that no longer exists. */
export function releaseBusesFromRoute(
  vehicles: Record<string, Vehicle>,
  routeId: string,
): Record<string, Vehicle> {
  let changed = false;
  const next: Record<string, Vehicle> = { ...vehicles };
  for (const [id, v] of Object.entries(vehicles)) {
    if (v.busRouteId !== routeId) continue;
    const stationKey = v.busStationKey;
    next[id] = { ...clearVehicleRoute(v), busStationKey: stationKey };
    changed = true;
  }
  return changed ? next : vehicles;
}
