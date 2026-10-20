import { expect, test } from '@playwright/test';
import type { GridData, GridTile, Vehicle } from '../src/types';
import { getTrajectory, headingWhenEnteringTile } from '../src/vehicleTrajectory';
import { bindRouteExit, getVehiclePose, resolveVehicleExit } from '../src/vehicleShapes';
import { taxiLaneEnteringTile } from '../src/traffic';

function veh(partial: Partial<Vehicle> & { type: Vehicle['type'] }): Vehicle {
  return {
    id: partial.type || 'car',
    x: 0,
    y: 0,
    heading: 90,
    lane: 1,
    progress: 0.5,
    color: '#eab308',
    zIndex: 0,
    destination: { x: 0, y: -3 },
    turnAroundAtDeadEnd: true,
    ...partial,
  };
}

test('taxis enter the next tile on the same heading cars use', () => {
  expect(headingWhenEnteringTile(90)).toBe(90);
  expect(headingWhenEnteringTile(0)).toBe(0);
  expect(headingWhenEnteringTile(270)).toBe(270);
  expect(headingWhenEnteringTile(180)).toBe(180);
  expect(headingWhenEnteringTile(360)).toBe(0);
  expect(headingWhenEnteringTile(-90)).toBe(270);
});

test('a right-angle turn is a quarter-circle through the tile', () => {
  const start = getTrajectory(2, 2, 90, 0, 1, 0);
  const mid = getTrajectory(2, 2, 90, 0, 1, 0.5);
  const end = getTrajectory(2, 2, 90, 0, 1, 1);

  const wrap = (deg: number) => {
    let d = deg % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };
  expect(Math.abs(wrap(start.rotation - 90))).toBeLessThan(1);
  expect(Math.abs(wrap(end.rotation - 0))).toBeLessThan(1);
  expect(Math.abs(wrap(mid.rotation - 45))).toBeLessThan(8);

  const chordX = (start.posX + end.posX) / 2;
  const chordY = (start.posY + end.posY) / 2;
  const bow = Math.hypot(mid.posX - chordX, mid.posY - chordY);
  expect(bow).toBeGreaterThan(8);
});

test('a taxi and a car take the same exit into a turn', () => {
  bindRouteExit(() => 0);
  const tile: GridTile = { type: 'road-cross', rotation: 0 };
  const grid: GridData = { '1,1': [tile] };
  const taxi = veh({ id: 'cab-1', type: 'taxi', x: 1, y: 1, heading: 90 });
  const car = veh({ id: 'car-1', type: 'car', x: 1, y: 1, heading: 90 });
  expect(resolveVehicleExit(taxi, tile, grid)).toBe(0);
  expect(resolveVehicleExit(taxi, tile, grid)).toBe(resolveVehicleExit(car, tile, grid));

  const pose = getVehiclePose({ ...taxi, progress: 0.5 }, grid);
  const straight = getTrajectory(1, 1, 90, 90, 1, 0.5);
  expect(Math.hypot(pose.posX - straight.posX, pose.posY - straight.posY)).toBeGreaterThan(8);
});

test('a driven taxi keeps its lane across a straight tile edge', () => {
  expect(taxiLaneEnteringTile(1, true, false, false)).toBe(1);
  expect(taxiLaneEnteringTile(-1, true, false, false)).toBe(-1);
  expect(taxiLaneEnteringTile(2.5, true, false, true)).toBe(2.5);
  expect(taxiLaneEnteringTile(-2.5, true, false, true)).toBe(-2.5);
  expect(taxiLaneEnteringTile(-1, true, true, false)).toBe(-1);

  // Autonomous robotaxis still take the legal right-hand lane on a 2-lane road.
  expect(taxiLaneEnteringTile(-1, false, false, false)).toBe(1);
  expect(taxiLaneEnteringTile(1, false, false, false)).toBe(1);
  expect(taxiLaneEnteringTile(2.5, false, false, true)).toBe(2.5);
  expect(taxiLaneEnteringTile(-1, false, true, false)).toBe(-1);
});

test('keeping the lane does not slide a northbound taxi sideways at the seam', () => {
  const centerX = (0 + 0.5) * 64;
  for (const lane of [1, -1]) {
    const end = getTrajectory(0, 0, 0, 0, lane, 1);
    const start = getTrajectory(0, -1, 0, 0, lane, 0);
    expect(Math.hypot(end.posX - start.posX, end.posY - start.posY)).toBeLessThan(0.5);
    if (lane > 0) expect(end.posX).toBeGreaterThan(centerX);
    else expect(end.posX).toBeLessThan(centerX);
  }
  // The old snap onto lane 1 moves a left-lane taxi onto the right side.
  const left = getTrajectory(0, 0, 0, 0, -1, 1);
  const forced = getTrajectory(0, -1, 0, 0, 1, 0);
  expect(forced.posX - left.posX).toBeGreaterThan(10);
});
