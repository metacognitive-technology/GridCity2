import { LANE_OFFSET_UNIT, TILE_CENTER } from './roadGeometry';
import {
  GridData,
  GridTile,
  TrafficControl,
  TrafficLightPhase,
  TrafficState,
  Vehicle,
  hasEmergencyLights,
} from './types';

export const DEFAULT_TRAFFIC_STATE: TrafficState = {
  stopSignMinDurationSec: 3,
  stopSignSizeScale: 1,
  stoplightSizeScale: 1,
  nextLightId: 1,
  nextSignId: 1,
  controls: {},
  showControls: true,
};

const EDGE_LABELS = ['N', 'E', 'S', 'W'];

export function edgePortLabel(edgePort: number): string {
  return EDGE_LABELS[edgePort] ?? String(edgePort);
}

export const TILE_CONNECTIONS: Record<string, number[]> = {
  'road-straight': [0, 2],
  'road-curve': [0, 3],
  'road-t': [0, 2, 3],
  'road-cross': [0, 1, 2, 3],
  'road-bridge': [0, 2],
  'road-oneway-straight': [0, 2],
  'road-oneway-bridge': [0, 2],
  'road-oneway-curve': [0, 3],
  'road-oneway-curve-reverse': [1, 2],
  'road-4lane-straight': [0, 2],
  'road-4lane-curve': [0, 3],
  'road-4lane-t': [0, 2, 3],
  'road-4lane-cross': [0, 1, 2, 3],
  'road-4lane-bridge': [0, 2],
  'road-transition-2to4': [0, 2],
  'road-roundabout': [0, 1, 2, 3],
  'road-end': [2],
  'road-4lane-end': [2],
  // Driveable bays / lots — full 4-way access (robotaxis exit onto any adjacent road)
  'parking-1x1': [0, 1, 2, 3],
  'parking-1x2': [0, 1, 2, 3],
  'parking-1x3': [0, 1, 2, 3],
  'parking-2x2': [0, 1, 2, 3],
  'parking-2x4': [0, 1, 2, 3],
  'parking-4x4': [0, 1, 2, 3],
  'building-repair-shop': [0, 1, 2, 3],
  'building-hospital': [0, 1, 2, 3],
  'building-taxi-station': [0, 1, 2, 3],
  'building-home': [0, 1, 2, 3],
};

const STRAIGHT_ROAD_TYPES = new Set([
  'road-straight', 'road-bridge', 'road-oneway-straight', 'road-oneway-bridge',
  'road-4lane-straight', 'road-4lane-bridge', 'road-transition-2to4',
]);

export function isRoadTile(type: string): boolean {
  return type.startsWith('road-') || type.startsWith('parking-');
}

export function isStraightRoadTile(type: string): boolean {
  return STRAIGHT_ROAD_TYPES.has(type);
}

/** Road tiles that can host stop signs (straight, T, cross, curve, 2-lane + 4-lane, etc.) */
export function canPlaceStopSignOnTile(type: string): boolean {
  if (!type.startsWith('road-')) return false;
  // Must have connection ports defined (excludes unknown / non-drivable pieces)
  return (TILE_CONNECTIONS[type] || []).length > 0;
}

export function getGroundRoadTile(tiles: GridTile[] | undefined, zIndex = 0): GridTile | undefined {
  if (!tiles?.length) return undefined;
  return tiles.find(t => {
    const isBridge = t.type.includes('bridge');
    return (zIndex === 1 && isBridge) || (zIndex === 0 && !isBridge);
  });
}

/** Ground road tile, or bridge/trestle when that is the only road on the cell */
export function getTrafficRoadTile(tiles: GridTile[] | undefined): GridTile | undefined {
  return getGroundRoadTile(tiles, 0) ?? getGroundRoadTile(tiles, 1);
}

/** Heading (0/90/180/270) of traffic that exits through a world-space edge port */
export function edgePortToHeading(edgePort: number): number {
  return edgePort * 90;
}

/** Exit port for a vehicle traveling with given heading */
export function headingToExitPort(heading: number): number {
  return (heading / 90) % 4;
}

