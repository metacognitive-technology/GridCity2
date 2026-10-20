import { expect, test } from '@playwright/test';
import { ROUNDABOUT_OUTER_R, TILE_PX } from '../src/roadGeometry';
import { roundaboutYieldLimit } from '../src/roundaboutYield';
import type { GridData, GridTile, Vehicle } from '../src/types';
import { vehiclesCollide } from '../src/vehicleCollision';
import { getTrajectory } from '../src/vehicleTrajectory';

/** Sprite length copied from Vehicle.tsx. The windshield is the front. */
function spriteLength(type: string | undefined): number {
  if (type === 'bus') return 34;
  if (type === 'fire-truck' || type === 'tow-truck') return 26;
  if (type === 'semi') return 10;
  if (type === 'train') return 40;
  return 20;
}

function veh(partial: Partial<Vehicle> & Pick<Vehicle, 'id' | 'type'>): Vehicle {
  return {
    x: 0,
    y: 0,
    heading: 0,
    lane: 1,
    progress: 0.2,
    color: '#334155',
    zIndex: 0,
    speed: 1,
    isMoving: true,
    turnAroundAtDeadEnd: true,
    ...partial,
  };
}

function cell(type: GridTile['type'], rotation = 0): GridTile[] {
  return [{ type, rotation }];
}

function grid(): GridData {
  return {
    '0,0': cell('road-roundabout-4way'),
    '0,1': cell('road-straight', 0),
    '0,-1': cell('road-straight', 0),
    '1,0': cell('road-straight', 90),
    '-1,0': cell('road-straight', 90),
  };
}

const approach: Record<number, { x: number; y: number }> = {
  0: { x: 0, y: 1 },
  90: { x: -1, y: 0 },
  180: { x: 0, y: -1 },
  270: { x: 1, y: 0 },
};

function bumperClearance(vehicle: Vehicle, roundX: number, roundY: number): number {
  const pose = getTrajectory(
    vehicle.x, vehicle.y, vehicle.heading, vehicle.heading, vehicle.lane, vehicle.progress,
    'road-straight',
  );
  const sample = vehicle.progress < 0.92 ? vehicle.progress + 0.04 : vehicle.progress - 0.04;
  const other = getTrajectory(
    vehicle.x, vehicle.y, vehicle.heading, vehicle.heading, vehicle.lane, sample, 'road-straight',
  );
  const sign = sample > vehicle.progress ? 1 : -1;
  let fx = (other.posX - pose.posX) * sign;
  let fy = (other.posY - pose.posY) * sign;
  const len = Math.hypot(fx, fy) || 1;
  fx /= len;
  fy /= len;
  const half = spriteLength(vehicle.type) / 2;
  const bx = pose.posX + fx * half;
  const by = pose.posY + fy * half;
  const cx = (roundX + 0.5) * TILE_PX;
  const cy = (roundY + 0.5) * TILE_PX;
  return Math.hypot(bx - cx, by - cy) - ROUNDABOUT_OUTER_R;
}

test('an empty 4-way roundabout lets every approach enter', () => {
  const g = grid();
  for (const heading of [0, 90, 180, 270]) {
    const at = approach[heading];
    const car = veh({ id: 'in', type: 'car', ...at, heading, progress: 0.2 });
    expect(roundaboutYieldLimit(car, { in: car }, g), `heading ${heading}`).toBeNull();
  }
});

test('traffic still crossing the entry holds the vehicle outside the ring', () => {
  const g = grid();
  for (const heading of [0, 90, 180, 270]) {
    const at = approach[heading];
    const entrant = veh({ id: 'in', type: 'car', ...at, heading, progress: 0.15 });
    const occupant = veh({
      id: 'occ',
      type: 'car',
      x: 0,
      y: 0,
      heading,
      progress: 0.4,
    });
    const vehicles = { in: entrant, occ: occupant };
    const cap = roundaboutYieldLimit(entrant, vehicles, g);
    expect(cap, `heading ${heading}`).not.toBeNull();
    const held = { ...entrant, progress: cap! };
    const gap = bumperClearance(held, 0, 0);
    expect(gap, `heading ${heading} entered the ring`).toBeGreaterThan(2);
    expect(gap, `heading ${heading} stopped early`).toBeLessThan(10);
    expect(cap!, `heading ${heading}`).toBeLessThan(0.995);
    expect(vehiclesCollide(held, occupant, g)).toBe(false);
  }
});

test('a vehicle that has cleared the entry does not hold the next one', () => {
  const g = grid();
  for (const heading of [0, 90, 180, 270]) {
    const at = approach[heading];
    const entrant = veh({ id: 'in', type: 'car', ...at, heading, progress: 0.3 });
    const leaving = veh({
      id: 'out',
      type: 'car',
      x: 0,
      y: 0,
      heading,
      progress: 0.72,
    });
    expect(
      roundaboutYieldLimit(entrant, { in: entrant, out: leaving }, g),
      `heading ${heading}`,
    ).toBeNull();
  }
});

test('a right turn already in the corner has priority over the next entrant', () => {
  const g = grid();
  const entrant = veh({ id: 'in', type: 'taxi', x: 0, y: 1, heading: 0, progress: 0.2 });
  const turning = veh({
    id: 'turn',
    type: 'car',
    x: 0,
    y: 0,
    heading: 0,
    progress: 0.5,
    turnIntent: 'right',
  });
  const cap = roundaboutYieldLimit(entrant, { in: entrant, turn: turning }, g);
  expect(cap).not.toBeNull();
  const held = { ...entrant, progress: cap! };
  expect(bumperClearance(held, 0, 0)).toBeGreaterThan(2);
  expect(vehiclesCollide(held, turning, g)).toBe(false);
});

