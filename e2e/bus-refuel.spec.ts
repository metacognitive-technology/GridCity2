import { expect, test } from '@playwright/test';
import type { GridData, GridTile, Vehicle } from '../src/types';
import {
  BUS_REFUEL_TICKS,
  applyBusRefuelParking,
  findBusBayCells,
  findBusStationRefuelPoint,
  isBusRefuelStall,
} from '../src/bus';

function tile(
  type: GridTile['type'],
  extra: Partial<GridTile> = {},
): GridTile {
  return { type, rotation: 0, ...extra };
}

function stationGrid(): GridData {
  // 2×2 station: terminal on row y=10, bays on y=11. Parking lot south of the bays.
  return {
    '10,10': [
      tile('building-bus-station', {
        part: 'anchor',
        localX: 0,
        localY: 0,
        w: 2,
        h: 2,
      }),
    ],
    '11,10': [
      tile('building-bus-station', {
        part: 'member',
        localX: 1,
        localY: 0,
        w: 2,
        h: 2,
        anchorKey: '10,10',
      }),
    ],
    '10,11': [
      tile('building-bus-station', {
        part: 'member',
        localX: 0,
        localY: 1,
        w: 2,
        h: 2,
        anchorKey: '10,10',
      }),
    ],
    '11,11': [
      tile('building-bus-station', {
        part: 'member',
        localX: 1,
        localY: 1,
        w: 2,
        h: 2,
        anchorKey: '10,10',
      }),
    ],
    '10,12': [
      tile('parking-2x2', {
        part: 'anchor',
        localX: 0,
        localY: 0,
        w: 2,
        h: 2,
      }),
    ],
    '11,12': [
      tile('parking-2x2', {
        part: 'member',
        localX: 1,
        localY: 0,
        w: 2,
        h: 2,
        anchorKey: '10,12',
      }),
    ],
    '10,13': [
      tile('parking-2x2', {
        part: 'member',
        localX: 0,
        localY: 1,
        w: 2,
        h: 2,
        anchorKey: '10,12',
      }),
    ],
    '11,13': [
      tile('parking-2x2', {
        part: 'member',
        localX: 1,
        localY: 1,
        w: 2,
        h: 2,
        anchorKey: '10,12',
      }),
    ],
    '9,11': [tile('road-straight')],
  };
}

function stationOnlyGrid(): GridData {
  const g = stationGrid();
  delete g['10,12'];
  delete g['11,12'];
  delete g['10,13'];
  delete g['11,13'];
  return g;
}

test.describe('bus station refuel stalls', () => {
  test('never targets the terminal office when a parking lot touches the station', () => {
    const grid = stationGrid();
    const dest = findBusStationRefuelPoint('10,10', { x: 0, y: 0 }, grid);
    expect(dest).not.toBeNull();
    expect(dest).not.toEqual({ x: 10, y: 10 });
    expect(dest).not.toEqual({ x: 11, y: 10 });
    expect(isBusRefuelStall(dest!.x, dest!.y, '10,10', grid)).toBe(true);
    const destTiles = grid[`${dest!.x},${dest!.y}`];
    expect(destTiles?.some(t => t.type.startsWith('parking-'))).toBe(true);
  });

  test('falls back to a station bay when there is no parking lot', () => {
    const grid = stationOnlyGrid();
    const dest = findBusStationRefuelPoint('10,10', { x: 0, y: 0 }, grid);
    expect(dest).toEqual({ x: 10, y: 11 });
    const bays = findBusBayCells('10,10', grid);
    expect(bays.map(b => `${b.x},${b.y}`).sort()).toEqual(['10,11', '11,11']);
    expect(isBusRefuelStall(10, 10, '10,10', grid)).toBe(false);
    expect(isBusRefuelStall(10, 11, '10,10', grid)).toBe(true);
  });

  test('any cell of a lot that touches the station is a refuel stall', () => {
    const grid = stationGrid();
    expect(isBusRefuelStall(10, 12, '10,10', grid)).toBe(true);
    expect(isBusRefuelStall(11, 13, '10,10', grid)).toBe(true);
    expect(isBusRefuelStall(9, 11, '10,10', grid)).toBe(false);
  });

  test('parking in a station bay also starts the 20s fuel timer', () => {
    const grid = stationOnlyGrid();
    const bus: Vehicle = {
      id: 'bus-2',
      x: 11,
      y: 11,
      heading: 0,
      lane: 1,
      progress: 0.8,
      color: '#2563eb',
      zIndex: 0,
      type: 'bus',
      isMoving: true,
      destination: { x: 10, y: 10 },
      busPhase: 'to-station',
      busStationKey: '10,10',
      busRoute: ['5,5'],
    };
    const parked = applyBusRefuelParking(bus, grid);
    expect(parked.busPhase).toBe('refueling');
    expect(parked.busRefuelTicks).toBe(20);
    expect(parked.isMoving).toBe(false);
    expect(parked.lastParkingKey).toBe('10,10');
    expect(parked.parkingStallIndex).toBe(1);
  });

  test('parking in the lot starts the 20s fuel timer and stops the bus', () => {
    const grid = stationGrid();
    const bus: Vehicle = {
      id: 'bus-1',
      x: 10,
      y: 12,
      heading: 180,
      lane: 1,
      progress: 0.2,
      color: '#2563eb',
      zIndex: 0,
      type: 'bus',
      isMoving: true,
      destination: { x: 10, y: 10 },
      busPhase: 'to-station',
      busStationKey: '10,10',
      busRoute: ['5,5'],
      randomTurning: true,
    };
    const parked = applyBusRefuelParking(bus, grid);
    expect(parked.busPhase).toBe('refueling');
    expect(parked.busRefuelTicks).toBe(BUS_REFUEL_TICKS);
    expect(parked.busRefuelTicks).toBe(20);
    expect(parked.isMoving).toBe(false);
    expect(parked.destination).toBeNull();
    expect(parked.lastParkingKey).toBe('10,12');
    expect(parked.progress).toBe(0.5);
    expect(parked.randomTurning).toBe(false);
  });
});