/** Entry port for a vehicle traveling with given heading */
export function headingToEntryPort(heading: number): number {
  return (headingToExitPort(heading) + 2) % 4;
}

/** World-space connection ports for a road tile (straight, T, cross, curve, …) */
export function getRoadWorldPorts(tile: GridTile): number[] {
  const ports = TILE_CONNECTIONS[tile.type] || [];
  const rotSteps = (((tile.rotation % 360) + 360) % 360) / 90;
  return ports.map(p => (p + rotSteps) % 4);
}

/** @deprecated Use getRoadWorldPorts — kept for call-site compatibility */
export function getStraightRoadWorldPorts(tile: GridTile): number[] {
  return getRoadWorldPorts(tile);
}

/**
 * Detect stop-sign placement from click position.
 * Click the approach edge/corner for the travel direction to control.
 * Works on straight roads, T-junctions, and cross intersections.
 */
export function detectStopSignPlacementClick(
  relX: number,
  relY: number,
  tile: GridTile
): number | null {
  const roadPorts = getRoadWorldPorts(tile);
  if (roadPorts.length === 0) return null;

  const cornerMargin = 0.28;
  const edgeMargin = 0.28;

  // Corner hits (NE→N, SE→E, SW→S, NW→W) — distal right-hand side of approach
  const cornerHits: { port: number; hit: boolean }[] = [
    { port: 0, hit: relY < cornerMargin && relX > 1 - cornerMargin },
    { port: 1, hit: relY > 1 - cornerMargin && relX > 1 - cornerMargin },
    { port: 2, hit: relY > 1 - cornerMargin && relX < cornerMargin },
    { port: 3, hit: relY < cornerMargin && relX < cornerMargin },
  ];
  for (const { port, hit } of cornerHits) {
    if (hit && roadPorts.includes(port)) return port;
  }

  // Edge hits — more forgiving on multi-leg junctions so T/cross are easy to click
  const edgeHits: { port: number; hit: boolean; depth: number }[] = [
    { port: 0, hit: relY < edgeMargin, depth: relY },
    { port: 2, hit: relY > 1 - edgeMargin, depth: 1 - relY },
    { port: 3, hit: relX < edgeMargin, depth: relX },
    { port: 1, hit: relX > 1 - edgeMargin, depth: 1 - relX },
  ];
  // Prefer the edge the click is closest to when near a corner of a multi-port tile
  let best: { port: number; depth: number } | null = null;
  for (const { port, hit, depth } of edgeHits) {
    if (!hit || !roadPorts.includes(port)) continue;
    if (!best || depth < best.depth) best = { port, depth };
  }
  if (best) return best.port;

  return null;
}

export function getStopSignsAt(gridKey: string, traffic: TrafficState): TrafficControl[] {
  return Object.values(traffic.controls).filter(
    c => c.kind === 'stop-sign' && c.gridKey === gridKey
  );
}

export function findStopSignAt(
  gridKey: string,
  exitPort: number,
  traffic: TrafficState
): Extract<TrafficControl, { kind: 'stop-sign' }> | undefined {
  return Object.values(traffic.controls).find(
    c => c.kind === 'stop-sign' && c.gridKey === gridKey && c.edgePort === exitPort
  ) as Extract<TrafficControl, { kind: 'stop-sign' }> | undefined;
}

export function getStoplightsAt(gridKey: string, traffic: TrafficState): TrafficControl[] {
  return Object.values(traffic.controls).filter(
    c => c.kind === 'stoplight' && c.gridKey === gridKey
  );
}

export function findStopSignForVehicle(
  gridKey: string,
  heading: number,
  lane: number,
  tile: GridTile,
  traffic: TrafficState
): TrafficControl | undefined {
  const exitPort = headingToExitPort(heading);
  return getStopSignsAt(gridKey, traffic).find(sign => {
    if (sign.kind !== 'stop-sign') return false;
    return headingToExitPort(heading) === sign.edgePort;
  });
}