test('a vehicle on the roundabout tile but not yet in the ring does not advance', () => {
  const g = grid();
  for (const heading of [0, 90, 180, 270]) {
    const occupant = veh({ id: 'occ', type: 'car', x: 0, y: 0, heading, progress: 0.4 });
    const nose = veh({ id: 'nose', type: 'car', x: 0, y: 0, heading, progress: 0.05 });
    const cap = roundaboutYieldLimit(nose, { occ: occupant, nose }, g);
    expect(cap, `heading ${heading}`).toBe(0.05);
    expect(vehiclesCollide({ ...nose, progress: cap! }, occupant, g)).toBe(false);
  }
});

test('a vehicle already in the ring is not told to yield', () => {
  const g = grid();
  const inside = veh({ id: 'a', type: 'car', x: 0, y: 0, heading: 0, progress: 0.45 });
  const other = veh({ id: 'b', type: 'bus', x: 0, y: 0, heading: 90, progress: 0.45 });
  expect(roundaboutYieldLimit(inside, { a: inside, b: other }, g)).toBeNull();
});

test('one long step cannot jump the yield line', () => {
  const g = grid();
  const entrant = veh({ id: 'in', type: 'bus', x: 0, y: 1, heading: 0, progress: 0.05 });
  const occupant = veh({ id: 'occ', type: 'car', x: 0, y: 0, heading: 0, progress: 0.35 });
  const cap = roundaboutYieldLimit(entrant, { in: entrant, occ: occupant }, g);
  expect(cap).not.toBeNull();
  expect(cap!).toBeGreaterThan(entrant.progress);
  expect(cap!).toBeLessThan(0.995);
  const car = veh({ id: 'car', type: 'car', x: 0, y: 1, heading: 0, progress: 0.05 });
  const carCap = roundaboutYieldLimit(car, { car, occ: occupant }, g);
  expect(carCap!).toBeGreaterThan(cap!);
  expect(bumperClearance({ ...entrant, progress: cap! }, 0, 0)).toBeGreaterThan(2);
  expect(bumperClearance({ ...car, progress: carCap! }, 0, 0)).toBeGreaterThan(2);
});

test('the opposite approach is not blocked by traffic on the far flank', () => {
  const g = grid();
  const south = veh({ id: 's', type: 'car', x: 0, y: 1, heading: 0, progress: 0.4 });
  const northOccupant = veh({ id: 'n', type: 'car', x: 0, y: 0, heading: 180, progress: 0.5 });
  expect(roundaboutYieldLimit(south, { s: south, n: northOccupant }, g)).toBeNull();
});

test('a closer conflicting approach yields the farther one', () => {
  const g = grid();
  const south = veh({ id: 's', type: 'car', x: 0, y: 1, heading: 0, progress: 0.2 });
  const west = veh({ id: 'w', type: 'car', x: -1, y: 0, heading: 90, progress: 0.9 });
  const cap = roundaboutYieldLimit(south, { s: south, w: west }, g);
  expect(cap).not.toBeNull();
  expect(bumperClearance({ ...south, progress: cap! }, 0, 0)).toBeGreaterThan(2);
  expect(roundaboutYieldLimit(west, { s: south, w: west }, g)).toBeNull();
});

test('an opposite approach may enter while another arm is waiting', () => {
  const g = grid();
  const south = veh({ id: 's', type: 'car', x: 0, y: 1, heading: 0, progress: 0.3 });
  const north = veh({ id: 'n', type: 'car', x: 0, y: -1, heading: 180, progress: 0.9 });
  expect(roundaboutYieldLimit(south, { s: south, n: north }, g)).toBeNull();
});

test('emergency vehicles with lights on may enter, and lights-off vehicles wait', () => {
  const g = grid();
  const occupant = veh({ id: 'occ', type: 'car', x: 0, y: 0, heading: 0, progress: 0.4 });
  const police = veh({ id: 'p', type: 'police', x: 0, y: 1, heading: 0, progress: 0.2 });
  const dark = veh({
    id: 'd',
    type: 'ambulance',
    x: 0,
    y: 1,
    heading: 0,
    progress: 0.2,
    emergencyLightsOn: false,
  });
  const manual = veh({
    id: 'm',
    type: 'car',
    x: 0,
    y: 1,
    heading: 0,
    progress: 0.2,
    manualOverride: true,
  });
  expect(roundaboutYieldLimit(police, { p: police, occ: occupant }, g)).toBeNull();
  expect(roundaboutYieldLimit(dark, { d: dark, occ: occupant }, g)).not.toBeNull();
  expect(roundaboutYieldLimit(manual, { m: manual, occ: occupant }, g)).not.toBeNull();
});

test('a quarter roundabout tile is not this yield', () => {
  const g: GridData = {
    '0,0': cell('road-roundabout'),
    '0,1': cell('road-straight'),
  };
  const entrant = veh({ id: 'in', type: 'car', x: 0, y: 1, heading: 0, progress: 0.2 });
  const occupant = veh({ id: 'occ', type: 'car', x: 0, y: 0, heading: 0, progress: 0.4 });
  expect(roundaboutYieldLimit(entrant, { in: entrant, occ: occupant }, g)).toBeNull();
});
