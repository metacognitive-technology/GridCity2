import { expect, test } from '@playwright/test';
import type { GridData, GridTile, TrafficLightPhase, TrafficState, Vehicle } from '../src/types';
import { ROAD_INSET_2L, ROAD_INSET_4L, TILE_PX } from '../src/roadGeometry';
import {
  clampProgressForRedLight,
  getStoplightPosition,
  shouldStopForLight,
  type SignalContext,
} from '../src/traffic';
import { getTrajectory } from '../src/vehicleTrajectory';
import { signalHoldContext } from '../src/vehicleShapes';

/**
 * Sprite length along travel, copied from Vehicle.tsx (not from the stop-line
 * helper). The windshield sits on the top edge; CSS rotate(heading) points
 * that edge along travel, so the front bumper is half this length ahead of
 * the pose center.
 */
function spriteLength(type: string | undefined): number {
  if (type === 'bus') return 34;
  if (type === 'fire-truck' || type === 'tow-truck') return 26;
  if (type === 'semi') return 10;
  if (type === 'train') return 40;
  return 20;
}

function veh(partial: Partial<Vehicle> & Pick<Vehicle, 'type'>): Vehicle {
  return {
    id: partial.id || partial.type || 'car',
    x: 0,
    y: 0,
    heading: 0,
    lane: 1,
    progress: 0.05,
    color: '#334155',
    zIndex: 0,
    speed: 1,
    isMoving: true,
    turnAroundAtDeadEnd: true,
    ...partial,
  };
}

function makeLight(
  gridKey: string,
  heading: number,
  lane: number,
  phase: TrafficLightPhase,
  id: number,
) {
  return {
    kind: 'stoplight' as const,
    id,
    gridKey,
    heading,
    lane,
    phase,
    manualOnly: false,
    redMs: 5000,
    yellowMs: 2000,
    greenMs: 5000,
    phaseStartedAt: 0,
  };
}

function trafficOf(controls: ReturnType<typeof makeLight>[]): TrafficState {
  const map: TrafficState['controls'] = {};
  for (const control of controls) map[`stoplight:${control.id}`] = control;
  return {
    stopSignMinDurationSec: 3,
    stopSignSizeScale: 1,
    stoplightSizeScale: 1,
    nextLightId: controls.length + 1,
    nextSignId: 1,
    controls: map,
    showControls: true,
  };
}

function cell(type: GridTile['type'], rotation = 0): GridTile[] {
  return [{ type, rotation }];
}

function straightGrid(rotation: number): GridData {
  return { '0,0': cell('road-straight', rotation) };
}

function junctionGrid(cross: 'road-cross' | 'road-4lane-cross'): GridData {
  const straight = cross === 'road-cross' ? 'road-straight' : 'road-4lane-straight';
  const ns = 0;
  const ew = 90;
  return {
    '0,0': cell(cross, 0),
    '0,1': cell(straight, ns),
    '0,-1': cell(straight, ns),
    '1,0': cell(straight, ew),
    '-1,0': cell(straight, ew),
  };
}

/** Travel direction taken from the rendered path, then the bumper and the light graphic. */
function frontAndLight(
  vehicle: Vehicle,
  exitHeading: number,
  tileType: string | undefined,
  lightKey: string,
  lightHeading: number,
  lightLane: number,
) {
  const pose = getTrajectory(
    vehicle.x, vehicle.y, vehicle.heading, exitHeading, vehicle.lane, vehicle.progress, tileType,
  );
  const sample = vehicle.progress < 0.9 ? vehicle.progress + 0.04 : vehicle.progress - 0.04;
  const other = getTrajectory(
    vehicle.x, vehicle.y, vehicle.heading, exitHeading, vehicle.lane, sample, tileType,
  );
  const sign = sample > vehicle.progress ? 1 : -1;
  let fx = (other.posX - pose.posX) * sign;
  let fy = (other.posY - pose.posY) * sign;
  const len = Math.hypot(fx, fy) || 1;
  fx /= len;
  fy /= len;
  const half = spriteLength(vehicle.type) / 2;
  const bumper = { x: pose.posX + fx * half, y: pose.posY + fy * half };
  const [gx, gy] = lightKey.split(',').map(Number);
  const local = getStoplightPosition(lightHeading, lightLane, 0);
  const light = { x: gx * TILE_PX + local.x, y: gy * TILE_PX + local.y };
  const gap = (light.x - bumper.x) * fx + (light.y - bumper.y) * fy;
  return { bumper, fx, fy, gap, pose };
}