/** Normalize heading to 0 / 90 / 180 / 270 */
export function normalizeHeading(heading: number): number {
  const h = ((Math.round(heading / 90) % 4) + 4) % 4;
  return h * 90;
}

/** N/S share an axis; E/W share the other (for coordinated light groups). */
export function headingAxis(heading: number): 'ns' | 'ew' {
  const h = normalizeHeading(heading);
  return h === 0 || h === 180 ? 'ns' : 'ew';
}

/**
 * Find the stoplight that governs this vehicle on this tile.
 * Prefers exact heading+lane match; falls back to any light for the same
 * travel heading so a single signal still stops all lanes (incl. robotaxis
 * that may not sit on the painted lane after leaving a bay).
 */
export function findStoplightForVehicle(
  gridKey: string,
  heading: number,
  lane: number,
  traffic: TrafficState
): Extract<TrafficControl, { kind: 'stoplight' }> | undefined {
  const h = normalizeHeading(heading);
  const lights = getStoplightsAt(gridKey, traffic).filter(
    (light): light is Extract<TrafficControl, { kind: 'stoplight' }> =>
      light.kind === 'stoplight' && normalizeHeading(light.heading) === h
  );
  if (!lights.length) return undefined;
  const exact = lights.find(light => Math.abs(light.lane - lane) < 0.01);
  return exact ?? lights[0];
}

/** Progress (0–1) at which a vehicle has reached the stop line for this light */
export function approachProgressForLight(
  light: Extract<TrafficControl, { kind: 'stoplight' }>
): number {
  const margin = 6;
  const h = normalizeHeading(light.heading);
  const pos = getStoplightPosition(h, light.lane, 0);
  // Stop line is near the light, which sits toward the exit of this travel direction.
  if (h === 0) return Math.max(0, Math.min(0.98, (64 - pos.y - margin) / 64));
  if (h === 180) return Math.max(0, Math.min(0.98, (pos.y - margin) / 64));
  if (h === 90) return Math.max(0, Math.min(0.98, 0.5 + (pos.x - TILE_CENTER - margin) / 64));
  if (h === 270) return Math.max(0, Math.min(0.98, 0.5 - (pos.x - TILE_CENTER + margin) / 64));
  return 0.65;
}

/** Lanes available for stoplight placement on a road tile */
export function getAvailableLightSlots(tile: GridTile): { heading: number; lane: number }[] {
  const type = tile.type;
  const rot = tile.rotation;
  const ports = TILE_CONNECTIONS[type] || [];
  const slots: { heading: number; lane: number }[] = [];
  const is4Lane = type.includes('4lane');
  const isOneWay = type.includes('oneway');

  for (const port of ports) {
    const worldPort = (port + rot / 90) % 4;
    const heading = worldPort * 90;
    const exitPort = headingToExitPort(heading);

    if (isOneWay) {
      slots.push({ heading, lane: 1 });
      continue;
    }

    if (is4Lane) {
      const lanes = heading === 0 || heading === 180
        ? [FOUR_LANE_INNER, FOUR_LANE_OUTER]
        : [-FOUR_LANE_INNER, -FOUR_LANE_OUTER];
      for (const lane of lanes) {
        slots.push({ heading, lane });
      }
    } else {
      slots.push({ heading, lane: 1 });
      slots.push({ heading, lane: -1 });
    }
    void exitPort;
  }
  return slots;
}

const FOUR_LANE_INNER = 1;
const FOUR_LANE_OUTER = 2.5;

/** Detect which world-space edge of the cell was clicked (0=N, 1=E, 2=S, 3=W) */
export function detectEdgeClick(relX: number, relY: number, _tileRotation?: number): number | null {
  const margin = 0.22;
  if (relY < margin) return 0;
  if (relY > 1 - margin) return 2;
  if (relX < margin) return 3;
  if (relX > 1 - margin) return 1;
  return null;
}

