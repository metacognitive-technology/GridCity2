import { getTrajectory } from './vehicleTrajectory';
import { driveExitPorts, getGroundRoadTile, getOneWayTravel, isRoundabout4Way, TILE_CONNECTIONS, type SignalContext } from './traffic';
import { GridData, GridTile, Point, Vehicle } from './types';

/** Visual body sizes — keep in sync with Vehicle.tsx rendering. */
export const VEHICLE_DIMS = {
  car: { width: 9.6, length: 20 },
  semi: { width: 9.6, length: 10 },
  train: { width: 14.4, length: 40 },
  trailer: { width: 9.6, length: 40 },
  railcar: { width: 14.4, length: 48 },
} as const;

export const TRAILER_OFFSET_BASE = 7;
export const TRAILER_OFFSET_SPACING = 42;
export const TRAILER_LENGTH = 40;

export const RAILCAR_OFFSET_BASE = 25;
export const RAILCAR_OFFSET_SPACING = 50;
export const RAILCAR_LENGTH = 48;

export const BRIDGE_BODY_SCALE = 1.1;

const RAIL_TILE_CONNECTIONS: Record<string, number[]> = {
  'rail-straight': [0, 2],
  'rail-curve': [0, 3],
  'rail-t': [0, 2, 3],
  'rail-cross': [0, 1, 2, 3],
  'rail-end': [2],
  'rail-trestle': [0, 2],
  'rail-road-crossing': [0, 1, 2, 3],
};

const ALL_TILE_CONNECTIONS: Record<string, number[]> = {
  ...TILE_CONNECTIONS,
  ...RAIL_TILE_CONNECTIONS,
};

export interface VehicleCollisionBody {
  cx: number;
  cy: number;
  halfWidth: number;
  halfLength: number;
  rotationDeg: number;
}

type RouteExitFn = (
  cx: number,
  cy: number,
  entryHeading: number,
  dest: Point,
  vType: string,
  grid: GridData,
) => number | null;

let recommendExit: RouteExitFn | null = null;

/** App owns the BFS router. Bind it so pose and collision use the same exit. */
export function bindRouteExit(fn: RouteExitFn): void {
  recommendExit = fn;
}

function isDriveBay(tile: GridTile | undefined | null): boolean {
  if (!tile) return false;
  if (tile.type === 'building-taxi-station' || tile.type === 'building-bus-station') {
    return (tile.localY ?? 0) >= 1;
  }
  if (tile.type === 'building-repair-shop') return (tile.localY ?? 0) >= 3;
  if (tile.type === 'building-hospital') return (tile.localY ?? 0) >= 2;
  return false;
}

/** Tile the vehicle is driving on (ground, or bridge/trestle when elevated). */
export function findVehicleTile(tiles: GridTile[] | undefined, zIndex = 0): GridTile | undefined {
  if (!tiles?.length) return undefined;
  return tiles.find(t => {
    const elevated = t.type.includes('bridge') || t.type.includes('trestle');
    return (zIndex === 1 && elevated) || (zIndex === 0 && !elevated);
  });
}

function stepOf(heading: number): { dx: number; dy: number } {
  const h = ((Math.round(heading / 90) % 4) + 4) % 4;
  if (h === 1) return { dx: 1, dy: 0 };
  if (h === 2) return { dx: 0, dy: 1 };
  if (h === 3) return { dx: -1, dy: 0 };
  return { dx: 0, dy: -1 };
}

function tileAcceptsVehicle(vehicle: Vehicle, tile: GridTile, exitHeading: number): boolean {
  const ty = tile.type;
  const vType = vehicle.type || 'car';
  let ok = false;
  if (vType === 'train') {
    ok = ty.startsWith('rail') || ty === 'rail-road-crossing' || isDriveBay(tile);
  } else if (vType === 'semi') {
    ok = ty.startsWith('road') || ty === 'parking-2x4' || ty === 'parking-4x4' || ty === 'rail-road-crossing' || isDriveBay(tile);
  } else {
    ok =
      ty.startsWith('road') ||
      ty.startsWith('parking-') ||
      ty === 'rail-road-crossing' ||
      isDriveBay(tile) ||
      ty === 'building-home' ||
      ty === 'building-apartment';
  }
  if (!ok) return false;
  const oneWay = getOneWayTravel(tile);
  if (!oneWay) return true;
  const entryPort = (Math.round(exitHeading / 90) + 2) % 4;
  return entryPort === oneWay.enterPort;
}

function canLeaveToward(vehicle: Vehicle, grid: GridData, exitHeading: number): boolean {
  const step = stepOf(exitHeading);
  const tiles = grid[`${vehicle.x + step.dx},${vehicle.y + step.dy}`];
  if (!tiles?.length) return false;
  return tiles.some(t => tileAcceptsVehicle(vehicle, t, exitHeading));
}

/**
 * Exit heading the simulator will take at the end of this tile.
 * Routed vehicles follow the destination, not "straight unless turnIntent".
 * A dead end (cul-de-sac, road that runs out) leaves back through the entry
 * so the turn can be a curve instead of a pivot at the edge.
 */