/** Positive when the bumper has not reached the near face of the junction box. */
function boxClearance(
  bumper: { x: number; y: number },
  fx: number,
  fy: number,
  junctionX: number,
  junctionY: number,
  inset: number,
) {
  const cx = (junctionX + 0.5) * TILE_PX;
  const cy = (junctionY + 0.5) * TILE_PX;
  const boxHalf = TILE_PX / 2 - inset;
  const faceX = cx - fx * boxHalf;
  const faceY = cy - fy * boxHalf;
  return (faceX - bumper.x) * fx + (faceY - bumper.y) * fy;
}

function holdContext(vehicle: Vehicle, tile: GridTile, grid: GridData): SignalContext {
  return signalHoldContext(vehicle, tile, grid);
}

/** Repeated clamps, the way a laggy frame and the frames after it move a vehicle. */
function roll(vehicle: Vehicle, traffic: TrafficState, tile: GridTile, grid: GridData, step = 0.2) {
  let current = vehicle;
  let held = false;
  for (let i = 0; i < 40; i++) {
    const ctx = holdContext(current, tile, grid);
    const next = clampProgressForRedLight(current, current.progress + step, traffic, ctx);
    current = { ...current, progress: next.progress };
    if (next.mustStop) {
      held = true;
      break;
    }
    if (current.progress >= 1.2) break;
  }
  return { vehicle: current, held };
}

test('a red light keeps the front bumper short of the signal on every heading', () => {
  const cases = [
    { heading: 0, rotation: 0 },
    { heading: 90, rotation: 90 },
    { heading: 180, rotation: 0 },
    { heading: 270, rotation: 90 },
  ];
  for (const { heading, rotation } of cases) {
    const grid = straightGrid(rotation);
    const tile = grid['0,0'][0];
    const traffic = trafficOf([makeLight('0,0', heading, 1, 'red', 1)]);
    const started = veh({ type: 'car', heading, progress: 0.1 });
    const { vehicle, held } = roll(started, traffic, tile, grid, 0.5);
    expect(held, `heading ${heading} did not stop`).toBe(true);
    const ctx = holdContext(vehicle, tile, grid);
    const gap = frontAndLight(vehicle, ctx.exitHeading ?? heading, tile.type, '0,0', heading, 1).gap;
    expect(gap, `heading ${heading} bumper passed the red light`).toBeGreaterThan(6);
    expect(gap, `heading ${heading} stopped well short of the light`).toBeLessThan(14);
    expect(vehicle.progress).toBeLessThan(0.9);
    expect(shouldStopForLight(vehicle, traffic, ctx)).toBe(true);
  }
});

test('one long frame cannot jump a red or yellow light', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  for (const phase of ['red', 'yellow'] as const) {
    const traffic = trafficOf([makeLight('0,0', 0, 1, phase, 1)]);
    const started = veh({ type: 'car', progress: 0.2 });
    const ctx = holdContext(started, tile, grid);
    const jumped = clampProgressForRedLight(started, started.progress + 5, traffic, ctx);
    expect(jumped.mustStop, phase).toBe(true);
    const stopped = { ...started, progress: jumped.progress };
    const gap = frontAndLight(stopped, 0, tile.type, '0,0', 0, 1).gap;
    expect(gap, phase).toBeGreaterThan(6);
    expect(gap, phase).toBeLessThan(14);
  }
});

test('a green light lets the vehicle pass', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  const traffic = trafficOf([makeLight('0,0', 0, 1, 'green', 1)]);
  const { vehicle, held } = roll(veh({ type: 'car', progress: 0.2 }), traffic, tile, grid, 0.4);
  expect(held).toBe(false);
  expect(vehicle.progress).toBeGreaterThan(1);
});

test('a longer vehicle stops farther back than a car, and a short one stops closer', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  const traffic = trafficOf([makeLight('0,0', 0, 1, 'red', 1)]);
  const stopOf = (type: Vehicle['type']) =>
    roll(veh({ type, progress: 0.05 }), traffic, tile, grid, 0.35).vehicle;
  const car = stopOf('car');
  const bus = stopOf('bus');
  const semi = stopOf('semi');
  const taxi = stopOf('taxi');
  expect(bus.progress).toBeLessThan(car.progress - 0.05);
  expect(semi.progress).toBeGreaterThan(car.progress + 0.02);
  expect(Math.abs(taxi.progress - car.progress)).toBeLessThan(0.01);
  for (const stopped of [car, bus, semi, taxi]) {
    const gap = frontAndLight(stopped, 0, tile.type, '0,0', 0, 1).gap;
    expect(gap, stopped.type).toBeGreaterThan(6);
    expect(gap, stopped.type).toBeLessThan(14);
  }
});