/** Detect stoplight slot from click position on tile */
export function detectLightSlotClick(
  relX: number,
  relY: number,
  tile: GridTile
): { heading: number; lane: number } | null {
  const slots = getAvailableLightSlots(tile);
  if (!slots.length) return null;

  let best: { heading: number; lane: number } | null = null;
  let bestDist = Infinity;

  for (const slot of slots) {
    const pos = getStoplightPosition(slot.heading, slot.lane, tile.rotation);
    const dx = relX - pos.x / 64;
    const dy = relY - pos.y / 64;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = slot;
    }
  }
  return bestDist < 0.12 ? best : null;
}

/** Position of stoplight in tile-local pixels (0-64) */
export function getStoplightPosition(heading: number, lane: number, tileRotation: number): { x: number; y: number } {
  const laneOffset = lane * LANE_OFFSET_UNIT;
  const rotRad = ((heading - 90) * Math.PI) / 180;
  const rightRad = (heading * Math.PI) / 180;
  const cx = TILE_CENTER;
  const cy = TILE_CENTER;
  const forward = 28;
  const fx = Math.cos(rotRad) * forward;
  const fy = Math.sin(rotRad) * forward;
  const rx = Math.cos(rightRad) * laneOffset;
  const ry = Math.sin(rightRad) * laneOffset;
  const lx = cx + fx + rx;
  const ly = cy + fy + ry;
  void tileRotation;
  return { x: lx, y: ly };
}

/**
 * Position of stop sign in tile-local pixels (0–64).
 * Placed in the margin at the distal corner outside the right-hand lane for that travel direction.
 * N→NE, E→SE, S→SW, W→NW (world-space exit port).
 */
export function getStopSignPosition(edgePort: number, _tileRotation = 0): { x: number; y: number } {
  const margin = 7;
  switch (edgePort) {
    case 0: return { x: 64 - margin, y: margin };
    case 1: return { x: 64 - margin, y: 64 - margin };
    case 2: return { x: margin, y: 64 - margin };
    case 3: return { x: margin, y: margin };
    default: return { x: 32, y: 32 };
  }
}

export function cycleLightPhase(phase: TrafficLightPhase): TrafficLightPhase {
  if (phase === 'red') return 'green';
  if (phase === 'green') return 'yellow';
  return 'red';
}

export function phaseDurationMs(control: TrafficControl, phase: TrafficLightPhase): number {
  if (control.kind !== 'stoplight') return 3000;
  if (phase === 'red') return control.redMs;
  if (phase === 'yellow') return control.yellowMs;
  return control.greenMs;
}

export function advanceLightPhase(control: TrafficControl, now = Date.now()): TrafficControl | null {
  if (control.kind !== 'stoplight' || control.manualOnly) return null;
  const elapsed = now - control.phaseStartedAt;
  const dur = phaseDurationMs(control, control.phase);
  if (elapsed < dur) return null;
  const next = cycleLightPhase(control.phase);
  return { ...control, phase: next, phaseStartedAt: now };
}

/**
 * Coordinate phases for a linked light group.
 * Lights on the same axis (N+S, or E+W) share phase so opposite directions
 * on a bidirectional road go green together. Perpendicular axes are offset
 * by half a cycle (when N/S is green, E/W is red).
 */
/** Stable map key — must include kind so stop-sign #1 and stoplight #1 do not collide. */
export function trafficControlKey(c: Pick<TrafficControl, 'kind' | 'id'>): string {
  return `${c.kind}:${c.id}`;
}