export function resolveVehicleExit(
  vehicle: Vehicle,
  tile: GridTile,
  grid: GridData,
): number {
  const heading = vehicle.heading;
  const allowUTurn = !vehicle.manualOverride && vehicle.turnAroundAtDeadEnd !== false;
  const isRobotaxi = vehicle.type === 'taxi';
  const onBay = isRobotaxi && isDriveBay(tile);
  const basePorts = onBay ? [0, 1, 2, 3] : (ALL_TILE_CONNECTIONS[tile.type] || []);
  const ports = basePorts.map(p =>
    onBay ? p : (p + (tile.rotation || 0) / 90) % 4,
  );
  const entryPort = (heading / 90 + 2) % 4;
  const oneWayFlow = getOneWayTravel(tile);
  const roundabout = isRoundabout4Way(tile.type);
  let otherPorts = driveExitPorts(
    tile.type,
    ports,
    entryPort,
    oneWayFlow ? oneWayFlow.exitPort : null,
  );

  if (onBay && otherPorts.length > 1) {
    const roadExits = otherPorts.filter(exitPort => {
      const step = stepOf(exitPort * 90);
      const nt = grid[`${vehicle.x + step.dx},${vehicle.y + step.dy}`];
      return !!nt?.some(t => t.type.startsWith('road'));
    });
    if (roadExits.length > 0) otherPorts = roadExits;
  }

  if (tile.type === 'rail-road-crossing') {
    const straightPort = (entryPort + 2) % 4;
    otherPorts = otherPorts.includes(straightPort) ? [straightPort] : [];
  }

  let exitHeading = heading;
  if (otherPorts.length > 0) {
    let exitPort = otherPorts[0];
    if (otherPorts.length > 1) {
      const straightPort = (entryPort + 2) % 4;
      const leftPort = (entryPort + 1) % 4;
      const rightPort = (entryPort + 3) % 4;
      const uTurnPort = entryPort;
      const wantUTurn = roundabout && vehicle.turnIntent === 'uturn' && otherPorts.includes(uTurnPort);
      const dest = !vehicle.manualOverride ? vehicle.destination : null;
      if (dest && recommendExit) {
        const rec = recommendExit(
          vehicle.x,
          vehicle.y,
          heading,
          dest,
          vehicle.type || 'car',
          grid,
        );
        if (rec !== null) exitPort = Math.round(rec / 90) % 4;
        else if (vehicle.turnIntent === 'left' && otherPorts.includes(leftPort)) exitPort = leftPort;
        else if (vehicle.turnIntent === 'right' && otherPorts.includes(rightPort)) exitPort = rightPort;
        else if (wantUTurn) exitPort = uTurnPort;
        else if (otherPorts.includes(straightPort)) exitPort = straightPort;
      } else if (vehicle.turnIntent === 'left' && otherPorts.includes(leftPort)) exitPort = leftPort;
      else if (vehicle.turnIntent === 'right' && otherPorts.includes(rightPort)) exitPort = rightPort;
      else if (wantUTurn) exitPort = uTurnPort;
      else if (otherPorts.includes(straightPort)) exitPort = straightPort;
    }
    exitHeading = ((exitPort % 4) + 4) % 4 * 90;
  } else if (allowUTurn) {
    exitHeading = (heading + 180) % 360;
  }

  if (allowUTurn && !canLeaveToward(vehicle, grid, exitHeading)) {
    const back = (heading + 180) % 360;
    if (back !== exitHeading && canLeaveToward(vehicle, grid, back)) {
      exitHeading = back;
    }
  }

  return exitHeading;
}

/** Tile, grid, and the exit the sim will actually take — one context for signal holds. */
export function signalHoldContext(
  vehicle: Vehicle,
  tile: GridTile | null | undefined,
  grid: GridData,
): SignalContext {
  return {
    tile,
    grid,
    exitHeading: tile ? resolveVehicleExit(vehicle, tile, grid) : vehicle.heading,
  };
}

export function computeExitHeading(vehicle: Vehicle, grid: GridData): number {
  const tiles = grid[`${vehicle.x},${vehicle.y}`];
  const currentTile = findVehicleTile(tiles, vehicle.zIndex) || getGroundRoadTile(tiles, vehicle.zIndex);
  if (!currentTile) return vehicle.heading;
  return resolveVehicleExit(vehicle, currentTile, grid);
}

export function getVehiclePose(
  vehicle: Vehicle,
  grid: GridData
): { posX: number; posY: number; rotation: number } {
  const exitHeading = computeExitHeading(vehicle, grid);
  const tile = findVehicleTile(grid[`${vehicle.x},${vehicle.y}`], vehicle.zIndex);
  const { posX, posY, rotation } = getTrajectory(
    vehicle.x,
    vehicle.y,
    vehicle.heading,
    exitHeading,
    vehicle.lane,
    vehicle.progress,
    tile?.type,
  );
  return { posX, posY, rotation };
}

