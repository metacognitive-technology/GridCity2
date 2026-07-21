import { getTrajectory } from './vehicleTrajectory';
import { getGroundRoadTile, TILE_CONNECTIONS } from './traffic';
import { GridData, Vehicle } from './types';

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

export function computeExitHeading(vehicle: Vehicle, grid: GridData): number {
  const tiles = grid[`${vehicle.x},${vehicle.y}`];
  const currentTile = getGroundRoadTile(tiles, vehicle.zIndex);
  if (!currentTile) return vehicle.heading;

  const ports = (ALL_TILE_CONNECTIONS[currentTile.type] || []).map(
    p => (p + currentTile.rotation / 90) % 4
  );
  const entryPort = (vehicle.heading / 90 + 2) % 4;
  const otherPorts = ports.filter(p => p !== entryPort);
  if (!otherPorts.length) return vehicle.heading;

  let exitPort = otherPorts[0];
  if (otherPorts.length > 1) {
    const straightPort = (entryPort + 2) % 4;
    const leftPort = (entryPort + 1) % 4;
    const rightPort = (entryPort + 3) % 4;

    if (vehicle.turnIntent === 'left' && otherPorts.includes(leftPort)) exitPort = leftPort;
    else if (vehicle.turnIntent === 'right' && otherPorts.includes(rightPort)) exitPort = rightPort;
    else if (otherPorts.includes(straightPort)) exitPort = straightPort;
  }

  return exitPort * 90;
}

export function getVehiclePose(
  vehicle: Vehicle,
  grid: GridData
): { posX: number; posY: number; rotation: number } {
  const exitHeading = computeExitHeading(vehicle, grid);
  const { posX, posY, rotation } = getTrajectory(
    vehicle.x,
    vehicle.y,
    vehicle.heading,
    exitHeading,
    vehicle.lane,
    vehicle.progress
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