export function coordinateLightGroup(
  controls: TrafficControl[],
  groupId: string
): TrafficControl[] {
  const lights = controls.filter(c => c.kind === 'stoplight') as Extract<TrafficControl, { kind: 'stoplight' }>[];
  const grouped = lights.filter(l => l.groupId === groupId);
  if (grouped.length < 2) return controls;

  const axes = [...new Set(grouped.map(l => headingAxis(l.heading)))];
  // Need at least two axes (or still sync timings even if same-axis only)
  const now = Date.now();
  const result: Record<string, TrafficControl> = Object.fromEntries(
    controls.map(c => [trafficControlKey(c), c])
  );

  const primary = grouped[0];
  const primaryAxis = headingAxis(primary.heading);
  const totalCycle = primary.redMs + primary.yellowMs + primary.greenMs;
  const hasPerp = axes.length >= 2;

  grouped.forEach(light => {
    const sameAxis = headingAxis(light.heading) === primaryAxis;
    // Opposite direction on the same road = same phase; perpendicular = offset
    const offset = sameAxis || !hasPerp ? 0 : Math.floor(totalCycle / 2);
    result[trafficControlKey(light)] = {
      ...light,
      groupId,
      manualOnly: false,
      redMs: primary.redMs,
      yellowMs: primary.yellowMs,
      greenMs: primary.greenMs,
      phase: sameAxis || !hasPerp ? 'green' : 'red',
      phaseStartedAt: now - offset,
    };
  });
  return Object.values(result);
}

export function getLightGroupSize(traffic: TrafficState, groupId: string): number {
  return Object.values(traffic.controls).filter(
    c => c.kind === 'stoplight' && c.groupId === groupId
  ).length;
}

export function unlinkStoplights(
  controls: TrafficState['controls'],
  ids: Iterable<string>
): TrafficState['controls'] {
  const next = { ...controls };
  for (const id of ids) {
    const c = next[id];
    if (c?.kind === 'stoplight' && c.groupId) {
      next[id] = { ...c, groupId: undefined };
    }
  }
  return next;
}

function isVehicleActivelyMoving(vehicle: Vehicle): boolean {
  return !!(vehicle.isMoving || vehicle.stepForward || vehicle.stepBackward);
}

function hasCompletedStopSignWait(vehicle: Vehicle): boolean {
  if (vehicle.satisfiedStopSignKey) return true;
  if (vehicle.trafficStopReason !== 'stop-sign' || !vehicle.trafficStopUntil) return false;
  return Date.now() >= vehicle.trafficStopUntil;
}

function isStillInStopSignWait(vehicle: Vehicle): boolean {
  return (
    vehicle.trafficStopReason === 'stop-sign' &&
    vehicle.trafficStopUntil != null &&
    Date.now() < vehicle.trafficStopUntil
  );
}

/** Check if another vehicle has right-of-way at a stop sign */
export function hasConflictingTraffic(
  vehicle: Vehicle,
  gridKey: string,
  allVehicles: Record<string, Vehicle>,
  traffic: TrafficState,
  grid: GridData
): boolean {
  const [vx, vy] = gridKey.split(',').map(Number);
  const myHeading = vehicle.heading;
  const myWaitComplete = hasCompletedStopSignWait(vehicle);

  for (const other of Object.values(allVehicles)) {
    if (other.id === vehicle.id) continue;
    if (other.type === 'train') continue;
    const otherKey = `${other.x},${other.y}`;
    const dist = Math.abs(other.x - vx) + Math.abs(other.y - vy);
    if (dist > 2) continue;

    const tiles = grid[otherKey];
    const tile = getGroundRoadTile(tiles, other.zIndex);
    if (!tile) continue;

    const sameTile = otherKey === gridKey;
    const pathsWouldCross =
      sameTile
        ? other.heading !== myHeading && (other.progress > 0.3 || vehicle.progress > 0.3)
        : other.progress > 0.15 && pathsCross(vehicle, other, vx, vy);

    if (!pathsWouldCross) continue;

    if (isVehicleActivelyMoving(other)) return true;

    const otherSign = findStopSignForVehicle(otherKey, other.heading, other.lane, tile, traffic);
    if (!otherSign) continue;

    if (isStillInStopSignWait(other)) return true;

    if (hasCompletedStopSignWait(other)) {
      if (!myWaitComplete) continue;
      if (vehicle.id > other.id) return true;
      continue;
    }

    return true;
  }
  return false;
}