test('the lane whose light is green is not held by another lane that is red', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  const traffic = trafficOf([
    makeLight('0,0', 0, -1, 'red', 1),
    makeLight('0,0', 0, 1, 'green', 2),
  ]);
  const started = veh({ type: 'car', lane: 1, progress: 0.2 });
  const ctx = holdContext(started, tile, grid);
  const next = clampProgressForRedLight(started, 1.5, traffic, ctx);
  expect(next.mustStop).toBe(false);
  expect(next.progress).toBeGreaterThan(1);
  expect(shouldStopForLight(started, traffic, ctx)).toBe(false);
});

test('a same-heading light still stops a vehicle that is not on that lane', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  const traffic = trafficOf([makeLight('0,0', 0, -1, 'red', 1)]);
  const { vehicle, held } = roll(veh({ type: 'car', lane: 1, progress: 0.1 }), traffic, tile, grid, 0.45);
  expect(held).toBe(true);
  const gap = frontAndLight(vehicle, 0, tile.type, '0,0', 0, -1).gap;
  expect(gap).toBeGreaterThan(6);
  expect(gap).toBeLessThan(14);
});

test('a light for a different heading does not stop the vehicle', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  const traffic = trafficOf([makeLight('0,0', 90, 1, 'red', 1)]);
  const started = veh({ type: 'car', heading: 0, progress: 0.2 });
  const ctx = holdContext(started, tile, grid);
  expect(shouldStopForLight(started, traffic, ctx)).toBe(false);
  const next = clampProgressForRedLight(started, 1.4, traffic, ctx);
  expect(next.mustStop).toBe(false);
  expect(next.progress).toBeGreaterThan(1);
});

test('only emergency vehicles with lights on, and trains, may pass a red light', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  const traffic = trafficOf([makeLight('0,0', 0, 1, 'red', 1)]);
  const passes = (partial: Partial<Vehicle> & Pick<Vehicle, 'type'>) => {
    const started = veh({ progress: 0.2, ...partial });
    const ctx = holdContext(started, tile, grid);
    const next = clampProgressForRedLight(started, 1.5, traffic, ctx);
    return !next.mustStop && next.progress > 1 && !shouldStopForLight({ ...started, progress: 0.8 }, traffic, ctx);
  };
  const stops = (partial: Partial<Vehicle> & Pick<Vehicle, 'type'>) => !passes(partial);

  expect(passes({ type: 'police' })).toBe(true);
  expect(passes({ type: 'ambulance', emergencyLightsOn: true })).toBe(true);
  expect(passes({ type: 'fire-truck' })).toBe(true);
  expect(passes({ type: 'tow-truck', emergencyLightsOn: undefined })).toBe(true);
  expect(passes({ type: 'train' })).toBe(true);

  expect(stops({ type: 'police', emergencyLightsOn: false })).toBe(true);
  expect(stops({ type: 'ambulance', emergencyLightsOn: false })).toBe(true);
  expect(stops({ type: 'fire-truck', emergencyLightsOn: false })).toBe(true);
  expect(stops({ type: 'tow-truck', emergencyLightsOn: false })).toBe(true);
  expect(stops({ type: 'taxi' })).toBe(true);
  expect(stops({ type: 'taxi', emergencyLightsOn: true })).toBe(true);
  expect(stops({ type: 'bus' })).toBe(true);
  expect(stops({ type: 'car', manualOverride: true })).toBe(true);
});

test('a vehicle that has already passed the light is not trapped on it', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  const traffic = trafficOf([makeLight('0,0', 0, 1, 'red', 1)]);
  const started = veh({ type: 'car', progress: 0.93 });
  const gap = frontAndLight(started, 0, tile.type, '0,0', 0, 1).gap;
  expect(gap).toBeLessThan(0);
  const ctx = holdContext(started, tile, grid);
  const next = clampProgressForRedLight(started, 1.3, traffic, ctx);
  expect(next.mustStop).toBe(false);
  expect(next.progress).toBeGreaterThan(started.progress);
});

test('green releases a vehicle that was waiting at the light', () => {
  const grid = straightGrid(0);
  const tile = grid['0,0'][0];
  const red = trafficOf([makeLight('0,0', 0, 1, 'red', 1)]);
  const { vehicle } = roll(veh({ type: 'car', progress: 0.1 }), red, tile, grid, 0.4);
  const ctx = holdContext(vehicle, tile, grid);
  expect(shouldStopForLight(vehicle, red, ctx)).toBe(true);
  const green = trafficOf([makeLight('0,0', 0, 1, 'green', 1)]);
  expect(shouldStopForLight(vehicle, green, ctx)).toBe(false);
  const next = clampProgressForRedLight(vehicle, vehicle.progress + 0.3, green, ctx);
  expect(next.mustStop).toBe(false);
  expect(next.progress).toBeGreaterThan(vehicle.progress + 0.2);
});

