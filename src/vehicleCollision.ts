import { isEmergencyMode } from './traffic';
import { GridData, Vehicle } from './types';
import {
  collisionBodiesIntersect,
  getVehicleCollisionBodies,
  sameVehicleClass,
} from './vehicleShapes';

function vehiclesShareCollisionSpace(a: Vehicle, b: Vehicle): boolean {
  if (a.id === b.id) return false;
  if (a.zIndex !== b.zIndex) return false;
  return sameVehicleClass(a, b);
}

/**
 * Emergency-mode vehicles may drive around / through civilian traffic.
 * Two emergency vehicles still collide with each other so they don't stack.
 */
function emergencyIgnoresCollision(a: Vehicle, b: Vehicle): boolean {
  const aEm = isEmergencyMode(a);
  const bEm = isEmergencyMode(b);
  if (aEm && !bEm) return true;
  if (bEm && !aEm) return true;
  return false;
}

export function vehiclesCollide(
  a: Vehicle,
  b: Vehicle,
  grid: GridData
): boolean {
  if (!vehiclesShareCollisionSpace(a, b)) return false;
  if (emergencyIgnoresCollision(a, b)) return false;

  const bodiesA = getVehicleCollisionBodies(a, grid);
  const bodiesB = getVehicleCollisionBodies(b, grid);

  for (const bodyA of bodiesA) {
    for (const bodyB of bodiesB) {
      if (collisionBodiesIntersect(bodyA, bodyB)) return true;
    }
  }
  return false;
}

export function vehicleCollidesWithAny(
  vehicle: Vehicle,
  vehicles: Record<string, Vehicle>,
  grid: GridData
): boolean {
  for (const other of Object.values(vehicles)) {
    if (vehiclesCollide(vehicle, other, grid)) return true;
  }
  return false;
}

function wouldCollideAtProgress(
  vehicle: Vehicle,
  progress: number,
  vehicles: Record<string, Vehicle>,
  grid: GridData
): boolean {
  const probe = { ...vehicle, progress };
  return vehicleCollidesWithAny(probe, vehicles, grid);
}

/** Highest progress in [current, target] that does not overlap another vehicle body. */
export function findMaxSafeProgress(
  vehicle: Vehicle,
  targetProgress: number,
  vehicles: Record<string, Vehicle>,
  grid: GridData
): number {
  const current = vehicle.progress;
  if (targetProgress <= current) return targetProgress;
  // Emergency mode may pass through civilian traffic entirely
  if (isEmergencyMode(vehicle)) return targetProgress;
  if (!wouldCollideAtProgress(vehicle, targetProgress, vehicles, grid)) return targetProgress;

  let lo = current;
  let hi = targetProgress;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (wouldCollideAtProgress(vehicle, mid, vehicles, grid)) hi = mid;
    else lo = mid;
  }
  return lo;
}

export function canResumeAfterVehicleStop(
  vehicle: Vehicle,
  vehicles: Record<string, Vehicle>,
  grid: GridData
): boolean {
  if (isEmergencyMode(vehicle)) return true;
  return !vehicleCollidesWithAny(vehicle, vehicles, grid);
}

/**
 * True if another non-emergency road vehicle is roughly ahead in the same
 * lane/heading — used to trigger wrong-side overtaking for emergency mode.
 */
export function hasVehicleBlockingAhead(
  vehicle: Vehicle,
  vehicles: Record<string, Vehicle>,
  _grid: GridData
): boolean {
  const vHeading = ((vehicle.heading % 360) + 360) % 360;
  for (const other of Object.values(vehicles)) {
    if (other.id === vehicle.id) continue;
    if (other.zIndex !== vehicle.zIndex) continue;
    if (!sameVehicleClass(vehicle, other)) continue;
    if (isEmergencyMode(other)) continue;

    const sameTile = other.x === vehicle.x && other.y === vehicle.y;
    const dx = other.x - vehicle.x;
    const dy = other.y - vehicle.y;
    const manh = Math.abs(dx) + Math.abs(dy);
    if (!sameTile && manh > 1) continue;

    const oHeading = ((other.heading % 360) + 360) % 360;
    const sameHeading = oHeading === vHeading;
    // Opposite-direction traffic occupies the "wrong" side for us — don't count as block
    if (!sameHeading && sameTile) continue;

    // Same lane (roughly) and ahead of us
    if (Math.abs(other.lane - vehicle.lane) > 0.75) continue;

    if (sameTile) {
      if (other.progress >= vehicle.progress - 0.05) return true;
      continue;
    }

    // Adjacent tile in our travel direction
    const wantDx = vHeading === 90 ? 1 : vHeading === 270 ? -1 : 0;
    const wantDy = vHeading === 180 ? 1 : vHeading === 0 ? -1 : 0;
    if (dx === wantDx && dy === wantDy && other.progress < 0.55) return true;
  }
  return false;
}

/** True when no non-emergency vehicle is nearby on the given lane (safe to merge home). */
export function isLaneClearForEmergency(
  vehicle: Vehicle,
  lane: number,
  vehicles: Record<string, Vehicle>
): boolean {
  const probeLane = lane;
  for (const other of Object.values(vehicles)) {
    if (other.id === vehicle.id) continue;
    if (other.zIndex !== vehicle.zIndex) continue;
    if (!sameVehicleClass(vehicle, other)) continue;
    if (isEmergencyMode(other)) continue;
    const sameTile = other.x === vehicle.x && other.y === vehicle.y;
    const manh = Math.abs(other.x - vehicle.x) + Math.abs(other.y - vehicle.y);
    if (!sameTile && manh > 1) continue;
    if (Math.abs(other.lane - probeLane) > 0.75) continue;
    if (sameTile && Math.abs(other.progress - vehicle.progress) < 0.45) return false;
    if (!sameTile && manh === 1) return false;
  }
  return true;
}