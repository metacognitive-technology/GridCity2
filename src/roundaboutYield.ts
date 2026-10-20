import { ROUNDABOUT_OUTER_R, TILE_PX } from './roadGeometry';
import { isEmergencyMode, isRoundabout4Way, vehicleBodyLength } from './traffic';
import { isTowLinked } from './tow';
import type { GridData, GridTile, Vehicle } from './types';
import { findVehicleTile, resolveVehicleExit } from './vehicleShapes';
import { getTrajectory } from './vehicleTrajectory';

/**
 * Entering a 4-way roundabout yields to vehicles already in the ring.
 * The hold keeps the front bumper outside the painted circle. Vehicles
 * already inside keep going; the ordinary body clamp stops them from
 * overlapping each other.
 */

const RING_CLEARANCE_PX = 4;
/** Arc from first contact with the ring through a car-length of the merge. */
const GATE_SWEEP = (90 * Math.PI) / 180;
/** Extra arc upstream of the merge, about one car length on the lane radius. */
const UPSTREAM = (70 * Math.PI) / 180;
const WINDOW = GATE_SWEEP + UPSTREAM;
const TAU = Math.PI * 2;

function normHeading(heading: number): number {
  const steps = Math.round(heading / 90);
  return ((steps % 4) + 4) % 4 * 90;
}

function normRad(angle: number): number {
  const t = angle % TAU;
  return t < 0 ? t + TAU : t;
}

function stepOf(heading: number): { dx: number; dy: number } {
  const h = normHeading(heading);
  if (h === 90) return { dx: 1, dy: 0 };
  if (h === 180) return { dx: 0, dy: 1 };
  if (h === 270) return { dx: -1, dy: 0 };
  return { dx: 0, dy: -1 };
}

/** Phi where this approach first meets the ring. Travel then decreases phi. */
function contactPhi(entryHeading: number): number {
  return ((67 + normHeading(entryHeading)) * Math.PI) / 180;
}

function downstreamPhi(entryHeading: number): number {
  return contactPhi(entryHeading) - GATE_SWEEP;
}

/** True when `phi` is in the merge or within the upstream gap of this entry. */
function inEntryWindow(phi: number, entryHeading: number): boolean {
  return normRad(phi - downstreamPhi(entryHeading)) <= WINDOW;
}

function gatesOverlap(a: number, b: number): boolean {
  return inEntryWindow(contactPhi(b), a) || inEntryWindow(contactPhi(a), b);
}

function roundCenter(x: number, y: number): { cx: number; cy: number } {
  return { cx: (x + 0.5) * TILE_PX, cy: (y + 0.5) * TILE_PX };
}

function poseAt(
  vehicle: Vehicle,
  progress: number,
  exitHeading: number,
  tileType: string | undefined,
) {
  return getTrajectory(
    vehicle.x,
    vehicle.y,
    vehicle.heading,
    exitHeading,
    vehicle.lane,
    progress,
    tileType,
  );
}

function bumperDistance(
  vehicle: Vehicle,
  progress: number,
  exitHeading: number,
  tileType: string | undefined,
  roundX: number,
  roundY: number,
): number {
  const pose = poseAt(vehicle, progress, exitHeading, tileType);
  const sample = progress < 0.92 ? progress + 0.04 : progress - 0.04;
  const other = poseAt(vehicle, sample, exitHeading, tileType);
  const sign = sample > progress ? 1 : -1;
  let fx = (other.posX - pose.posX) * sign;
  let fy = (other.posY - pose.posY) * sign;
  const len = Math.hypot(fx, fy) || 1;
  fx /= len;
  fy /= len;
  const half = vehicleBodyLength(vehicle.type) / 2;
  const { cx, cy } = roundCenter(roundX, roundY);
  return Math.hypot(pose.posX + fx * half - cx, pose.posY + fy * half - cy);
}

