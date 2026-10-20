import type { GridData, GridTile, Point, Vehicle } from './types';

/** Completed route loops before a bus returns to the station for gas. */
export const BUS_LOOPS_BEFORE_REFUEL = 5;
/** Whole seconds of refuel remaining while parked at the station lot. */
export const BUS_REFUEL_TICKS = 20;

const CARDINAL: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

function parseGridKey(key: string | undefined | null): Point | null {
  if (!key) return null;
  const [x, y] = key.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function isBusStationTile(tile: GridTile | undefined | null): boolean {
  return !!tile && tile.type === 'building-bus-station';
}

function isBusStationBayTile(tile: GridTile | undefined | null): boolean {
  return isBusStationTile(tile) && (tile!.localY ?? 0) >= 1;
}

function parkingLotId(tile: GridTile, cellKey: string): string {
  return tile.part === 'member' && tile.anchorKey ? tile.anchorKey : cellKey;
}

function belongsToStation(tile: GridTile, cellKey: string, stationKey: string): boolean {
  if (!isBusStationTile(tile)) return false;
  if (cellKey === stationKey) return true;
  if (tile.anchorKey === stationKey) return true;
  return tile.part !== 'member' && cellKey === stationKey;
}

function stationCellPoints(stationKey: string, grid: GridData): Point[] {
  const cells: Point[] = [];
  for (const [key, tiles] of Object.entries(grid)) {
    const tile = tiles?.find(t => belongsToStation(t, key, stationKey));
    if (!tile) continue;
    const p = parseGridKey(key);
    if (p) cells.push(p);
  }
  return cells;
}

function cellTouchesStation(x: number, y: number, stationCells: Set<string>): boolean {
  if (stationCells.has(`${x},${y}`)) return true;
  for (const [dx, dy] of CARDINAL) {
    if (stationCells.has(`${x + dx},${y + dy}`)) return true;
  }
  return false;
}

/** Parking-lot ids that share an edge (or overlap) with the bus station. */
function parkingLotIdsTouchingStation(stationKey: string, grid: GridData): Set<string> {
  const stationCells = new Set(
    stationCellPoints(stationKey, grid).map(p => `${p.x},${p.y}`),
  );
  const lotIds = new Set<string>();
  if (stationCells.size === 0) return lotIds;
  for (const [key, tiles] of Object.entries(grid)) {
    const parking = tiles?.find(t => t.type.startsWith('parking-'));
    if (!parking) continue;
    const p = parseGridKey(key);
    if (!p) continue;
    if (!cellTouchesStation(p.x, p.y, stationCells)) continue;
    lotIds.add(parkingLotId(parking, key));
  }
  return lotIds;
}

export function findNearestBusStationKey(from: Point, grid: GridData): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  Object.entries(grid).forEach(([key, tiles]) => {
    const top = tiles?.[tiles.length - 1];
    if (!isBusStationTile(top)) return;
    if (top.part === 'member') return;
    const p = parseGridKey(key);
    if (!p) return;
    const d = Math.abs(p.x - from.x) + Math.abs(p.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  });
  if (!best) {
    Object.entries(grid).forEach(([key, tiles]) => {
      const top = tiles?.[tiles.length - 1];
      if (!isBusStationTile(top)) return;
      const p = parseGridKey(key);
      if (!p) return;
      const d = Math.abs(p.x - from.x) + Math.abs(p.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = top.anchorKey || key;
      }
    });
  }
  return best;
}

export function findBusBayCells(
  stationKey: string,
  grid: GridData,
): Array<{ key: string; bayIndex: number; x: number; y: number }> {
  const cells: Array<{ key: string; bayIndex: number; x: number; y: number }> = [];
  for (const [key, tiles] of Object.entries(grid)) {
    for (const t of tiles || []) {
      if (!belongsToStation(t, key, stationKey)) continue;
      if (!isBusStationBayTile(t)) continue;
      const p = parseGridKey(key);
      if (!p) continue;
      cells.push({
        key,
        bayIndex: Math.max(0, Math.min(1, t.localX ?? 0)),
        x: p.x,
        y: p.y,
      });
    }
  }
  return cells.sort((a, b) => a.bayIndex - b.bayIndex);
}

function nearestPoint(from: Point, points: Point[]): Point | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = Math.abs(best.x - from.x) + Math.abs(best.y - from.y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const d = Math.abs(p.x - from.x) + Math.abs(p.y - from.y);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * Driveable stall the bus should park in for gas: a parking-lot cell that
 * touches the station, otherwise a station bay. Never the terminal office.
 */
export function findBusStationRefuelPoint(
  stationKey: string | undefined | null,
  from: Point,
  grid: GridData,
): Point | null {
  const key = stationKey || findNearestBusStationKey(from, grid);
  if (!key) return null;

  const touchingLots = parkingLotIdsTouchingStation(key, grid);
  if (touchingLots.size > 0) {
    const lotCells: Point[] = [];
    for (const [cellKey, tiles] of Object.entries(grid)) {
      const parking = tiles?.find(t => t.type.startsWith('parking-'));
      if (!parking) continue;
      if (!touchingLots.has(parkingLotId(parking, cellKey))) continue;
      const p = parseGridKey(cellKey);
      if (p) lotCells.push(p);
    }
    const lotPick = nearestPoint(from, lotCells);
    if (lotPick) return lotPick;
  }

  const bayPick = nearestPoint(
    from,
    findBusBayCells(key, grid).map(b => ({ x: b.x, y: b.y })),
  );
  if (bayPick) return bayPick;

  return null;
}

/** True if this cell is a legal place to park and start the station fuel timer. */
export function isBusRefuelStall(
  x: number,
  y: number,
  stationKey: string | undefined,
  grid: GridData,
): boolean {
  const cellKey = `${x},${y}`;
  const tiles = grid[cellKey];
  if (!tiles?.length) return false;

  const stationTile = tiles.find(t => t.type === 'building-bus-station');
  if (stationTile) {
    // Only the parking bays are driveable — the terminal office is not a stall.
    if (!isBusStationBayTile(stationTile)) return false;
    const resolved = stationKey || findNearestBusStationKey({ x, y }, grid);
    if (!resolved) return true;
    return belongsToStation(stationTile, cellKey, resolved);
  }

  const parking = tiles.find(t => t.type.startsWith('parking-'));
  if (!parking) return false;
  const resolved = stationKey || findNearestBusStationKey({ x, y }, grid);
  if (!resolved) return false;
  const lotId = parkingLotId(parking, cellKey);
  return parkingLotIdsTouchingStation(resolved, grid).has(lotId);
}

function parkingStallIndexForTile(tile: GridTile | undefined, fallback = 0): number {
  if (!tile) return fallback;
  if (isBusStationBayTile(tile)) {
    return Math.max(0, Math.min(1, tile.localX ?? 0));
  }
  if (tile.type.startsWith('parking-')) {
    if (tile.type === 'parking-4x4' && (tile.localX ?? 0) >= 2) {
      return Math.max(0, Math.min(3, fallback));
    }
    return Math.max(0, Math.min(1, fallback));
  }
  return fallback;
}

/** Snap a bus into a parked refuel state with the 20s timer running. */
export function applyBusRefuelParking(vehicle: Vehicle, grid: GridData): Vehicle {
  const hereKey = `${vehicle.x},${vehicle.y}`;
  const tiles = grid[hereKey] || [];
  const stationTile = tiles.find(t => t.type === 'building-bus-station');
  const parkingTile = tiles.find(t => t.type.startsWith('parking-'));
  const stallTile = isBusStationBayTile(stationTile) ? stationTile : parkingTile || stationTile;
  const lotKey = stallTile
    ? parkingLotId(stallTile, hereKey)
    : vehicle.busStationKey || hereKey;
  return {
    ...vehicle,
    busPhase: 'refueling',
    busRefuelTicks: BUS_REFUEL_TICKS,
    busRefuelAccumMs: 0,
    destination: null,
    isMoving: false,
    turnIntent: null,
    progress: 0.5,
    randomTurning: false,
    lastParkingKey: lotKey,
    parkingStallIndex: parkingStallIndexForTile(stallTile, vehicle.parkingStallIndex ?? 0),
  };
}