function pathsCross(a: Vehicle, b: Vehicle, tx: number, ty: number): boolean {
  const aExit = headingToExitPort(a.heading);
  const bExit = headingToExitPort(b.heading);
  if (a.x === tx && a.y === ty && b.x === tx && b.y === ty) {
    return aExit !== bExit;
  }
  if (a.x === tx && a.y === ty) {
    return Math.abs(a.heading - b.heading) !== 180;
  }
  if (b.x === tx && b.y === ty) {
    return Math.abs(a.heading - b.heading) !== 180;
  }
  return false;
}

export function shouldStopForSign(
  vehicle: Vehicle,
  tile: GridTile,
  traffic: TrafficState,
  allVehicles: Record<string, Vehicle>,
  grid: GridData
): { stop: boolean; minUntil?: number } {
  const key = `${vehicle.x},${vehicle.y}`;
  const sign = findStopSignForVehicle(key, vehicle.heading, vehicle.lane, tile, traffic);
  if (!sign || sign.kind !== 'stop-sign') return { stop: false };

  if (vehicle.satisfiedStopSignKey === `${key}:${sign.id}`) return { stop: false };

  if (vehicle.progress < 0.72) return { stop: false };

  const minMs = traffic.stopSignMinDurationSec * 1000;
  const now = Date.now();

  if (vehicle.trafficStopReason === 'stop-sign' && vehicle.trafficStopUntil) {
    const conflict = hasConflictingTraffic(vehicle, key, allVehicles, traffic, grid);
    if (conflict) return { stop: true, minUntil: vehicle.trafficStopUntil };
    if (now < vehicle.trafficStopUntil) return { stop: true, minUntil: vehicle.trafficStopUntil };
    return { stop: false };
  }

  return {
    stop: true,
    minUntil: now + minMs,
  };
}

/**
 * Emergency mode: fire / police / ambulance / tow with light bar on
 * (undefined emergencyLightsOn defaults to on).
 * Grants red/yellow ignore, vehicle pass-through, and wrong-side overtaking.
 */
export function isEmergencyMode(vehicle: Vehicle): boolean {
  if (!hasEmergencyLights(vehicle.type)) return false;
  // Match Vehicle.tsx: undefined means lights are on
  return vehicle.emergencyLightsOn !== false;
}

/** @deprecated Prefer isEmergencyMode — same predicate */
export function canIgnoreTrafficLights(vehicle: Vehicle): boolean {
  return isEmergencyMode(vehicle);
}

/** Correct-side lane for this road (right of center relative to heading). */
export function getEmergencyHomeLane(lane: number, is4Lane: boolean): number {
  if (is4Lane) {
    const mag = Math.abs(lane) >= 2 ? 2.5 : 1;
    return mag;
  }
  return 1;
}

/** Opposite (wrong-side) lane used to pass slower traffic. */
export function getEmergencyPassLane(lane: number, is4Lane: boolean): number {
  return -getEmergencyHomeLane(lane, is4Lane);
}

export function shouldStopForLight(
  vehicle: Vehicle,
  traffic: TrafficState
): boolean {
  // Only emergency vehicles with lights on may run red/yellow
  // Robotaxis and all other vehicles MUST stop
  if (isEmergencyMode(vehicle)) return false;

  const key = `${vehicle.x},${vehicle.y}`;
  const light = findStoplightForVehicle(key, vehicle.heading, vehicle.lane, traffic);
  if (!light) return false;
  if (normalizeHeading(light.heading) !== normalizeHeading(vehicle.heading)) return false;
  if (vehicle.progress < approachProgressForLight(light)) return false;
  // Still enforce until the vehicle actually leaves the tile
  if (vehicle.progress >= 1) return false;
  return light.phase === 'red' || light.phase === 'yellow';
}

/**
 * Clamp a proposed progress so the vehicle cannot jump over a red/yellow stop line
 * in a single frame (large deltaTime / high speed). Returns clamped progress and
 * whether the vehicle must hard-stop at the line.
 */
