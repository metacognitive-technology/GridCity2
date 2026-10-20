import { expect, test } from '@playwright/test';
import type { BuildingConfig, GridData, GridTile, Vehicle } from '../src/types';
import { traceBusRouteCells, traceRoadLeg } from '../src/busRouteOverlay';
import {
  addBusRoute,
  appendBusRouteStop,
  assignBusToRoute,
  busRoutesOf,
  deleteBusRoute,
  releaseBusesFromRoute,
  resolveBusRouteId,
  stampRouteIds,
  syncAssignedBuses,
  withBusRoutes,
} from '../src/busRoutes';

function station(partial: Partial<BuildingConfig> = {}): BuildingConfig {
  return {
    anchorKey: '10,10',
    role: 'bus-station',
    inventory: {},
    busFleetIds: [],
    ...partial,
  };
}

function bus(partial: Partial<Vehicle> & { id: string }): Vehicle {
  return {
    x: 0,
    y: 0,
    heading: 0,
    lane: 1,
    progress: 0,
    color: '#2563eb',
    zIndex: 0,
    type: 'bus',
    busStationKey: '10,10',
    ...partial,
  };
}

function roadGrid(keys: string[]): GridData {
  const grid: GridData = {};
  for (const key of keys) {
    const tile: GridTile = { type: 'road-straight', rotation: 0 };
    grid[key] = [tile];
  }
  return grid;
}

test('route overlay follows roads between stops and closes the loop', () => {
  const grid = roadGrid(['0,0', '1,0', '2,0', '2,1', '2,2', '1,2', '0,2', '0,1']);
  const cells = traceBusRouteCells(grid, ['0,0', '2,0', '2,2']);
  const keys = cells.map(p => `${p.x},${p.y}`);
  expect(keys[0]).toBe('0,0');
  expect(keys).toContain('1,0');
  expect(keys).toContain('2,0');
  expect(keys).toContain('2,1');
  expect(keys).toContain('2,2');
  expect(keys[keys.length - 1]).toBe('0,0');
  expect(keys.filter(k => k === '5,5')).toEqual([]);
});

test('route overlay draws a direct segment when stops are not on a connected road', () => {
  const grid = roadGrid(['0,0', '4,4']);
  expect(traceRoadLeg(grid, { x: 0, y: 0 }, { x: 4, y: 4 })).toEqual([
    { x: 0, y: 0 },
    { x: 4, y: 4 },
  ]);
  expect(traceBusRouteCells(grid, ['3,1'])).toEqual([{ x: 3, y: 1 }]);
});

test('legacy single route becomes a stable Route 1', () => {
  const cfg = station({ busRoute: ['1,1', '2,2'] });
  const first = busRoutesOf(cfg);
  const second = busRoutesOf(cfg);
  expect(first).toHaveLength(1);
  expect(first[0].id).toBe('br-legacy-10,10');
  expect(first[0].name).toBe('Route 1');
  expect(first[0].stops).toEqual(['1,1', '2,2']);
  expect(second[0].id).toBe(first[0].id);
});

test('a station keeps several routes and each bus takes one', () => {
  let cfg = station();
  const a = addBusRoute(cfg, 'Downtown');
  cfg = appendBusRouteStop(a.cfg, a.route.id, '3,1');
  cfg = appendBusRouteStop(cfg, a.route.id, '5,1');
  const b = addBusRoute(cfg, 'Uptown');
  cfg = appendBusRouteStop(b.cfg, b.route.id, '8,1');

  const routes = busRoutesOf(cfg);
  expect(routes.map(r => r.name)).toEqual(['Downtown', 'Uptown']);
  expect(routes[0].stops).toEqual(['3,1', '5,1']);
  expect(routes[1].stops).toEqual(['8,1']);
  // First route stays mirrored for older readers.
  expect(cfg.busRoute).toEqual(['3,1', '5,1']);

  const downtown = routes[0];
  const uptown = routes[1];
  const vehicles: Record<string, Vehicle> = {
    north: assignBusToRoute(bus({ id: 'north' }), downtown, '10,10'),
    south: assignBusToRoute(bus({ id: 'south' }), uptown, '10,10'),
  };
  expect(resolveBusRouteId(vehicles.north, routes)).toBe(downtown.id);
  expect(resolveBusRouteId(vehicles.south, routes)).toBe(uptown.id);
  expect(vehicles.north.busRoute).toEqual(['3,1', '5,1']);
  expect(vehicles.south.busRoute).toEqual(['8,1']);
  expect(vehicles.north.isMoving).toBe(false);
});

test('editing one route updates only the buses assigned to it', () => {
  const downtown = { id: 'br-a', name: 'Downtown', stops: ['3,1'] };
  const uptown = { id: 'br-b', name: 'Uptown', stops: ['8,1'] };
  const cfg = withBusRoutes(station({ busFleetIds: ['north', 'south'] }), [downtown, uptown]);
  const running = bus({
    id: 'north',
    busRouteId: 'br-a',
    busRoute: ['3,1'],
    busRouteIndex: 0,
    busPhase: 'route',
    isMoving: true,
    destination: { x: 3, y: 1 },
  });
  const other = bus({
    id: 'south',
    busRouteId: 'br-b',
    busRoute: ['8,1'],
    busRouteIndex: 0,
    busPhase: 'route',
    isMoving: true,
    destination: { x: 8, y: 1 },
  });
  const nextCfg = appendBusRouteStop(cfg, 'br-a', '4,1');
  const synced = syncAssignedBuses(
    { north: running, south: other },
    '10,10',
    'br-a',
    busRoutesOf(nextCfg)[0].stops,
  );
  expect(synced.north.busRoute).toEqual(['3,1', '4,1']);
  expect(synced.north.destination).toEqual({ x: 3, y: 1 });
  expect(synced.south.busRoute).toEqual(['8,1']);
  expect(synced.south.destination).toEqual({ x: 8, y: 1 });
});

test('deleting a route clears only that route’s buses', () => {
  const vehicles = releaseBusesFromRoute(
    {
      north: bus({ id: 'north', busRouteId: 'br-a', busRoute: ['3,1'], busPhase: 'route', isMoving: true }),
      south: bus({ id: 'south', busRouteId: 'br-b', busRoute: ['8,1'], busPhase: 'route', isMoving: true }),
    },
    'br-a',
  );
  expect(vehicles.north.busRouteId).toBeUndefined();
  expect(vehicles.north.busRoute).toBeUndefined();
  expect(vehicles.north.busPhase).toBeUndefined();
  expect(vehicles.north.isMoving).toBe(false);
  expect(vehicles.north.busStationKey).toBe('10,10');
  expect(vehicles.south.busRouteId).toBe('br-b');
  expect(vehicles.south.isMoving).toBe(true);
});

test('a bus with a matching stop list picks up the legacy route id', () => {
  const routes = busRoutesOf(station({ busRoute: ['5,5', '6,5'] }));
  const stamped = stampRouteIds(
    {
      old: bus({ id: 'old', busRoute: ['5,5', '6,5'], busRouteIndex: 1 }),
    },
    ['old'],
    routes,
    '10,10',
  );
  expect(stamped.old.busRouteId).toBe('br-legacy-10,10');
  expect(stamped.old.busRouteIndex).toBe(1);
  const gone = deleteBusRoute(station({ busRoutes: routes, busRoute: ['5,5', '6,5'] }), routes[0].id);
  expect(busRoutesOf(gone)).toEqual([]);
  expect(gone.busRoute).toEqual([]);
});