/** Furthest progress whose front bumper is still outside the ring. */
function yieldLineProgress(
  vehicle: Vehicle,
  exitHeading: number,
  tileType: string | undefined,
  roundX: number,
  roundY: number,
): number {
  const clear = (progress: number) =>
    bumperDistance(vehicle, progress, exitHeading, tileType, roundX, roundY) >=
    ROUNDABOUT_OUTER_R + RING_CLEARANCE_PX;
  if (!clear(0)) return 0;
  if (clear(0.98)) return 0.98;
  let lo = 0;
  let hi = 0.98;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function centerDistance(poseX: number, poseY: number, roundX: number, roundY: number): number {
  const { cx, cy } = roundCenter(roundX, roundY);
  return Math.hypot(poseX - cx, poseY - cy);
}

type EntryAim = { heading: number; dist: number };

function aimAtRoundabout(
  other: Vehicle,
  grid: GridData,
  roundX: number,
  roundY: number,
): EntryAim | null {
  const tile = findVehicleTile(grid[`${other.x},${other.y}`], other.zIndex);
  if (!tile) return null;
  const exitH = resolveVehicleExit(other, tile, grid);
  const pose = poseAt(other, other.progress, exitH, tile.type);
  if (isRoundabout4Way(tile.type)) {
    if (other.x !== roundX || other.y !== roundY) return null;
    const dist = centerDistance(pose.posX, pose.posY, roundX, roundY);
    if (dist <= ROUNDABOUT_OUTER_R) return null;
    return { heading: normHeading(other.heading), dist };
  }
  const step = stepOf(exitH);
  if (other.x + step.dx !== roundX || other.y + step.dy !== roundY) return null;
  const dist = centerDistance(pose.posX, pose.posY, roundX, roundY);
  return { heading: normHeading(exitH), dist };
}

function ringPose(other: Vehicle, grid: GridData, tile: GridTile) {
  const exitH = resolveVehicleExit(other, tile, grid);
  return poseAt(other, other.progress, exitH, tile.type);
}

function mustYield(
  vehicle: Vehicle,
  vehicles: Record<string, Vehicle>,
  grid: GridData,
  roundX: number,
  roundY: number,
  entryHeading: number,
  selfDist: number,
): boolean {
  const roundTile = findVehicleTile(grid[`${roundX},${roundY}`], vehicle.zIndex);
  for (const other of Object.values(vehicles)) {
    if (other.id === vehicle.id) continue;
    if (other.zIndex !== vehicle.zIndex) continue;
    if ((other.type || 'car') === 'train') continue;
    if (isTowLinked(vehicle, other)) continue;

    if (
      roundTile &&
      other.x === roundX &&
      other.y === roundY &&
      isRoundabout4Way(roundTile.type)
    ) {
      const pose = ringPose(other, grid, roundTile);
      const dist = centerDistance(pose.posX, pose.posY, roundX, roundY);
      if (dist <= ROUNDABOUT_OUTER_R + 1.5) {
        const phi = Math.atan2(pose.posY - (roundY + 0.5) * TILE_PX, pose.posX - (roundX + 0.5) * TILE_PX);
        if (inEntryWindow(phi, entryHeading)) return true;
      }
    }

    const aim = aimAtRoundabout(other, grid, roundX, roundY);
    if (!aim || !gatesOverlap(entryHeading, aim.heading)) continue;
    const closer = aim.dist < selfDist - 0.5;
    const tied = Math.abs(aim.dist - selfDist) <= 0.5 && other.id < vehicle.id;
    if (closer || tied) return true;
  }
  return false;
}

/**
 * Progress cap while this vehicle must wait outside a 4-way roundabout.
 * Null when it may enter or is already in the ring.
 */
export function roundaboutYieldLimit(
  vehicle: Vehicle,
  vehicles: Record<string, Vehicle>,
  grid: GridData,
): number | null {
  if ((vehicle.type || 'car') === 'train') return null;
  if (isEmergencyMode(vehicle)) return null;

  const here = findVehicleTile(grid[`${vehicle.x},${vehicle.y}`], vehicle.zIndex);
  if (!here || !here.type.startsWith('road-')) return null;

  let roundX: number;
  let roundY: number;
  let entryHeading: number;
  let exitHeading: number;
  let tileType: string;

  if (isRoundabout4Way(here.type)) {
    const exitNow = resolveVehicleExit(vehicle, here, grid);
    const poseNow = poseAt(vehicle, vehicle.progress, exitNow, here.type);
    if (centerDistance(poseNow.posX, poseNow.posY, vehicle.x, vehicle.y) <= ROUNDABOUT_OUTER_R) {
      return null;
    }
    roundX = vehicle.x;
    roundY = vehicle.y;
    entryHeading = normHeading(vehicle.heading);
    exitHeading = resolveVehicleExit(vehicle, here, grid);
    tileType = here.type;
  } else {
    exitHeading = resolveVehicleExit(vehicle, here, grid);
    const step = stepOf(exitHeading);
    roundX = vehicle.x + step.dx;
    roundY = vehicle.y + step.dy;
    const next = findVehicleTile(grid[`${roundX},${roundY}`], vehicle.zIndex);
    if (!next || !isRoundabout4Way(next.type)) return null;
    entryHeading = normHeading(exitHeading);
    tileType = here.type;
  }

  const pose = poseAt(vehicle, vehicle.progress, exitHeading, tileType);
  const selfDist = centerDistance(pose.posX, pose.posY, roundX, roundY);
  if (!mustYield(vehicle, vehicles, grid, roundX, roundY, entryHeading, selfDist)) return null;

  const line = yieldLineProgress(vehicle, exitHeading, tileType, roundX, roundY);
  if (vehicle.progress >= line - 1e-4) return vehicle.progress;
  return line;
}