export function clampProgressForRedLight(
  vehicle: Vehicle,
  targetProgress: number,
  traffic: TrafficState
): { progress: number; mustStop: boolean } {
  if (isEmergencyMode(vehicle)) return { progress: targetProgress, mustStop: false };
  if (targetProgress <= vehicle.progress) return { progress: targetProgress, mustStop: false };

  const key = `${vehicle.x},${vehicle.y}`;
  const light = findStoplightForVehicle(key, vehicle.heading, vehicle.lane, traffic);
  if (!light) return { progress: targetProgress, mustStop: false };
  if (light.phase !== 'red' && light.phase !== 'yellow') {
    return { progress: targetProgress, mustStop: false };
  }

  const stopAt = approachProgressForLight(light);
  // Approaching or already at the line: do not pass stopAt while red/yellow
  if (vehicle.progress <= stopAt + 1e-4) {
    if (targetProgress > stopAt) {
      return { progress: stopAt, mustStop: true };
    }
  } else if (vehicle.progress < 0.995) {
    // Already past the painted line but still on tile — hold position on red/yellow
    return { progress: vehicle.progress, mustStop: true };
  }
  return { progress: targetProgress, mustStop: false };
}

export function createStopSign(gridKey: string, edgePort: number, id: number, lane?: number): TrafficControl {
  return {
    kind: 'stop-sign',
    id,
    gridKey,
    edgePort,
    lane,
  };
}

export function createStoplight(
  gridKey: string,
  heading: number,
  lane: number,
  id: number
): TrafficControl {
  const now = Date.now();
  return {
    kind: 'stoplight',
    id,
    gridKey,
    heading: normalizeHeading(heading),
    lane,
    phase: 'red',
    manualOnly: false,
    redMs: 5000,
    yellowMs: 2000,
    greenMs: 5000,
    phaseStartedAt: now,
  };
}

export function normalizeTraffic(raw: Partial<TrafficState> | null | undefined): TrafficState {
  if (!raw) return { ...DEFAULT_TRAFFIC_STATE, controls: {} };

  let nextSignId = raw.nextSignId ?? 1;
  let nextLightId = raw.nextLightId ?? 1;
  const controls: TrafficState['controls'] = {};

  // Collect first so we can re-key legacy plain-numeric keys without collisions.
  // Historically both stop-signs and stoplights used String(id) as the map key while
  // keeping independent id counters — the later write wiped the earlier control.
  const entries = Object.entries(raw.controls ?? {});
  for (const [, c] of entries) {
    if (!c || typeof c !== 'object') continue;
    if (c.kind === 'stop-sign') {
      const id =
        typeof c.id === 'number' && Number.isFinite(c.id) ? c.id : nextSignId++;
      nextSignId = Math.max(nextSignId, id + 1);
      const sign: TrafficControl = { ...c, kind: 'stop-sign', id };
      controls[trafficControlKey(sign)] = sign;
    } else if (c.kind === 'stoplight') {
      const id =
        typeof c.id === 'number' && Number.isFinite(c.id) ? c.id : nextLightId++;
      nextLightId = Math.max(nextLightId, id + 1);
      const light: TrafficControl = {
        ...c,
        kind: 'stoplight',
        id,
        heading: normalizeHeading(c.heading ?? 0),
        lane: typeof c.lane === 'number' ? c.lane : 1,
        phase: c.phase === 'green' || c.phase === 'yellow' || c.phase === 'red' ? c.phase : 'red',
        manualOnly: !!c.manualOnly,
        redMs: typeof c.redMs === 'number' ? c.redMs : 5000,
        yellowMs: typeof c.yellowMs === 'number' ? c.yellowMs : 2000,
        greenMs: typeof c.greenMs === 'number' ? c.greenMs : 5000,
        phaseStartedAt: typeof c.phaseStartedAt === 'number' ? c.phaseStartedAt : Date.now(),
      };
      controls[trafficControlKey(light)] = light;
    }
  }

  return {
    stopSignMinDurationSec: raw.stopSignMinDurationSec ?? 3,
    stopSignSizeScale: raw.stopSignSizeScale ?? 1,
    stoplightSizeScale: raw.stoplightSizeScale ?? 1,
    nextLightId,
    nextSignId,
    controls,
    showControls: raw.showControls !== false,
  };
}