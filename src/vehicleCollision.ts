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

export function vehiclesCollide(
  a: Vehicle,
  b: Vehicle,
  grid: GridData
): boolean {
  if (!vehiclesShareCollisionSpace(a, b)) return false;

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
  return !vehicleCollidesWithAny(vehicle, vehicles, grid);
}