function travelVector(rotationDeg: number): { fx: number; fy: number } {
  const rad = ((rotationDeg - 90) * Math.PI) / 180;
  return { fx: Math.cos(rad), fy: Math.sin(rad) };
}

function makeBody(
  cx: number,
  cy: number,
  width: number,
  length: number,
  rotationDeg: number,
  zIndex: number
): VehicleCollisionBody {
  const scale = zIndex > 0 ? BRIDGE_BODY_SCALE : 1;
  return {
    cx,
    cy,
    halfWidth: (width / 2) * scale,
    halfLength: (length / 2) * scale,
    rotationDeg,
  };
}

function appendTrailerBodies(
  bodies: VehicleCollisionBody[],
  cx: number,
  cy: number,
  rotationDeg: number,
  zIndex: number,
  trailerCount: number
): void {
  const { fx, fy } = travelVector(rotationDeg);
  for (let i = 0; i < trailerCount; i++) {
    const centerOffset = TRAILER_OFFSET_BASE + i * TRAILER_OFFSET_SPACING + TRAILER_LENGTH / 2;
    bodies.push(
      makeBody(
        cx - fx * centerOffset,
        cy - fy * centerOffset,
        VEHICLE_DIMS.trailer.width,
        VEHICLE_DIMS.trailer.length,
        rotationDeg,
        zIndex
      )
    );
  }
}

function appendRailcarBodies(
  bodies: VehicleCollisionBody[],
  cx: number,
  cy: number,
  rotationDeg: number,
  zIndex: number,
  railcarCount: number
): void {
  const { fx, fy } = travelVector(rotationDeg);
  for (let i = 0; i < railcarCount; i++) {
    const centerOffset = RAILCAR_OFFSET_BASE + i * RAILCAR_OFFSET_SPACING + RAILCAR_LENGTH / 2;
    bodies.push(
      makeBody(
        cx - fx * centerOffset,
        cy - fy * centerOffset,
        VEHICLE_DIMS.railcar.width,
        VEHICLE_DIMS.railcar.length,
        rotationDeg,
        zIndex
      )
    );
  }
}

export function getVehicleCollisionBodies(
  vehicle: Vehicle,
  grid: GridData
): VehicleCollisionBody[] {
  const { posX, posY, rotation } = getVehiclePose(vehicle, grid);
  const vType = vehicle.type || 'car';
  const bodies: VehicleCollisionBody[] = [];

  if (vType === 'train') {
    bodies.push(
      makeBody(posX, posY, VEHICLE_DIMS.train.width, VEHICLE_DIMS.train.length, rotation, vehicle.zIndex)
    );
    appendRailcarBodies(bodies, posX, posY, rotation, vehicle.zIndex, vehicle.railcars?.length ?? 0);
    return bodies;
  }

  if (vType === 'semi') {
    bodies.push(
      makeBody(posX, posY, VEHICLE_DIMS.semi.width, VEHICLE_DIMS.semi.length, rotation, vehicle.zIndex)
    );
    appendTrailerBodies(bodies, posX, posY, rotation, vehicle.zIndex, vehicle.trailers ?? 0);
    return bodies;
  }

  bodies.push(
    makeBody(posX, posY, VEHICLE_DIMS.car.width, VEHICLE_DIMS.car.length, rotation, vehicle.zIndex)
  );
  return bodies;
}

function bodyCorners(body: VehicleCollisionBody): [number, number][] {
  const { cx, cy, halfWidth: hw, halfLength: hl, rotationDeg } = body;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const locals: [number, number][] = [
    [-hw, -hl],
    [hw, -hl],
    [hw, hl],
    [-hw, hl],
  ];
  return locals.map(([lx, ly]) => [
    cx + lx * cos + ly * sin,
    cy + -lx * sin + ly * cos,
  ]);
}

function polygonAxes(corners: [number, number][]): [number, number][] {
  const axes: [number, number][] = [];
  for (let i = 0; i < corners.length; i++) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % corners.length];
    const ex = x2 - x1;
    const ey = y2 - y1;
    const len = Math.hypot(ex, ey) || 1;
    axes.push([-ey / len, ex / len]);
  }
  return axes;
}

function projectPolygon(corners: [number, number][], axis: [number, number]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of corners) {
    const p = x * axis[0] + y * axis[1];
    min = Math.min(min, p);
    max = Math.max(max, p);
  }
  return [min, max];
}

export function collisionBodiesIntersect(a: VehicleCollisionBody, b: VehicleCollisionBody): boolean {
  const cornersA = bodyCorners(a);
  const cornersB = bodyCorners(b);
  const axes = [...polygonAxes(cornersA), ...polygonAxes(cornersB)];

  for (const axis of axes) {
    const [minA, maxA] = projectPolygon(cornersA, axis);
    const [minB, maxB] = projectPolygon(cornersB, axis);
    if (maxA < minB || maxB < minA) return false;
  }
  return true;
}

export function sameVehicleClass(a: Vehicle, b: Vehicle): boolean {
  const ta = a.type || 'car';
  const tb = b.type || 'car';
  if (ta === 'train' || tb === 'train') return ta === tb;
  return true;
}