test('an approach to a red junction stops before the box', () => {
  const approaches = [
    { heading: 0, x: 0, y: 1 },
    { heading: 90, x: -1, y: 0 },
    { heading: 180, x: 0, y: -1 },
    { heading: 270, x: 1, y: 0 },
  ];
  for (const cross of ['road-cross', 'road-4lane-cross'] as const) {
    const inset = cross === 'road-cross' ? ROAD_INSET_2L : ROAD_INSET_4L;
    const grid = junctionGrid(cross);
    for (const approach of approaches) {
      for (const type of ['car', 'bus', 'taxi'] as const) {
        const key = `${approach.x},${approach.y}`;
        const tile = grid[key][0];
        const lane = 1;
        const lightLane = cross === 'road-4lane-cross' && (approach.heading === 90 || approach.heading === 270)
          ? -1
          : lane;
        const traffic = trafficOf([makeLight('0,0', approach.heading, lightLane, 'red', 1)]);
        const started = veh({ type, x: approach.x, y: approach.y, heading: approach.heading, lane, progress: 0.15 });
        const { vehicle, held } = roll(started, traffic, tile, grid, 0.45);
        const label = `${cross} ${type} h${approach.heading}`;
        expect(held, label).toBe(true);
        expect(vehicle.progress, label).toBeLessThan(0.995);
        const ctx = holdContext(vehicle, tile, grid);
        const { bumper, fx, fy } = frontAndLight(vehicle, ctx.exitHeading ?? approach.heading, tile.type, '0,0', approach.heading, lightLane);
        const clearance = boxClearance(bumper, fx, fy, 0, 0, inset);
        expect(clearance, `${label} entered the box`).toBeGreaterThan(1);
        expect(clearance, `${label} stopped well before the box`).toBeLessThan(16);
        expect(shouldStopForLight(vehicle, traffic, ctx), label).toBe(true);
      }
    }
  }
});

test('a vehicle already on a red junction does not enter the box', () => {
  const grid = junctionGrid('road-cross');
  const tile = grid['0,0'][0];
  const traffic = trafficOf([makeLight('0,0', 0, 1, 'red', 1)]);
  const started = veh({ type: 'car', x: 0, y: 0, heading: 0, progress: 0 });
  const ctx = holdContext(started, tile, grid);
  const jumped = clampProgressForRedLight(started, 2, traffic, ctx);
  expect(jumped.mustStop).toBe(true);
  const stopped = { ...started, progress: jumped.progress };
  const { bumper, fx, fy } = frontAndLight(stopped, ctx.exitHeading ?? 0, tile.type, '0,0', 0, 1);
  expect(boxClearance(bumper, fx, fy, 0, 0, ROAD_INSET_2L)).toBeGreaterThan(1);
  expect(boxClearance(bumper, fx, fy, 0, 0, ROAD_INSET_2L)).toBeLessThan(16);
});

test('a green approach may turn across a red cross street', () => {
  const grid = junctionGrid('road-cross');
  const tile = grid['0,0'][0];
  const traffic = trafficOf([
    makeLight('0,0', 0, 1, 'green', 1),
    makeLight('0,0', 90, 1, 'red', 2),
  ]);
  const started = veh({ type: 'car', x: 0, y: 0, heading: 0, progress: 0.05, turnIntent: 'right' });
  const ctx = holdContext(started, tile, grid);
  expect(ctx.exitHeading).toBe(90);
  const next = clampProgressForRedLight(started, 0.8, traffic, ctx);
  expect(next.mustStop).toBe(false);
  expect(next.progress).toBeGreaterThan(0.7);
  expect(shouldStopForLight(started, traffic, ctx)).toBe(false);
});

test('a red approach light holds a turning vehicle before the box', () => {
  const grid = junctionGrid('road-cross');
  const tile = grid['0,0'][0];
  const traffic = trafficOf([
    makeLight('0,0', 0, 1, 'red', 1),
    makeLight('0,0', 90, 1, 'green', 2),
  ]);
  const started = veh({ type: 'car', x: 0, y: 0, heading: 0, progress: 0, turnIntent: 'right' });
  const ctx = holdContext(started, tile, grid);
  expect(ctx.exitHeading).toBe(90);
  const jumped = clampProgressForRedLight(started, 1.5, traffic, ctx);
  expect(jumped.mustStop).toBe(true);
  const stopped = { ...started, progress: jumped.progress };
  const exit = ctx.exitHeading ?? 0;
  const { bumper, fx, fy } = frontAndLight(stopped, exit, tile.type, '0,0', 0, 1);
  const clearance = boxClearance(bumper, fx, fy, 0, 0, ROAD_INSET_2L);
  expect(clearance).toBeGreaterThan(1);
  expect(clearance).toBeLessThan(16);
});
