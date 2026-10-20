/**
 * Tow-truck hook: connect to a vehicle sitting behind the truck
 * within half a tile, then keep it snapped behind while towing.
 */

import type { GridData, Vehicle } from './types';
import { getVehiclePose } from './vehicleShapes';

export const TOW_HOOK_RANGE_TILES = 0.5;
/** Follow gap while hooked (tile centers). */
export const TOW_FOLLOW_GAP_TILES = 0.48;

export function isTowTruck(v: Vehicle | undefined | null): boolean {
  return v?.type === 'tow-truck';
}

export function isTowLinked(a: Vehicle, b: Vehicle): boolean {
  if (a.id === b.id) return false;
  return (
    a.towedVehicleId === b.id ||
    b.towedVehicleId === a.id ||
    a.towedById === b.id ||
    b.towedById === a.id
  );
}

export function canBeTowed(v: Vehicle, towId: string): boolean {
  if (v.id === towId) return false;
  if (v.type === 'train') return false;
  if (v.towedById && v.towedById !== towId) return false;
  if (v.towedVehicleId) return false;
  return true;
}

/** Continuous grid position of a vehicle (tile units). */
export function vehicleGridPos(v: Vehicle, grid?: GridData): { x: number; y: number } {
  if (grid) {
    try {
      const pose = getVehiclePose(v, grid);
      return { x: pose.posX / 64, y: pose.posY / 64 };
    } catch {
      // fall through
    }
  }
  const rad = ((v.heading - 90) * Math.PI) / 180;
  const t = (v.progress ?? 0.5) - 0.5;
  return {
    x: v.x + 0.5 + Math.cos(rad) * t,
    y: v.y + 0.5 + Math.sin(rad) * t,
  };
}

/** Forward unit vector for a heading (0=N, 90=E). */
export function headingForward(heading: number): { x: number; y: number } {
  const rad = ((heading - 90) * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

/**
 * Closest towable vehicle behind `tow` within TOW_HOOK_RANGE_TILES.
 * "Behind" = along the reverse of the tow truck's heading, not beside or ahead.
 */
export function findTowTargetBehind(
  tow: Vehicle,
  vehicles: Record<string, Vehicle>,
  grid?: GridData,
): Vehicle | null {
  const towPos = vehicleGridPos(tow, grid);
  const fwd = headingForward(tow.heading);
  const bx = -fwd.x;
  const by = -fwd.y;
  let best: Vehicle | null = null;
  let bestDist = TOW_HOOK_RANGE_TILES + 1e-9;

  for (const other of Object.values(vehicles)) {
    if (!canBeTowed(other, tow.id)) continue;
    const p = vehicleGridPos(other, grid);
    const dx = p.x - towPos.x;
    const dy = p.y - towPos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > TOW_HOOK_RANGE_TILES || dist < 0.02) continue;
    const behind = dx * bx + dy * by;
    if (behind < 0.04) continue;
    const lateral = Math.abs(dx * fwd.y - dy * fwd.x);
    if (lateral > 0.35) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  return best;
}

/** Grid pose of a vehicle `tilesBack` behind `tow` along its heading. */
export function placeVehicleBehind(
  tow: Vehicle,
  tilesBack = TOW_FOLLOW_GAP_TILES,
): Pick<Vehicle, 'x' | 'y' | 'heading' | 'lane' | 'progress' | 'zIndex'> {
  let x = tow.x;
  let y = tow.y;
  let progress = (tow.progress ?? 0.5) - tilesBack;
  const heading = tow.heading;
  const fwd = headingForward(heading);
  const stepX = Math.round(fwd.x);
  const stepY = Math.round(fwd.y);
  while (progress < 0) {
    progress += 1;
    x -= stepX;
    y -= stepY;
  }
  while (progress >= 1) {
    progress -= 1;
    x += stepX;
    y += stepY;
  }
  return {
    x,
    y,
    heading,
    lane: tow.lane,
    progress,
    zIndex: tow.zIndex,
  };
}

export function connectTowHook(
  vehicles: Record<string, Vehicle>,
  towId: string,
  targetId: string,
): Record<string, Vehicle> {
  const tow = vehicles[towId];
  const target = vehicles[targetId];
  if (!isTowTruck(tow) || !target || !canBeTowed(target, towId)) return vehicles;
  const follow = placeVehicleBehind(tow);
  return {
    ...vehicles,
    [towId]: { ...tow, towedVehicleId: targetId },
    [targetId]: {
      ...target,
      ...follow,
      towedById: towId,
      isMoving: false,
      destination: null,
      stepForward: false,
      stepBackward: false,
    },
  };
}

export function disconnectTowHook(
  vehicles: Record<string, Vehicle>,
  towId: string,
): Record<string, Vehicle> {
  const tow = vehicles[towId];
  if (!tow?.towedVehicleId) return vehicles;
  const hookedId = tow.towedVehicleId;
  const next: Record<string, Vehicle> = {
    ...vehicles,
    [towId]: { ...tow, towedVehicleId: undefined },
  };
  const hooked = next[hookedId];
  if (hooked) {
    const { towedById: _drop, ...rest } = hooked;
    next[hookedId] = { ...rest, isMoving: false };
  }
  return next;
}

/** After the tow truck has moved, snap its hooked vehicle behind it. */
export function snapTowedVehicle(
  vehicles: Record<string, Vehicle>,
  tow: Vehicle,
): Record<string, Vehicle> {
  if (!tow.towedVehicleId) return vehicles;
  const hooked = vehicles[tow.towedVehicleId];
  if (!hooked) {
    return { ...vehicles, [tow.id]: { ...tow, towedVehicleId: undefined } };
  }
  const follow = placeVehicleBehind(tow);
  if (
    hooked.x === follow.x &&
    hooked.y === follow.y &&
    hooked.heading === follow.heading &&
    hooked.lane === follow.lane &&
    hooked.zIndex === follow.zIndex &&
    Math.abs((hooked.progress ?? 0.5) - follow.progress) < 1e-4 &&
    hooked.towedById === tow.id &&
    hooked.isMoving === false
  ) {
    return vehicles;
  }
  return {
    ...vehicles,
    [tow.towedVehicleId]: {
      ...hooked,
      ...follow,
      towedById: tow.id,
      isMoving: false,
      destination: null,
      stepForward: false,
      stepBackward: false,
    },
  };
}
