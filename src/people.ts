/**
 * Citizens, families, and vehicle seating helpers for Grid City.
 */

import type {
  ActiveTaxiRide,
  BuildingConfig,
  EconomyState,
  GridData,
  Person,
  Family,
  PersonLocation,
  PersonSex,
  PersonActivity,
  PersonTravelIntent,
  PersonScheduleEntry,
  TravelPurpose,
  TravelTransport,
  Vehicle,
  VehicleType,
  Point,
  TrafficState,
  GridTile,
} from './types';
import { isRoadTile, getTrafficRoadTile } from './traffic';

// PersonActivity / TravelPurpose used by travel helpers

/** 1 year of age = 1 hour of wall-clock time */
export const MS_PER_AGE_YEAR = 60 * 60 * 1000;

const FIRST_NAMES_M = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles',
  'Daniel', 'Matthew', 'Anthony', 'Mark', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kevin', 'Brian',
  'George', 'Edward', 'Ronald', 'Timothy', 'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas',
];

const FIRST_NAMES_F = [
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle',
  'Dorothy', 'Carol', 'Amanda', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Sharon', 'Laura', 'Cynthia',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Max passengers (excluding driver) by vehicle type */
export function getMaxPassengers(type?: VehicleType | string): number {
  switch (type) {
    case 'bus':
      return 24;
    case 'train':
      return 48;
    case 'taxi':
      // Robotaxi: no human driver; all seats are passenger seats
      return 4;
    case 'car':
    case undefined:
      return 3;
    case 'semi':
      return 1;
    case 'ambulance':
      return 2;
    case 'fire-truck':
      return 3;
    case 'police':
      return 2;
    case 'tow-truck':
      return 1;
    default:
      return 3;
  }
}

export function getVehicleCapacity(type?: VehicleType | string): number {
  // Robotaxis have no human driver seat
  if (type === 'taxi') return getMaxPassengers(type);
  return 1 + getMaxPassengers(type); // driver + passengers
}

export function advancePersonAge(person: Person, now: number): Person {
  const last = person.ageUpdatedAt || now;
  const elapsed = Math.max(0, now - last);
  if (elapsed < 1000) return person;
  const years = person.ageYears + elapsed / MS_PER_AGE_YEAR;
  return {
    ...person,
    ageYears: Math.min(100, years),
    ageUpdatedAt: now,
  };
}

export function formatAge(ageYears: number): string {
  if (ageYears < 1) return `${Math.floor(ageYears * 12)}mo`;
  return `${Math.floor(ageYears)}y`;
}

export function personDisplayName(p: Person): string {
  return `${p.firstName} ${p.lastName}`;
}

/** Count people who have this building as their assigned workplace (roster). */
export function countEmployeesAssignedToBuilding(
  people: Record<string, Person> | undefined,
  buildingKey: string,
): number {
  if (!people || !buildingKey) return 0;
  return Object.values(people).filter(p => p.workplaceKey === buildingKey).length;
}

/**
 * Count employees actually present at the building (on-site).
 * Production staffing uses this — assigned people still commuting do not count.
 */
export function countEmployeesAtBuilding(
  people: Record<string, Person> | undefined,
  buildingKey: string,
): number {
  if (!people || !buildingKey) return 0;
  return Object.values(people).filter(p => {
    if (p.workplaceKey !== buildingKey) return false;
    if (p.location.kind === 'building' && p.location.buildingKey === buildingKey) return true;
    // Arrived and standing outside workplace still counts as on-site
    if (
      p.location.kind === 'outdoor' &&
      p.location.atKey === buildingKey &&
      (p.activity === 'working' || !p.travelIntent)
    ) {
      return true;
    }
    return false;
  }).length;
}

/**
 * Assign or clear workplace for a set of people.
 * Existing people keep their current map location and are given a work trip intent
 * so they must travel there. They are not teleported or used for production until present.
 */
export function assignPeopleWorkplace(
  people: Record<string, Person>,
  personIds: Iterable<string>,
  workplaceKey: string | undefined,
  opts?: { now?: number },
): Record<string, Person> {
  const now = opts?.now ?? Date.now();
  const next = { ...people };
  for (const id of personIds) {
    const p = next[id];
    if (!p) continue;
    if (!workplaceKey) {
      next[id] = {
        ...p,
        workplaceKey: undefined,
        // Drop an in-progress commute to this job
        travelIntent:
          p.travelIntent?.purpose === 'work' ? undefined : p.travelIntent,
      };
      continue;
    }

    // Already on-site at this workplace — just confirm assignment / working state
    if (
      p.location.kind === 'building' &&
      p.location.buildingKey === workplaceKey
    ) {
      next[id] = {
        ...p,
        workplaceKey,
        activity: 'working',
        activityUntil: now + 45_000 + Math.random() * 30_000,
        travelIntent: undefined,
      };
      continue;
    }

    // Already exists somewhere on the grid: assign job and queue travel — never teleport
    next[id] = {
      ...p,
      workplaceKey,
      travelIntent: { purpose: 'work', destinationKey: workplaceKey },
      // Leave current location alone; force sim to re-evaluate so they beginTravel
      activity:
        p.location.kind === 'vehicle'
          ? p.activity === 'seeking_care'
            ? 'seeking_care'
            : 'commuting'
          : p.activity === 'working' || p.activity === 'shopping' || p.activity === 'in_care'
            ? 'idle'
            : p.activity || 'idle',
      activityUntil: now,
    };
  }
  return next;
}

/** Create a single person (for People panel CRUD). */
export function createPerson(opts: {
  firstName: string;
  lastName: string;
  sex: PersonSex;
  ageYears: number;
  homeKey: string;
  familyId?: string;
  workplaceKey?: string;
  money?: number;
  health?: Person['health'];
  now?: number;
  /**
   * When true (default if workplace set on create), brand-new people with no prior
   * map presence may start already at their workplace.
   */
  placeAtWorkplaceIfNew?: boolean;
}): Person {
  const now = opts.now ?? Date.now();
  const familyId = opts.familyId || uid('fam');
  const placeAtWork =
    !!opts.workplaceKey && opts.placeAtWorkplaceIfNew !== false;
  const base: Person = {
    id: uid('person'),
    firstName: opts.firstName.trim() || 'Citizen',
    lastName: opts.lastName.trim() || 'Doe',
    ageYears: Math.max(0, Math.min(100, opts.ageYears)),
    ageUpdatedAt: now,
    sex: opts.sex,
    familyId,
    homeKey: opts.homeKey,
    workplaceKey: opts.workplaceKey,
    location: placeAtWork
      ? { kind: 'building', buildingKey: opts.workplaceKey! }
      : { kind: 'home', homeKey: opts.homeKey },
    health: opts.health || 'healthy',
    money: opts.money ?? 50,
    activity: placeAtWork ? 'working' : 'home',
    activityUntil: placeAtWork ? now + 45_000 : now + 5000,
    scheduleMode: 'auto',
  };
  base.schedule = generatePersonSchedule(base);
  return base;
}

export function randomFirstName(sex: PersonSex): string {
  return pick(sex === 'm' ? FIRST_NAMES_M : FIRST_NAMES_F);
}

export function randomLastName(): string {
  return pick(LAST_NAMES);
}

export function isAdult(p: Person): boolean {
  return p.ageYears >= 18;
}

export function isChild(p: Person): boolean {
  return p.ageYears < 18;
}

export function isWorkingAge(p: Person): boolean {
  return p.ageYears >= 18 && p.ageYears < 65;
}

export function locationLabel(loc: PersonLocation): string {
  switch (loc.kind) {
    case 'home':
      return `Home ${loc.homeKey}`;
    case 'building':
      return `Building ${loc.buildingKey}`;
    case 'vehicle':
      return loc.seat === 'driver' ? `Driving ${loc.vehicleId.slice(0, 6)}` : `Passenger ${loc.vehicleId.slice(0, 6)}`;
    case 'tile':
      return `At ${loc.x},${loc.y}`;
    case 'outdoor':
      return `Outside ${loc.atKey}`;
    case 'walking':
      return loc.crossing
        ? `Crossing ${Math.floor(loc.x)},${Math.floor(loc.y)}`
        : `Walking ${loc.x.toFixed(1)},${loc.y.toFixed(1)}`;
    default:
      return 'Unknown';
  }
}

// ─── Map positions / outdoor standing / sidewalk walking ───────────────────

const DIRS4: Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function topTile(grid: GridData, key: string): GridTile | undefined {
  const tiles = grid[key];
  if (!tiles?.length) return undefined;
  return tiles[tiles.length - 1];
}

function isBuildingLike(type: string | undefined): boolean {
  if (!type) return false;
  return type.startsWith('building-') || type.startsWith('parking-');
}

function isBusStopTile(type: string | undefined): boolean {
  return type === 'road-bus-stop' || type === 'road-4lane-bus-stop';
}

/** True if cell is road (incl. bus stops / crossings). */
function cellIsRoad(grid: GridData, x: number, y: number): boolean {
  const t = topTile(grid, `${x},${y}`);
  if (!t) return false;
  return isRoadTile(t.type) || t.type === 'rail-road-crossing' || isBusStopTile(t.type);
}

/** True if cell is a building or home footprint (not grass/empty). */
function cellIsBuilding(grid: GridData, x: number, y: number): boolean {
  const t = topTile(grid, `${x},${y}`);
  if (!t) return false;
  return isBuildingLike(t.type) || isResidentialHomeType(t.type);
}

/** Nearest road neighbor of a building/home/bus-stop key. */
export function findNearestRoadNeighbor(
  key: string,
  grid: GridData,
): { roadKey: string; dx: number; dy: number } | null {
  const p = parseKey(key);
  if (!p) return null;
  // Prefer orthogonal adjacent roads
  for (const d of DIRS4) {
    const nx = p.x + d.x;
    const ny = p.y + d.y;
    if (cellIsRoad(grid, nx, ny)) {
      return { roadKey: `${nx},${ny}`, dx: d.x, dy: d.y };
    }
  }
  // Multi-tile buildings: search around a small radius
  for (let r = 2; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        if (cellIsRoad(grid, p.x + dx, p.y + dy)) {
          return {
            roadKey: `${p.x + dx},${p.y + dy}`,
            dx: Math.sign(dx),
            dy: Math.sign(dy),
          };
        }
      }
    }
  }
  return null;
}

/**
 * Continuous grid position just outside a building/home/bus-stop, facing the road.
 * Multiple people at the same key fan out slightly via stackIndex.
 */
export function outdoorStandPosition(
  atKey: string,
  grid: GridData,
  stackIndex = 0,
): { x: number; y: number; ox: number; oy: number } {
  const p = parseKey(atKey) || { x: 0, y: 0 };
  const road = findNearestRoadNeighbor(atKey, grid);
  // Fan out along the curb perpendicular to the road direction
  const fan = ((stackIndex % 5) - 2) * 0.12;
  if (road) {
    // Stand on building edge toward the road (not in the street)
    const ox = 0.5 + road.dx * 0.38 + (road.dy !== 0 ? fan : 0);
    const oy = 0.5 + road.dy * 0.38 + (road.dx !== 0 ? fan : 0);
    return { x: p.x + ox, y: p.y + oy, ox, oy };
  }
  // No road: stand south of center
  const ox = 0.5 + fan;
  const oy = 0.78;
  return { x: p.x + ox, y: p.y + oy, ox, oy };
}

/** Sidewalk position on a road tile (curb, not center lane). side: 0=N 1=E 2=S 3=W */
export function sidewalkPosition(
  tx: number,
  ty: number,
  side: number,
  along = 0.5,
): { x: number; y: number } {
  const s = ((side % 4) + 4) % 4;
  const a = Math.max(0.12, Math.min(0.88, along));
  if (s === 0) return { x: tx + a, y: ty + 0.12 }; // north curb
  if (s === 1) return { x: tx + 0.88, y: ty + a }; // east
  if (s === 2) return { x: tx + a, y: ty + 0.88 }; // south
  return { x: tx + 0.12, y: ty + a }; // west
}

/** Which curb of a road cell is closest to a world point (continuous grid coords). */
export function nearestSidewalkSide(tx: number, ty: number, wx: number, wy: number): number {
  const lx = wx - tx;
  const ly = wy - ty;
  const dists = [ly, 1 - lx, 1 - ly, lx]; // N E S W distance to edge
  let best = 0;
  let bestD = dists[0];
  for (let i = 1; i < 4; i++) {
    if (dists[i] < bestD) {
      bestD = dists[i];
      best = i;
    }
  }
  return best;
}

/**
 * Build a PersonLocation for placing a person on a grid cell (map place mode).
 * Roads → sidewalk curb nearest the click. Homes → at home. Buildings → outdoor.
 */
export function locationForMapPlacement(
  gridX: number,
  gridY: number,
  grid: GridData,
  opts?: { relX?: number; relY?: number; stackIndex?: number },
): PersonLocation {
  const key = `${gridX},${gridY}`;
  const tiles = grid[key];
  const top = tiles?.length ? tiles[tiles.length - 1] : undefined;
  const stack = opts?.stackIndex ?? 0;
  const relX = opts?.relX ?? 0.5;
  const relY = opts?.relY ?? 0.5;
  const fan = ((stack % 5) - 2) * 0.08;

  if (top && isResidentialHomeType(top.type)) {
    const homeKey = resolveHomeKeyFromTile(top, key);
    return { kind: 'home', homeKey };
  }

  if (top && top.type.startsWith('building-')) {
    const bKey = top.part === 'member' ? top.anchorKey || key : key;
    return toOutdoorLocation(bKey, grid, stack);
  }

  const isRoad =
    !!top &&
    (top.type.startsWith('road') ||
      top.type === 'rail-road-crossing' ||
      top.type.startsWith('parking-'));

  if (isRoad && top) {
    // Side of road nearest the click (sidewalk / curb)
    const side = nearestSidewalkSide(gridX, gridY, gridX + relX, gridY + relY);
    const alongBase = side === 0 || side === 2 ? relX : relY;
    const along = Math.max(0.12, Math.min(0.88, alongBase + fan));
    const sp = sidewalkPosition(gridX, gridY, side, along);
    return {
      kind: 'outdoor',
      atKey: key,
      ox: sp.x - gridX,
      oy: sp.y - gridY,
    };
  }

  // Grass / empty / other: stand near click point within the tile
  const ox = Math.max(0.15, Math.min(0.85, relX + fan * 0.5));
  const oy = Math.max(0.15, Math.min(0.85, relY));
  return { kind: 'outdoor', atKey: key, ox, oy };
}

/**
 * Facing direction (degrees, 0=N) for person 3D view / walk direction.
 */
export function getPersonFacingHeading(
  person: Person,
  grid: GridData,
  vehicles?: Record<string, Vehicle>,
): number {
  if (person.location.kind === 'vehicle' && vehicles) {
    const v = vehicles[person.location.vehicleId];
    if (v) return ((v.heading % 360) + 360) % 360;
  }
  if (person.location.kind === 'walking' && person.location.path?.length) {
    const path = person.location.path;
    const idx = Math.min(person.location.pathIndex ?? 0, path.length - 1);
    const cur = path[idx];
    const next = path[Math.min(idx + 1, path.length - 1)];
    if (cur && next && (cur.x !== next.x || cur.y !== next.y)) {
      const dx = next.x - cur.x;
      const dy = next.y - cur.y;
      // 0 = north (-y), 90 = east (+x)
      return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    }
  }
  // Face nearest road from current place
  const key =
    person.location.kind === 'home'
      ? person.location.homeKey
      : person.location.kind === 'building'
        ? person.location.buildingKey
        : person.location.kind === 'outdoor'
          ? person.location.atKey
          : person.location.kind === 'tile'
            ? `${person.location.x},${person.location.y}`
            : person.homeKey;
  const road = findNearestRoadNeighbor(key, grid);
  if (road) {
    // Face toward the road (direction of neighbor from building)
    if (road.dx === 1) return 90;
    if (road.dx === -1) return 270;
    if (road.dy === 1) return 180;
    if (road.dy === -1) return 0;
  }
  return 180; // default look south
}

/**
 * Resolve continuous map position for a person icon.
 * Home/building → outdoor standing. Vehicle → hidden (returns null visible).
 */
export function getPersonMapPlacement(
  person: Person,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
  stackIndex = 0,
): { x: number; y: number; visible: boolean; crossing?: boolean; waiting?: boolean } {
  const loc = person.location;

  if (loc.kind === 'vehicle') {
    // Optionally show near vehicle — hide so they don't stack on cars
    return { x: 0, y: 0, visible: false };
  }

  if (loc.kind === 'walking') {
    return {
      x: loc.x,
      y: loc.y,
      visible: true,
      crossing: !!loc.crossing,
      waiting: false,
    };
  }

  if (loc.kind === 'outdoor') {
    if (typeof loc.ox === 'number' && typeof loc.oy === 'number') {
      const p = parseKey(loc.atKey) || { x: 0, y: 0 };
      return {
        x: p.x + loc.ox,
        y: p.y + loc.oy,
        visible: true,
        waiting: person.activity === 'waiting_taxi',
      };
    }
    const stand = outdoorStandPosition(loc.atKey, grid, stackIndex);
    return {
      x: stand.x,
      y: stand.y,
      visible: true,
      waiting: person.activity === 'waiting_taxi',
    };
  }

  if (loc.kind === 'tile') {
    // Stand on sidewalk of tile if road, else center-south
    if (cellIsRoad(grid, loc.x, loc.y)) {
      const side = 2;
      const sp = sidewalkPosition(loc.x, loc.y, side, 0.35 + (stackIndex % 3) * 0.15);
      return { x: sp.x, y: sp.y, visible: true, waiting: person.activity === 'waiting_taxi' };
    }
    return {
      x: loc.x + 0.5 + ((stackIndex % 3) - 1) * 0.1,
      y: loc.y + 0.72,
      visible: true,
      waiting: person.activity === 'waiting_taxi',
    };
  }

  if (loc.kind === 'home') {
    const stand = outdoorStandPosition(loc.homeKey, grid, stackIndex);
    return { x: stand.x, y: stand.y, visible: true };
  }

  if (loc.kind === 'building') {
    const stand = outdoorStandPosition(loc.buildingKey, grid, stackIndex);
    return { x: stand.x, y: stand.y, visible: true };
  }

  return { x: 0, y: 0, visible: false };
}

/** Place person standing outside a key (home/building/bus stop). */
export function toOutdoorLocation(atKey: string, grid: GridData, stackIndex = 0): PersonLocation {
  const stand = outdoorStandPosition(atKey, grid, stackIndex);
  return { kind: 'outdoor', atKey, ox: stand.ox, oy: stand.oy };
}

/** Integer tile of a person's logical place (for routing). */
export function personTilePos(
  person: Person,
  vehicles?: Record<string, Vehicle>,
): Point | null {
  const loc = person.location;
  if (loc.kind === 'home') return parseKey(loc.homeKey);
  if (loc.kind === 'building') return parseKey(loc.buildingKey);
  if (loc.kind === 'outdoor') return parseKey(loc.atKey);
  if (loc.kind === 'tile') return { x: loc.x, y: loc.y };
  if (loc.kind === 'walking') return { x: Math.floor(loc.x), y: Math.floor(loc.y) };
  if (loc.kind === 'vehicle' && vehicles) {
    const v = vehicles[loc.vehicleId];
    if (v) return { x: Math.floor(v.x), y: Math.floor(v.y) };
  }
  return parseKey(person.homeKey);
}

/** Can pedestrians cross this road cell? (stop sign, signal, junction, bus stop) */
export function canCrossRoadCell(
  grid: GridData,
  x: number,
  y: number,
  traffic?: TrafficState | null,
): boolean {
  const key = `${x},${y}`;
  const t = topTile(grid, key);
  if (!t) return false;
  if (isBusStopTile(t.type)) return true;
  if (
    t.type.includes('cross') ||
    t.type.includes('-t') ||
    t.type.includes('roundabout') ||
    t.type === 'rail-road-crossing'
  ) {
    return true;
  }
  if (traffic?.controls) {
    for (const c of Object.values(traffic.controls)) {
      if (c.gridKey === key) return true;
    }
  }
  return false;
}

/**
 * Walkable graph for pedestrians:
 * - building/home tiles
 * - road sidewalks (any road cell) but preferred along edges
 * - may step onto a road cell only if canCrossRoadCell or it is adjacent sidewalk walk
 */
function isWalkableCell(
  grid: GridData,
  x: number,
  y: number,
  traffic?: TrafficState | null,
  asCrossing = false,
): boolean {
  const t = topTile(grid, `${x},${y}`);
  if (!t) return false;
  if (cellIsBuilding(grid, x, y)) return true;
  if (isBusStopTile(t.type)) return true;
  if (cellIsRoad(grid, x, y)) {
    // Always walkable as sidewalk (edge); crossing mid-road allowed at controlled cells
    return true;
  }
  // Grass next to road — allow as outdoor path
  if (t.type.startsWith('grass') || t.type.startsWith('landscape') || t.type.startsWith('tree')) {
    for (const d of DIRS4) {
      if (cellIsRoad(grid, x + d.x, y + d.y) || cellIsBuilding(grid, x + d.x, y + d.y)) return true;
    }
  }
  return asCrossing ? canCrossRoadCell(grid, x, y, traffic) : false;
}

/** BFS path of tile keys from start to goal (inclusive). Max ~80 tiles. */
export function findPedestrianPath(
  from: Point,
  to: Point,
  grid: GridData,
  traffic?: TrafficState | null,
): Point[] | null {
  const startKey = `${from.x},${from.y}`;
  const goalKey = `${to.x},${to.y}`;
  if (startKey === goalKey) return [{ x: from.x, y: from.y }];

  const q: Point[] = [{ x: from.x, y: from.y }];
  const prev = new Map<string, string | null>();
  prev.set(startKey, null);
  const maxNodes = 400;

  while (q.length && prev.size < maxNodes) {
    const cur = q.shift()!;
    const ck = `${cur.x},${cur.y}`;
    if (ck === goalKey) break;
    for (const d of DIRS4) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      const nk = `${nx},${ny}`;
      if (prev.has(nk)) continue;
      if (!isWalkableCell(grid, nx, ny, traffic)) continue;
      // Disallow stepping onto non-crossable pure road from non-road unless destination
      const fromRoad = cellIsRoad(grid, cur.x, cur.y);
      const toRoad = cellIsRoad(grid, nx, ny);
      if (!fromRoad && toRoad && nk !== goalKey && !canCrossRoadCell(grid, nx, ny, traffic)) {
        // Allow entering road only if goal is on/near that road or bus stop
        const nearGoal = Math.abs(nx - to.x) + Math.abs(ny - to.y) <= 1;
        if (!nearGoal && !isBusStopTile(topTile(grid, nk)?.type)) continue;
      }
      prev.set(nk, ck);
      q.push({ x: nx, y: ny });
    }
  }

  if (!prev.has(goalKey)) return null;

  const path: Point[] = [];
  let k: string | null = goalKey;
  while (k) {
    const [x, y] = k.split(',').map(Number);
    path.push({ x, y });
    k = prev.get(k) ?? null;
  }
  path.reverse();
  return path;
}

/** Manhattan tile distance between person and destination key. */
export function personDistToKey(person: Person, destKey: string, vehicles?: Record<string, Vehicle>): number {
  const a = personTilePos(person, vehicles);
  const b = parseKey(destKey);
  if (!a || !b) return 999;
  return manh(a.x, a.y, b.x, b.y);
}

/** Short trips walk; longer use vehicle/taxi. */
export const WALK_MAX_TILES = 10;

export function shouldWalkTrip(
  person: Person,
  destKey: string,
  transport: TravelTransport | undefined,
  vehicles?: Record<string, Vehicle>,
): boolean {
  if (transport === 'walk') return true;
  if (transport === 'car' || transport === 'taxi' || transport === 'bus') return false;
  // auto: walk if close and healthy adult/child
  if (person.health !== 'healthy') return false;
  if (person.ageYears >= 80) return false;
  return personDistToKey(person, destKey, vehicles) <= WALK_MAX_TILES;
}

/** Begin a walking trip along sidewalks; falls back to null if no path. */
export function beginWalkTrip(
  person: Person,
  intent: PersonTravelIntent,
  grid: GridData,
  traffic: TrafficState | null | undefined,
  vehicles: Record<string, Vehicle>,
  now: number,
): Person | null {
  const from = personTilePos(person, vehicles);
  const to = parseKey(intent.destinationKey);
  if (!from || !to) return null;
  const path = findPedestrianPath(from, to, grid, traffic);
  if (!path || path.length === 0) return null;

  // Start on sidewalk of first tile
  const first = path[0];
  let stand: { x: number; y: number };
  if (cellIsRoad(grid, first.x, first.y)) {
    const side = nearestSidewalkSide(first.x, first.y, first.x + 0.5, first.y + 0.9);
    stand = sidewalkPosition(first.x, first.y, side, 0.4);
  } else {
    stand = outdoorStandPosition(`${first.x},${first.y}`, grid);
  }

  return {
    ...person,
    location: {
      kind: 'walking',
      x: stand.x,
      y: stand.y,
      path,
      pathIndex: 0,
      crossing:
        cellIsRoad(grid, first.x, first.y) && canCrossRoadCell(grid, first.x, first.y, traffic),
      destKey: intent.destinationKey,
    },
    activity: 'walking',
    activityUntil: now + 60_000,
    travelIntent: intent,
    taxiRideId: undefined,
  };
}

/**
 * Advance a walking person one sim step (~2s). Speed ~0.35 tiles/tick ≈ walking pace.
 */
export function advanceWalkingPerson(
  person: Person,
  grid: GridData,
  traffic: TrafficState | null | undefined,
  now: number,
  stepTiles = 0.4,
): Person {
  if (person.location.kind !== 'walking') return person;
  const loc = person.location;
  const path = loc.path;
  let idx = loc.pathIndex;
  if (!path.length || idx >= path.length) {
    return finishWalkArrival(person, now);
  }

  let x = loc.x;
  let y = loc.y;
  let remaining = stepTiles;
  let crossing = false;

  while (remaining > 0 && idx < path.length) {
    const targetTile = path[idx];
    const isRoad = cellIsRoad(grid, targetTile.x, targetTile.y);
    const isCross = isRoad && canCrossRoadCell(grid, targetTile.x, targetTile.y, traffic);
    // Target point: sidewalk edge unless crossing mid-junction
    let tx: number;
    let ty: number;
    if (isRoad) {
      if (isCross && idx > 0 && idx < path.length - 1) {
        // Cross through center of intersection
        tx = targetTile.x + 0.5;
        ty = targetTile.y + 0.5;
        crossing = true;
      } else {
        const side = nearestSidewalkSide(targetTile.x, targetTile.y, x, y);
        const sp = sidewalkPosition(targetTile.x, targetTile.y, side, 0.5);
        tx = sp.x;
        ty = sp.y;
        crossing = isCross && Math.hypot(x - (targetTile.x + 0.5), y - (targetTile.y + 0.5)) < 0.55;
      }
    } else {
      const stand = outdoorStandPosition(`${targetTile.x},${targetTile.y}`, grid);
      tx = stand.x;
      ty = stand.y;
    }

    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    if (dist <= remaining) {
      x = tx;
      y = ty;
      remaining -= dist;
      idx += 1;
    } else {
      x += (dx / dist) * remaining;
      y += (dy / dist) * remaining;
      remaining = 0;
      if (isRoad) {
        const cx = targetTile.x + 0.5;
        const cy = targetTile.y + 0.5;
        crossing = Math.hypot(x - cx, y - cy) < 0.45 || isCross;
      }
    }
  }

  if (idx >= path.length) {
    return finishWalkArrival(
      {
        ...person,
        location: { ...loc, x, y, pathIndex: idx, crossing: false },
      },
      now,
    );
  }

  return {
    ...person,
    location: {
      ...loc,
      x,
      y,
      pathIndex: Math.min(idx, path.length - 1),
      crossing,
    },
    activity: 'walking',
    activityUntil: now + 30_000,
  };
}

function finishWalkArrival(person: Person, now: number): Person {
  const intent = person.travelIntent;
  const purpose = intent?.purpose || 'home';
  const destKey = intent?.destinationKey || person.homeKey;
  return {
    ...person,
    location: locationForArrival(purpose, destKey, person.homeKey),
    activity: activityForArrival(purpose),
    activityUntil:
      purpose === 'work'
        ? now + 45_000 + Math.random() * 30_000
        : purpose === 'shop'
          ? now + 15_000 + Math.random() * 15_000
          : purpose === 'care'
            ? now + 25_000
            : now + 30_000 + Math.random() * 40_000,
    travelIntent: undefined,
    taxiRideId: undefined,
  };
}

/**
 * Vehicles must yield: true if a pedestrian is on the vehicle's tile or next tile ahead,
 * especially when crossing.
 */
export function shouldYieldToPedestrians(
  vehicle: Vehicle,
  people: Record<string, Person>,
  grid: GridData,
): boolean {
  if (vehicle.type === 'train') return false;
  const vx = Math.floor(vehicle.x);
  const vy = Math.floor(vehicle.y);
  const h = ((vehicle.heading % 360) + 360) % 360;
  const ahead =
    h === 0
      ? { x: vx, y: vy - 1 }
      : h === 90
        ? { x: vx + 1, y: vy }
        : h === 180
          ? { x: vx, y: vy + 1 }
          : { x: vx - 1, y: vy };

  for (const p of Object.values(people)) {
    const loc = p.location;
    let px: number;
    let py: number;
    let crossing = false;
    let onRoad = false;

    if (loc.kind === 'walking') {
      px = loc.x;
      py = loc.y;
      crossing = !!loc.crossing;
      onRoad = cellIsRoad(grid, Math.floor(px), Math.floor(py));
    } else if (loc.kind === 'tile' && cellIsRoad(grid, loc.x, loc.y)) {
      px = loc.x + 0.5;
      py = loc.y + 0.5;
      onRoad = true;
    } else if (loc.kind === 'outdoor') {
      // Outdoor standees stay on building — only block if they somehow sit on road key
      const tp = parseKey(loc.atKey);
      if (!tp || !cellIsRoad(grid, tp.x, tp.y)) continue;
      px = tp.x + (loc.ox ?? 0.5);
      py = tp.y + (loc.oy ?? 0.5);
      onRoad = true;
    } else {
      continue;
    }

    const tx = Math.floor(px);
    const ty = Math.floor(py);

    // Same tile: always yield if pedestrian is on the roadway or crossing
    if (tx === vx && ty === vy && (crossing || onRoad)) {
      return true;
    }

    // Next tile ahead when vehicle is nearing exit of current tile
    if (tx === ahead.x && ty === ahead.y && vehicle.progress >= 0.55 && (crossing || onRoad)) {
      return true;
    }

    // Close continuous proximity on road
    if (onRoad || crossing) {
      const cx = vx + 0.5;
      const cy = vy + 0.5;
      if (Math.hypot(px - cx, py - cy) < 0.7) return true;
    }
  }
  return false;
}

// ─── City / simulation clock ───────────────────────────────────────────────

/**
 * Simulation "now" from economy city clock offset.
 * Schedules and city AI use this; wall-clock ages still use real time separately.
 */
export function getSimNow(
  economy?: { cityTimeOffsetMs?: number } | null,
  realNow = Date.now(),
): number {
  return realNow + (economy?.cityTimeOffsetMs ?? 0);
}

/** Local minutes from midnight for a sim or wall timestamp */
export function minutesFromMidnight(now = Date.now()): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}

/** Local calendar day key YYYY-MM-DD for schedule fire-once tracking */
export function localDayKey(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format sim/wall time as "h:mm:ss AM/PM" */
export function formatClock12h(now = Date.now()): string {
  const d = new Date(now);
  let h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}`;
}

/**
 * Build offset so sim clock shows the given local wall-clock time (today).
 * hours 0–23, minutes/seconds 0–59.
 */
export function cityTimeOffsetForLocalTime(
  hours: number,
  minutes: number,
  seconds = 0,
  realNow = Date.now(),
): number {
  const target = new Date(realNow);
  target.setHours(
    Math.max(0, Math.min(23, Math.floor(hours))),
    Math.max(0, Math.min(59, Math.floor(minutes))),
    Math.max(0, Math.min(59, Math.floor(seconds))),
    0,
  );
  return target.getTime() - realNow;
}

/**
 * Parse a wide variety of user time strings into 24h {hours, minutes, seconds}.
 * Accepts e.g.:
 *   midnight, noon, mid-day, midday
 *   6am, 6a, 6 AM, 6pm, 5:20p, 5:20PM, 5.20p
 *   3:45:00 PM, 15:45, 1545, 930am, 12, 0:00
 */
export function parseClockInput(text: string): { hours: number; minutes: number; seconds: number } | null {
  let raw = text.trim();
  if (!raw) return null;

  // Normalize: collapse spaces, unify dots/dashes as separators in times, lowercase for words
  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim();

  // Named times
  if (
    /^(midnight|mid-night|mid night|00:00|0:00|12:00\s*a\.?m\.?|12a\.?m\.?)$/i.test(lower) ||
    lower === '0' ||
    lower === '0000'
  ) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }
  if (
    /^(noon|midday|mid-day|mid day|12:00\s*p\.?m\.?|12p\.?m\.?)$/i.test(lower)
  ) {
    return { hours: 12, minutes: 0, seconds: 0 };
  }

  // Strip optional "at" / "o'clock"
  raw = lower
    .replace(/^at\s+/, '')
    .replace(/\s*o'?clock\s*$/i, '')
    .replace(/\./g, '') // a.m. → am, 5.20 → 520 handled below carefully
    .trim();

  // Re-apply: we removed all dots; restore colon-like from common "5.20pm" if user used dots as time sep
  // If original had dots between digits, treat as colon (5.20p → 5:20p)
  const withDotTimes = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^at/, '')
    .replace(/o'?clock$/, '');
  // Prefer working on a compact form: no spaces
  let s = withDotTimes
    .replace(/(\d)\.(\d)/g, '$1:$2') // 5.20 → 5:20, 5.20.30 → 5:20:30
    .replace(/\./g, ''); // leftover a.m. dots already gone if we strip

  // Extract trailing am/pm (a, am, p, pm, a.m., p.m.)
  let meridiem: 'am' | 'pm' | null = null;
  const merMatch = s.match(/(.*?)(a\.?m\.?|p\.?m\.?|am|pm|a|p)$/i);
  if (merMatch) {
    const tag = merMatch[2].replace(/\./g, '').toLowerCase();
    meridiem = tag.startsWith('p') ? 'pm' : 'am';
    s = merMatch[1];
  }

  s = s.replace(/\s+/g, '').replace(/h/g, ':'); // 6h30 → 6:30 European-ish

  if (!s) return null;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (s.includes(':')) {
    const parts = s.split(':').filter(p => p.length > 0);
    if (parts.length < 1 || parts.length > 3) return null;
    if (!parts.every(p => /^\d{1,2}$/.test(p))) return null;
    hours = parseInt(parts[0], 10);
    minutes = parts[1] !== undefined ? parseInt(parts[1], 10) : 0;
    seconds = parts[2] !== undefined ? parseInt(parts[2], 10) : 0;
  } else if (/^\d{1,2}$/.test(s)) {
    // "6" or "18" — hour only
    hours = parseInt(s, 10);
    minutes = 0;
    seconds = 0;
  } else if (/^\d{3}$/.test(s)) {
    // "930" → 9:30
    hours = parseInt(s.slice(0, 1), 10);
    minutes = parseInt(s.slice(1), 10);
    seconds = 0;
  } else if (/^\d{4}$/.test(s)) {
    // "0930" / "1545" / "9300" invalid min
    hours = parseInt(s.slice(0, 2), 10);
    minutes = parseInt(s.slice(2), 10);
    seconds = 0;
  } else if (/^\d{5,6}$/.test(s)) {
    // "93000" or "154530" → HHmmss (5 or 6 digits)
    if (s.length === 5) {
      hours = parseInt(s.slice(0, 1), 10);
      minutes = parseInt(s.slice(1, 3), 10);
      seconds = parseInt(s.slice(3), 10);
    } else {
      hours = parseInt(s.slice(0, 2), 10);
      minutes = parseInt(s.slice(2, 4), 10);
      seconds = parseInt(s.slice(4), 10);
    }
  } else {
    return null;
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (minutes > 59 || seconds > 59) return null;

  if (meridiem) {
    // 12-hour clock with am/pm
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'am') {
      if (hours === 12) hours = 0;
    } else {
      if (hours !== 12) hours += 12;
    }
  } else {
    // 24-hour (or bare hour 0–23)
    if (hours > 23) return null;
  }

  return { hours, minutes, seconds };
}

export function formatScheduleTime(startMinute: number): string {
  const m = ((startMinute % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function scheduleEntryId(): string {
  return uid('sched');
}

/**
 * System-generated daily schedule based on age / workplace.
 * Working adults: leave for work ~08:00, lunch optional, home ~17:00.
 * Children: stay home. Elders: optional morning shop.
 */
export function generatePersonSchedule(
  person: Person,
  opts?: { stores?: string[] },
): PersonScheduleEntry[] {
  const entries: PersonScheduleEntry[] = [];
  const jitter = () => Math.floor(Math.random() * 25) - 12;

  if (isChild(person)) {
    entries.push({
      id: scheduleEntryId(),
      startMinute: 7 * 60 + jitter(),
      purpose: 'idle',
      label: 'Morning at home',
      transport: 'walk',
    });
    // Optional school as work destination if workplace set
    if (person.workplaceKey) {
      entries.push({
        id: scheduleEntryId(),
        startMinute: 8 * 60 + 15 + jitter(),
        purpose: 'work',
        destinationKey: person.workplaceKey,
        transport: 'auto',
        label: 'School',
      });
      entries.push({
        id: scheduleEntryId(),
        startMinute: 15 * 60 + jitter(),
        purpose: 'home',
        destinationKey: person.homeKey,
        transport: 'auto',
        label: 'Home from school',
      });
    }
    entries.push({
      id: scheduleEntryId(),
      startMinute: 20 * 60,
      purpose: 'home',
      destinationKey: person.homeKey,
      label: 'Evening home',
    });
    return entries.sort((a, b) => a.startMinute - b.startMinute);
  }

  if (person.ageYears >= 65) {
    entries.push({
      id: scheduleEntryId(),
      startMinute: 9 * 60 + jitter(),
      purpose: 'idle',
      label: 'Morning',
    });
    const store = opts?.stores?.[0];
    if (store && Math.random() < 0.7) {
      entries.push({
        id: scheduleEntryId(),
        startMinute: 10 * 60 + 30 + jitter(),
        purpose: 'shop',
        destinationKey: store,
        transport: 'auto',
        label: 'Shopping',
      });
    }
    entries.push({
      id: scheduleEntryId(),
      startMinute: 14 * 60 + jitter(),
      purpose: 'home',
      destinationKey: person.homeKey,
      transport: 'auto',
      label: 'Home',
    });
    return entries.sort((a, b) => a.startMinute - b.startMinute);
  }

  // Working-age adult
  const work = person.workplaceKey;
  entries.push({
    id: scheduleEntryId(),
    startMinute: 7 * 60 + 30 + jitter(),
    purpose: 'idle',
    label: 'Morning home',
  });
  if (work) {
    entries.push({
      id: scheduleEntryId(),
      startMinute: 8 * 60 + jitter(),
      purpose: 'work',
      destinationKey: work,
      transport: 'auto',
      label: 'Go to work',
    });
    const store = opts?.stores?.[Math.floor(Math.random() * (opts.stores.length || 1))];
    if (store && Math.random() < 0.4) {
      entries.push({
        id: scheduleEntryId(),
        startMinute: 12 * 60 + jitter(),
        purpose: 'shop',
        destinationKey: store,
        transport: 'walk',
        label: 'Lunch / shop',
      });
      entries.push({
        id: scheduleEntryId(),
        startMinute: 13 * 60 + jitter(),
        purpose: 'work',
        destinationKey: work,
        transport: 'walk',
        label: 'Back to work',
      });
    }
    entries.push({
      id: scheduleEntryId(),
      startMinute: 17 * 60 + jitter(),
      purpose: 'home',
      destinationKey: person.homeKey,
      transport: 'auto',
      label: 'Leave work',
    });
  } else {
    const store = opts?.stores?.[0];
    if (store) {
      entries.push({
        id: scheduleEntryId(),
        startMinute: 11 * 60 + jitter(),
        purpose: 'shop',
        destinationKey: store,
        transport: 'auto',
        label: 'Errands',
      });
    }
    entries.push({
      id: scheduleEntryId(),
      startMinute: 15 * 60 + jitter(),
      purpose: 'home',
      destinationKey: person.homeKey,
      transport: 'auto',
      label: 'Home',
    });
  }
  entries.push({
    id: scheduleEntryId(),
    startMinute: 21 * 60,
    purpose: 'home',
    destinationKey: person.homeKey,
    label: 'Night home',
  });
  return entries.sort((a, b) => a.startMinute - b.startMinute);
}

/** Attach auto schedules to people missing them. */
export function ensurePersonSchedules(
  people: Record<string, Person>,
  grid: GridData,
  buildings: Record<string, BuildingConfig>,
): Record<string, Person> {
  const stores = listStoreKeys(grid, buildings);
  let changed = false;
  const next = { ...people };
  for (const [id, p] of Object.entries(people)) {
    if (p.scheduleMode === 'manual' && p.schedule?.length) continue;
    if (p.schedule?.length && p.scheduleMode === 'auto') continue;
    if (p.schedule?.length) continue;
    next[id] = {
      ...p,
      schedule: generatePersonSchedule(p, { stores }),
      scheduleMode: p.scheduleMode || 'auto',
    };
    changed = true;
  }
  return changed ? next : people;
}

/**
 * If a schedule entry should fire now, return travel intent.
 * Fires once per entry per calendar day.
 */
export function scheduleFireIntent(
  person: Person,
  now: number,
): { intent: PersonTravelIntent; fireKey: string; entry: PersonScheduleEntry } | null {
  const schedule = person.schedule;
  if (!schedule?.length) return null;
  if (
    person.location.kind === 'vehicle' ||
    person.location.kind === 'walking' ||
    person.activity === 'waiting_taxi' ||
    person.activity === 'commuting' ||
    person.activity === 'seeking_care' ||
    person.activity === 'walking'
  ) {
    return null;
  }

  const minute = minutesFromMidnight(now);
  const day = localDayKey(now);

  // Active entry = latest with startMinute <= now (within last 90 minutes window)
  let best: PersonScheduleEntry | null = null;
  for (const e of schedule) {
    const start = e.startMinute;
    // Window: entry is eligible for 90 minutes after start
    let delta = minute - start;
    if (delta < 0) delta += 1440;
    if (delta <= 90) {
      if (!best || e.startMinute >= best.startMinute) best = e;
    }
  }
  if (!best || best.purpose === 'idle') return null;

  const fireKey = `${day}:${best.id}`;
  if (person.lastScheduleFireKey === fireKey) return null;

  let dest = best.destinationKey;
  if (!dest) {
    if (best.purpose === 'home') dest = person.homeKey;
    else if (best.purpose === 'work') dest = person.workplaceKey;
  }
  if (!dest) return null;

  // Already there?
  if (person.location.kind === 'home' && best.purpose === 'home') return null;
  if (
    person.location.kind === 'building' &&
    person.location.buildingKey === dest &&
    (best.purpose === 'work' || best.purpose === 'shop' || best.purpose === 'care')
  ) {
    return null;
  }

  return {
    intent: {
      purpose: best.purpose as TravelPurpose,
      destinationKey: dest,
      transport: best.transport || 'auto',
    },
    fireKey,
    entry: best,
  };
}

function randomAdultAge(): number {
  return 22 + Math.random() * 40; // 22–62
}

function randomChildAge(): number {
  return Math.random() * 17; // 0–17
}

function randomElderAge(): number {
  return 65 + Math.random() * 30; // 65–95
}

/** Create a family for a house key */
export function createFamilyForHome(homeKey: string, now: number): { family: Family; people: Person[] } {
  const familyId = uid('fam');
  const lastName = pick(LAST_NAMES);
  const married = Math.random() < 0.72;
  const people: Person[] = [];

  const makePerson = (
    sex: PersonSex,
    ageYears: number,
    firstName: string,
    extra: Partial<Person> = {},
  ): Person => ({
    id: uid('person'),
    firstName,
    lastName,
    ageYears,
    ageUpdatedAt: now,
    sex,
    familyId,
    homeKey,
    location: { kind: 'home', homeKey },
    health: Math.random() < 0.08 ? (Math.random() < 0.5 ? 'sick' : 'injured') : 'healthy',
    money: 50 + Math.floor(Math.random() * 200),
    activity: 'home',
    activityUntil: now + 5000 + Math.random() * 15000,
    ...extra,
  });

  const father = makePerson('m', randomAdultAge(), pick(FIRST_NAMES_M));
  people.push(father);

  let mother: Person | undefined;
  if (married) {
    mother = makePerson('f', Math.max(18, father.ageYears - 2 + Math.random() * 6), pick(FIRST_NAMES_F), {
      spouseId: father.id,
    });
    father.spouseId = mother.id;
    people.push(mother);
  } else if (Math.random() < 0.35) {
    // Single parent household (mother)
    mother = makePerson('f', randomAdultAge(), pick(FIRST_NAMES_F));
    people.shift(); // remove father
    people.push(mother);
  }

  const parentIds = people.map(p => p.id);
  const childCount = Math.floor(Math.random() * 4); // 0–3
  for (let i = 0; i < childCount; i++) {
    const sex: PersonSex = Math.random() < 0.5 ? 'm' : 'f';
    const child = makePerson(
      sex,
      randomChildAge(),
      pick(sex === 'm' ? FIRST_NAMES_M : FIRST_NAMES_F),
      { parentIds: [...parentIds], money: 0 },
    );
    people.push(child);
  }

  // Occasional grandparent
  if (Math.random() < 0.15) {
    const sex: PersonSex = Math.random() < 0.5 ? 'm' : 'f';
    people.push(
      makePerson(sex, randomElderAge(), pick(sex === 'm' ? FIRST_NAMES_M : FIRST_NAMES_F), {
        money: 80 + Math.floor(Math.random() * 120),
      }),
    );
  }

  const family: Family = {
    id: familyId,
    lastName,
    homeKey,
    memberIds: people.map(p => p.id),
  };

  return { family, people };
}

/** Single-family homes and multi-unit apartments both count as residential. */
export function isResidentialHomeType(type: string | undefined | null): boolean {
  return type === 'building-home' || type === 'building-apartment';
}

/** Canonical home address for a residential tile (anchor key for multi-tile apartments). */
export function resolveHomeKeyFromTile(
  tile: { part?: string; anchorKey?: string } | undefined | null,
  key: string,
): string {
  if (!tile) return key;
  return tile.part === 'member' ? (tile.anchorKey || key) : key;
}

export function listHomeKeys(grid: GridData): string[] {
  const keys: string[] = [];
  Object.entries(grid).forEach(([key, tiles]) => {
    const home = tiles?.find(t => isResidentialHomeType(t.type));
    if (!home) return;
    // Multi-tile apartments: only the anchor is a distinct home address
    if (home.part === 'member') return;
    keys.push(key);
  });
  return keys;
}

export function listWorkplaceKeys(grid: GridData, buildings: Record<string, BuildingConfig>): string[] {
  const keys: string[] = [];
  Object.entries(grid).forEach(([key, tiles]) => {
    const top = tiles?.[tiles.length - 1];
    if (!top) return;
    const isWork =
      top.type.includes('factory') ||
      top.type.includes('warehouse') ||
      top.type === 'building-lumbermill' ||
      top.type === 'building-store' ||
      top.type === 'building-strip-mall' ||
      top.type === 'building-station' ||
      top.type === 'building-repair-shop' ||
      top.type === 'building-hospital' ||
      top.type === 'building-school' ||
      top.type === 'building-highschool' ||
      top.type === 'building-college' ||
      top.type === 'building-university';
    if (isWork) keys.push(key);
  });
  // Prefer configured economy buildings
  Object.keys(buildings || {}).forEach(k => {
    if (!keys.includes(k)) {
      const role = buildings[k]?.role;
      if (role && role !== 'none') keys.push(k);
    }
  });
  return keys;
}

export function listStoreKeys(grid: GridData, buildings: Record<string, BuildingConfig>): string[] {
  const keys: string[] = [];
  Object.entries(grid).forEach(([key, tiles]) => {
    const top = tiles?.[tiles.length - 1];
    if (top?.type === 'building-store' || top?.type === 'building-strip-mall') keys.push(key);
  });
  Object.entries(buildings || {}).forEach(([k, b]) => {
    if (b.role === 'store' && !keys.includes(k)) keys.push(k);
  });
  return keys;
}

export function listHospitalKeys(grid: GridData, buildings: Record<string, BuildingConfig>): string[] {
  const keys: string[] = [];
  Object.entries(grid).forEach(([key, tiles]) => {
    if (tiles?.some(t => t.type === 'building-hospital')) keys.push(key);
  });
  Object.entries(buildings || {}).forEach(([k, b]) => {
    if (b.role === 'hospital' && !keys.includes(k)) keys.push(k);
  });
  return keys;
}

/** Populate empty houses with families; assign workplaces */
export function populateHomes(
  grid: GridData,
  economy: EconomyState,
  now = Date.now(),
): EconomyState {
  const people = { ...(economy.people || {}) };
  const families = { ...(economy.families || {}) };
  const occupiedHomes = new Set(Object.values(people).map(p => p.homeKey));
  const workplaces = listWorkplaceKeys(grid, economy.buildings || {});
  const homes = listHomeKeys(grid);

  const stores = listStoreKeys(grid, economy.buildings || {});
  homes.forEach(homeKey => {
    if (occupiedHomes.has(homeKey)) return;
    const { family, people: members } = createFamilyForHome(homeKey, now);
    // Assign jobs to working-age adults + daily schedules
    members.forEach(p => {
      if (isWorkingAge(p) && workplaces.length > 0 && Math.random() < 0.85) {
        p.workplaceKey = pick(workplaces);
      }
      if (!p.schedule?.length) {
        p.schedule = generatePersonSchedule(p, { stores });
        p.scheduleMode = 'auto';
      }
      people[p.id] = p;
    });
    families[family.id] = family;
    occupiedHomes.add(homeKey);
  });

  return { ...economy, people, families };
}

export function getPeopleInVehicle(
  people: Record<string, Person>,
  vehicleId: string,
): Person[] {
  return Object.values(people).filter(
    p => p.location.kind === 'vehicle' && p.location.vehicleId === vehicleId,
  );
}

export function getDriverId(people: Record<string, Person>, vehicleId: string): string | null {
  const driver = Object.values(people).find(
    p => p.location.kind === 'vehicle' && p.location.vehicleId === vehicleId && p.location.seat === 'driver',
  );
  return driver?.id ?? null;
}

export function getPassengerIds(people: Record<string, Person>, vehicleId: string): string[] {
  return Object.values(people)
    .filter(
      p => p.location.kind === 'vehicle' && p.location.vehicleId === vehicleId && p.location.seat === 'passenger',
    )
    .map(p => p.id);
}

/** All taxis are robotaxis — no human driver required. */
export function isAutonomousServiceVehicle(vehicle: Vehicle): boolean {
  return vehicle.type === 'taxi';
}

export function syncVehicleOccupancy(
  vehicle: Vehicle,
  people: Record<string, Person>,
): Vehicle {
  const isRobotaxi = isAutonomousServiceVehicle(vehicle);
  const driverId = isRobotaxi ? null : getDriverId(people, vehicle.id);
  const passengerIds = getPassengerIds(people, vehicle.id);
  const maxPassengers = vehicle.maxPassengers ?? getMaxPassengers(vehicle.type);
  return {
    ...vehicle,
    // Robotaxis never store a person driver
    driverId: driverId || undefined,
    passengerIds,
    maxPassengers,
    // Do not force isMoving here — the vehicle loop is the authority for Go/Stop
    // (people tick used to clear isMoving every ~2s when no person-driver was seated).
    isMoving: vehicle.isMoving,
  };
}

function parseKey(key: string): Point | null {
  const [x, y] = key.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function manh(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function vehicleNearKey(v: Vehicle, key: string, maxDist = 2): boolean {
  const p = parseKey(key);
  if (!p) return false;
  return manh(v.x, v.y, p.x, p.y) <= maxDist;
}

/** Family / house car assigned to this person's home and free to drive. */
export function findOwnedCar(
  person: Person,
  vehicles: Record<string, Vehicle>,
  people: Record<string, Person>,
  nearKey?: string,
): Vehicle | null {
  const candidates = Object.values(vehicles).filter(v => {
    if (v.type && v.type !== 'car') return false;
    if (v.homeKey !== person.homeKey) return false;
    if (v.manualOverride) return false;
    const driver = getDriverId(people, v.id);
    if (driver && driver !== person.id) return false;
    return true;
  });
  if (!candidates.length) return null;
  if (nearKey) {
    const near = candidates.filter(v => vehicleNearKey(v, nearKey, 3));
    if (near.length) return near[0];
  }
  // Prefer car already near the person
  if (person.location.kind === 'home') {
    const atHome = candidates.filter(v => vehicleNearKey(v, person.homeKey, 2));
    if (atHome.length) return atHome[0];
  }
  if (person.location.kind === 'building') {
    const bKey = person.location.buildingKey;
    const atB = candidates.filter(v => vehicleNearKey(v, bKey, 3));
    if (atB.length) return atB[0];
  }
  if (person.location.kind === 'outdoor') {
    const outdoorKey = person.location.atKey;
    const atB = candidates.filter(v => vehicleNearKey(v, outdoorKey, 3));
    if (atB.length) return atB[0];
  }
  if (person.location.kind === 'walking') {
    const wx = person.location.x;
    const wy = person.location.y;
    const key = `${Math.floor(wx)},${Math.floor(wy)}`;
    const near = candidates.filter(v => vehicleNearKey(v, key, 2));
    if (near.length) return near[0];
  }
  if (person.location.kind === 'vehicle') {
    const vid = person.location.vehicleId;
    const aboard = candidates.find(v => v.id === vid);
    if (aboard) return aboard;
  }
  return candidates[0];
}

export function listTaxiStationKeys(
  grid: GridData,
  buildings: Record<string, BuildingConfig>,
): string[] {
  const keys = new Set<string>();
  Object.entries(grid).forEach(([key, tiles]) => {
    const top = tiles?.[tiles.length - 1];
    if (top?.type === 'building-taxi-station' && top.part !== 'member') keys.add(key);
    if (top?.type === 'building-taxi-station' && top.part === 'member' && top.anchorKey) {
      keys.add(top.anchorKey);
    }
  });
  Object.entries(buildings || {}).forEach(([k, b]) => {
    if (b.role === 'taxi-station') keys.add(k);
  });
  return Array.from(keys);
}

function allActiveRides(buildings: Record<string, BuildingConfig>): ActiveTaxiRide[] {
  const rides: ActiveTaxiRide[] = [];
  Object.values(buildings).forEach(b => {
    (b.activeTaxiRides || []).forEach(r => rides.push(r));
  });
  return rides;
}

function taxiIsBusy(taxiId: string, buildings: Record<string, BuildingConfig>): boolean {
  return allActiveRides(buildings).some(r => r.taxiId === taxiId);
}

/**
 * Idle taxi owned by a station fleet.
 * Stations with an empty fleet cannot dispatch (new stations start with no taxis).
 */
export function findIdleTaxi(
  buildings: Record<string, BuildingConfig>,
  vehicles: Record<string, Vehicle>,
  people: Record<string, Person>,
  preferStationKey?: string,
): { taxi: Vehicle; stationKey: string } | null {
  const stations = Object.entries(buildings).filter(([, b]) => b.role === 'taxi-station');
  const ordered = preferStationKey
    ? [
        ...stations.filter(([k]) => k === preferStationKey),
        ...stations.filter(([k]) => k !== preferStationKey),
      ]
    : stations;

  for (const [stationKey, cfg] of ordered) {
    const ownerId = cfg.taxiStationOwnerId;
    const fleet = cfg.taxiFleetIds || [];
    // Only this station's owned fleet — never borrow free city taxis
    if (!fleet.length) continue;
    for (const tid of fleet) {
      const taxi = vehicles[tid];
      if (!taxi || taxi.type !== 'taxi') continue;
      if (ownerId && taxi.taxiOwnerId && taxi.taxiOwnerId !== ownerId) continue;
      if (taxi.manualOverride) continue;
      if (taxiIsBusy(tid, buildings)) continue;
      if (getPassengerIds(people, tid).length > 0) continue;
      return { taxi, stationKey };
    }
  }
  return null;
}

export function canBoardAsDriver(person: Person, vehicle: Vehicle, people: Record<string, Person>): string | null {
  if (vehicle.type === 'taxi') return 'Taxis are robotaxis — passengers only (no driver).';
  if (!isAdult(person)) return 'Only adults can drive.';
  if (person.health === 'injured' && Math.random() < 0) return 'Too injured to drive.';
  const existing = getDriverId(people, vehicle.id);
  if (existing && existing !== person.id) return 'Vehicle already has a driver.';
  return null;
}

export function canBoardAsPassenger(person: Person, vehicle: Vehicle, people: Record<string, Person>): string | null {
  const max = vehicle.maxPassengers ?? getMaxPassengers(vehicle.type);
  const passengers = getPassengerIds(people, vehicle.id);
  if (passengers.length >= max) return 'No passenger seats left.';
  return null;
}

/** Board person into vehicle (updates people map). */
export function boardPerson(
  people: Record<string, Person>,
  personId: string,
  vehicleId: string,
  seat: 'driver' | 'passenger',
): Record<string, Person> {
  const p = people[personId];
  if (!p) return people;
  // Manual board is freeride: clear AI trip targets so the people sim does not
  // immediately "arrive" at workplace/home and eject the passenger/driver.
  return {
    ...people,
    [personId]: {
      ...p,
      location: { kind: 'vehicle', vehicleId, seat },
      activity: 'commuting',
      travelIntent: undefined,
      taxiRideId: undefined,
      activityUntil: undefined,
    },
  };
}

export function alightPerson(
  people: Record<string, Person>,
  personId: string,
  dest: PersonLocation,
  activity: PersonActivity = 'idle',
  activityUntil?: number,
): Record<string, Person> {
  const p = people[personId];
  if (!p) return people;
  return {
    ...people,
    [personId]: {
      ...p,
      location: dest,
      activity,
      activityUntil,
    },
  };
}

/**
 * Seat an adult as driver when a vehicle is assigned a home.
 * Prefers free adult residents of `homeKey`; creates one (and family) if none are free.
 * Does not steal drivers from other vehicles. Robotaxis / trains / semis are left unchanged.
 */
export function ensureHomeVehicleDriver(
  vehicle: Vehicle,
  people: Record<string, Person>,
  families: Record<string, Family> = {},
  opts?: {
    /** Person ids already claimed as drivers in this batch (multi-car assign) */
    claimedDriverIds?: Set<string>;
    now?: number;
  },
): {
  vehicle: Vehicle;
  people: Record<string, Person>;
  families: Record<string, Family>;
  claimedDriverId?: string;
} {
  const homeKey = vehicle.homeKey;
  const vType = vehicle.type || 'car';
  if (!homeKey || vType === 'taxi' || vType === 'train' || vType === 'semi') {
    return { vehicle, people, families };
  }

  const now = opts?.now ?? Date.now();
  const claimed = opts?.claimedDriverIds ?? new Set<string>();
  let nextPeople = { ...people };
  let nextFamilies = { ...families };
  let nextVehicle: Vehicle = { ...vehicle };

  const currentDriverId = getDriverId(nextPeople, vehicle.id);

  // Keep an adult resident who already drives this car
  if (currentDriverId) {
    const driver = nextPeople[currentDriverId];
    if (
      driver &&
      isAdult(driver) &&
      driver.homeKey === homeKey &&
      !claimed.has(currentDriverId)
    ) {
      claimed.add(currentDriverId);
      nextVehicle = syncVehicleOccupancy(nextVehicle, nextPeople);
      return {
        vehicle: nextVehicle,
        people: nextPeople,
        families: nextFamilies,
        claimedDriverId: currentDriverId,
      };
    }
    // Wrong home / not adult / already claimed → send them home
    if (driver) {
      nextPeople = alightPerson(
        nextPeople,
        currentDriverId,
        { kind: 'home', homeKey: driver.homeKey },
        'home',
        now + 5000,
      );
    }
  }

  const availabilityScore = (p: Person): number => {
    if (p.location.kind === 'home' && p.location.homeKey === homeKey) return 0;
    if (p.location.kind === 'vehicle' && p.location.vehicleId === vehicle.id) return 1;
    if (p.location.kind === 'building') return 2;
    if (p.location.kind === 'tile') return 3;
    return 4;
  };

  const candidates = peopleResidingAt(nextPeople, homeKey)
    .filter(p => {
      if (!isAdult(p)) return false;
      if (claimed.has(p.id)) return false;
      if (p.health === 'injured') return false;
      if (p.location.kind === 'vehicle') {
        // Allow promote from passenger on this vehicle; never steal from another
        if (p.location.vehicleId === vehicle.id) return true;
        return false;
      }
      return true;
    })
    .sort((a, b) => availabilityScore(a) - availabilityScore(b));

  let driverId: string | null = null;
  for (const p of candidates) {
    if (canBoardAsDriver(p, nextVehicle, nextPeople) === null) {
      driverId = p.id;
      break;
    }
  }

  if (!driverId) {
    // No free adult resident — create one so the assigned car can drive
    const sex: PersonSex = Math.random() < 0.5 ? 'm' : 'f';
    const homeFams = Object.values(nextFamilies).filter(f => f.homeKey === homeKey);
    const existingFam = homeFams[0];
    const lastName = existingFam?.lastName || randomLastName();
    const person = createPerson({
      firstName: randomFirstName(sex),
      lastName,
      sex,
      ageYears: 22 + Math.floor(Math.random() * 40),
      homeKey,
      familyId: existingFam?.id,
      money: 40 + Math.floor(Math.random() * 80),
      now,
    });
    if (existingFam) {
      nextFamilies = {
        ...nextFamilies,
        [existingFam.id]: {
          ...existingFam,
          memberIds: [...existingFam.memberIds, person.id],
        },
      };
      person.familyId = existingFam.id;
    } else {
      nextFamilies = {
        ...nextFamilies,
        [person.familyId]: {
          id: person.familyId,
          lastName: person.lastName,
          homeKey,
          memberIds: [person.id],
        },
      };
    }
    nextPeople = { ...nextPeople, [person.id]: person };
    driverId = person.id;
  }

  nextPeople = boardPerson(nextPeople, driverId, vehicle.id, 'driver');
  claimed.add(driverId);
  nextVehicle = syncVehicleOccupancy(nextVehicle, nextPeople);

  return {
    vehicle: nextVehicle,
    people: nextPeople,
    families: nextFamilies,
    claimedDriverId: driverId,
  };
}

/**
 * Assign homeKey on vehicles and seat adult drivers for each.
 * Shared claimed-driver set so multi-car assigns do not double-book one person.
 * Callers supply schedule fields (e.g. nextHomeReturnAt) on each assignment.
 */
export function assignHomesWithDrivers(
  vehicles: Record<string, Vehicle>,
  people: Record<string, Person>,
  families: Record<string, Family>,
  assignments: Array<{ vehicleId: string; homeKey: string; nextHomeReturnAt?: number }>,
  now = Date.now(),
): {
  vehicles: Record<string, Vehicle>;
  people: Record<string, Person>;
  families: Record<string, Family>;
} {
  let nextVehicles = { ...vehicles };
  let nextPeople = { ...people };
  let nextFamilies = { ...families };
  const claimedDriverIds = new Set<string>();

  for (const { vehicleId, homeKey, nextHomeReturnAt } of assignments) {
    const v = nextVehicles[vehicleId];
    if (!v) continue;
    const vType = v.type || 'car';
    if (vType === 'train' || vType === 'semi') continue;

    const withHome: Vehicle = {
      ...v,
      homeKey,
      ...(nextHomeReturnAt != null ? { nextHomeReturnAt } : {}),
    };
    const result = ensureHomeVehicleDriver(withHome, nextPeople, nextFamilies, {
      claimedDriverIds,
      now,
    });
    nextVehicles = { ...nextVehicles, [vehicleId]: result.vehicle };
    nextPeople = result.people;
    nextFamilies = result.families;
  }

  return { vehicles: nextVehicles, people: nextPeople, families: nextFamilies };
}

export function peopleAtHome(people: Record<string, Person>, homeKey: string): Person[] {
  return Object.values(people).filter(p => {
    if (p.location.kind === 'home' && p.location.homeKey === homeKey) return true;
    // Standing outside their house still counts as "at home"
    if (p.location.kind === 'outdoor' && p.location.atKey === homeKey) return true;
    return false;
  });
}

/** Residents assigned to this house (may be out working, shopping, etc.). */
export function peopleResidingAt(people: Record<string, Person> | undefined, homeKey: string): Person[] {
  if (!people || !homeKey) return [];
  return Object.values(people).filter(p => p.homeKey === homeKey);
}

/** Families whose homeKey matches this house. */
export function familiesAtHome(
  families: Record<string, Family> | undefined,
  people: Record<string, Person> | undefined,
  homeKey: string,
): Family[] {
  if (!homeKey) return [];
  const byId = new Map<string, Family>();
  Object.values(families || {}).forEach(f => {
    if (f.homeKey === homeKey) byId.set(f.id, f);
  });
  // Include families of residents even if Family.homeKey drifted
  peopleResidingAt(people, homeKey).forEach(p => {
    const f = families?.[p.familyId];
    if (f && !byId.has(f.id)) byId.set(f.id, f);
  });
  return Array.from(byId.values());
}

export function peopleInBuilding(people: Record<string, Person>, buildingKey: string): Person[] {
  return Object.values(people).filter(p => {
    if (p.location.kind === 'building' && p.location.buildingKey === buildingKey) return true;
    // Outside the workplace counts as present for staffing once they arrived
    if (
      p.location.kind === 'outdoor' &&
      p.location.atKey === buildingKey &&
      (p.activity === 'working' || p.activity === 'shopping' || p.activity === 'in_care')
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Lightweight life AI step for one person.
 * Travel is vehicle-only: owned car or taxi — never teleport to work/shop.
 */
export interface PeopleSimPatch {
  person: Person;
  vehicleDestination?: { vehicleId: string; dest: Point };
  /** Park / stop a vehicle after drop-off */
  vehiclePark?: { vehicleId: string };
  buildingInventoryDelta?: { buildingKey: string; item: string; delta: number };
  heal?: boolean;
  /** Register a new taxi ride on a station */
  newTaxiRide?: { stationKey: string; ride: ActiveTaxiRide };
  /** Remove completed taxi ride */
  completeTaxiRide?: { stationKey: string; rideId: string };
}

type SimCtx = {
  grid: GridData;
  buildings: Record<string, BuildingConfig>;
  vehicles: Record<string, Vehicle>;
  people: Record<string, Person>;
  traffic?: TrafficState | null;
};

function currentPlaceKey(p: Person): string {
  if (p.location.kind === 'home') return p.location.homeKey;
  if (p.location.kind === 'building') return p.location.buildingKey;
  if (p.location.kind === 'tile') return `${p.location.x},${p.location.y}`;
  if (p.location.kind === 'outdoor') return p.location.atKey;
  if (p.location.kind === 'walking') {
    return p.location.destKey || `${Math.floor(p.location.x)},${Math.floor(p.location.y)}`;
  }
  return p.homeKey;
}

function activityForArrival(purpose: TravelPurpose): PersonActivity {
  if (purpose === 'work') return 'working';
  if (purpose === 'shop') return 'shopping';
  if (purpose === 'care') return 'in_care';
  return 'home';
}

function locationForArrival(purpose: TravelPurpose, destKey: string, homeKey: string): PersonLocation {
  if (purpose === 'home') return { kind: 'home', homeKey };
  return { kind: 'building', buildingKey: destKey };
}

/** Start travel via walk, owned car, or taxi (no teleport). */
function beginTravel(
  p: Person,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
): PeopleSimPatch {
  const dest = parseKey(intent.destinationKey);
  if (!dest) {
    return {
      person: {
        ...p,
        activity: 'home',
        location: { kind: 'home', homeKey: p.homeKey },
        activityUntil: now + 20_000,
        travelIntent: undefined,
        taxiRideId: undefined,
      },
    };
  }

  // Already in a vehicle — attach trip intent. Only auto-route cars/service
  // (not trains/semis, which the player often runs independently).
  if (p.location.kind === 'vehicle') {
    const aboard = ctx.vehicles[p.location.vehicleId];
    const vType = aboard?.type || 'car';
    const mayRouteVehicle =
      !!aboard &&
      !aboard.manualOverride &&
      vType !== 'train' &&
      vType !== 'semi';
    return {
      person: {
        ...p,
        travelIntent: intent,
        activity: intent.purpose === 'care' ? 'seeking_care' : 'commuting',
        activityUntil: now + 20_000,
      },
      vehicleDestination: mayRouteVehicle
        ? { vehicleId: p.location.vehicleId, dest }
        : undefined,
    };
  }

  // Already walking toward this dest — keep going
  if (
    p.location.kind === 'walking' &&
    p.travelIntent?.destinationKey === intent.destinationKey
  ) {
    return { person: { ...p, travelIntent: intent, activity: 'walking' } };
  }

  // Prefer walking for short trips / explicit walk transport
  if (shouldWalkTrip(p, intent.destinationKey, intent.transport, ctx.vehicles)) {
    const walker = beginWalkTrip(p, intent, ctx.grid, ctx.traffic, ctx.vehicles, now);
    if (walker) return { person: walker };
    // No path — fall through to car/taxi
  }

  const placeKey = currentPlaceKey(p);
  // Stand outside while waiting for a ride (visible at curb)
  const outdoorWait = toOutdoorLocation(placeKey, ctx.grid);

  const car = findOwnedCar(p, ctx.vehicles, ctx.people, placeKey);
  if (
    car &&
    intent.transport !== 'taxi' &&
    intent.transport !== 'bus' &&
    canBoardAsDriver(p, car, ctx.people) === null
  ) {
    // Must be near the car (or at home with car at home)
    const nearCar = vehicleNearKey(car, placeKey, 3) || vehicleNearKey(car, p.homeKey, 2);
    if (nearCar) {
      return {
        person: {
          ...p,
          location: { kind: 'vehicle', vehicleId: car.id, seat: 'driver' },
          activity: intent.purpose === 'care' ? 'seeking_care' : 'commuting',
          activityUntil: now + 25_000,
          travelIntent: intent,
          taxiRideId: undefined,
        },
        vehicleDestination: { vehicleId: car.id, dest },
      };
    }
  }

  // Call a taxi to current place (stand outside for pickup)
  const idle = findIdleTaxi(ctx.buildings, ctx.vehicles, ctx.people);
  if (idle && intent.transport !== 'walk') {
    const ride: ActiveTaxiRide = {
      id: uid('ride'),
      taxiId: idle.taxi.id,
      passengerId: p.id,
      passengerLabel: personDisplayName(p),
      phase: 'to_pickup',
      pickupKey: placeKey,
      destinationKey: intent.destinationKey,
      purpose: intent.purpose,
      startedAt: now,
    };
    const pickup = parseKey(placeKey);
    return {
      person: {
        ...p,
        location: outdoorWait,
        activity: 'waiting_taxi',
        activityUntil: now + 45_000,
        travelIntent: intent,
        taxiRideId: ride.id,
      },
      newTaxiRide: { stationKey: idle.stationKey, ride },
      vehicleDestination: pickup
        ? { vehicleId: idle.taxi.id, dest: pickup }
        : undefined,
    };
  }

  // No car, no taxi — try walking even if far; else stay put and retry
  const walker = beginWalkTrip(p, { ...intent, transport: 'walk' }, ctx.grid, ctx.traffic, ctx.vehicles, now);
  if (walker) return { person: walker };

  return {
    person: {
      ...p,
      location: outdoorWait,
      activity: p.location.kind === 'home' ? 'home' : 'idle',
      activityUntil: now + 15_000 + Math.random() * 15_000,
      travelIntent: intent,
    },
  };
}

export function simulatePersonStep(
  person: Person,
  now: number,
  ctx: SimCtx,
  opts?: { /** Wall time for aging (defaults to now / sim time) */ realNow?: number },
): PeopleSimPatch {
  // Age always follows real wall time so setting the city clock does not age citizens
  let p = advancePersonAge(person, opts?.realNow ?? now);

  // Death at 100 — stay home
  if (p.ageYears >= 100) {
    return {
      person: {
        ...p,
        ageYears: 100,
        activity: 'home',
        location: { kind: 'home', homeKey: p.homeKey },
        activityUntil: now + 3600_000,
        travelIntent: undefined,
        taxiRideId: undefined,
      },
    };
  }

  if (p.health === 'healthy' && isAdult(p) && Math.random() < 0.0008) {
    p = {
      ...p,
      health: Math.random() < 0.6 ? 'sick' : 'injured',
      illnessId: Math.random() < 0.5 ? 'flu' : 'trauma',
    };
  }

  // Advance walking every tick (not gated by activityUntil)
  if (p.location.kind === 'walking' || p.activity === 'walking') {
    const walked = advanceWalkingPerson(p, ctx.grid, ctx.traffic, now, 0.45);
    return { person: walked };
  }

  // Daily schedule can start a trip when idle at home/building/outdoor
  const sched = scheduleFireIntent(p, now);
  if (sched) {
    const patch = beginTravel(p, sched.intent, now, ctx);
    return {
      ...patch,
      person: { ...patch.person, lastScheduleFireKey: sched.fireKey },
    };
  }

  // Waiting for taxi — ride state machine advances in processTaxiRides
  if (p.activity === 'waiting_taxi') {
    // Ensure visible outdoor wait at pickup
    if (p.location.kind !== 'outdoor' && p.location.kind !== 'tile') {
      p = {
        ...p,
        location: toOutdoorLocation(currentPlaceKey(p), ctx.grid),
      };
    }
    if (p.activityUntil && now < p.activityUntil) {
      return { person: p };
    }
    // Timeout: re-request taxi or stay
    if (p.travelIntent) {
      return beginTravel(p, p.travelIntent, now, ctx);
    }
    return {
      person: {
        ...p,
        activity: 'home',
        location: { kind: 'home', homeKey: p.homeKey },
        activityUntil: now + 20_000,
        taxiRideId: undefined,
      },
    };
  }

  // Still busy (work / shop / commute mid-trip checks every few seconds)
  // Walking handled above; commuting/seeking_care re-checked for arrival
  if (
    p.activityUntil &&
    now < p.activityUntil &&
    p.activity !== 'commuting' &&
    p.activity !== 'seeking_care'
  ) {
    return { person: p };
  }

  const stores = listStoreKeys(ctx.grid, ctx.buildings);
  const hospitals = listHospitalKeys(ctx.grid, ctx.buildings);
  const workplaces = listWorkplaceKeys(ctx.grid, ctx.buildings);

  // Freeride / manual board: on a vehicle with no AI trip target — stay aboard.
  // (Board-as-driver for trains/cars must not be ejected by the next people tick.)
  if (p.location.kind === 'vehicle' && !p.travelIntent && !p.taxiRideId) {
    return {
      person: {
        ...p,
        activity: 'commuting',
        activityUntil: now + 60_000,
      },
    };
  }

  // Sick / injured → travel to hospital (vehicle only)
  // Do not yank someone who is already on a vehicle freeride (handled above).
  if (
    p.health !== 'healthy' &&
    p.activity !== 'in_care' &&
    p.activity !== 'seeking_care' &&
    p.activity !== 'commuting' &&
    p.location.kind !== 'vehicle'
  ) {
    const careKey = hospitals[0] || null;
    if (careKey) {
      if (p.health === 'injured') {
        const amb = Object.values(ctx.vehicles).find(
          v => v.type === 'ambulance' && !v.manualOverride && !getDriverId(ctx.people, v.id),
        );
        if (amb && canBoardAsPassenger(p, amb, ctx.people) === null) {
          const dest = parseKey(careKey);
          if (dest) {
            return {
              person: {
                ...p,
                location: { kind: 'vehicle', vehicleId: amb.id, seat: 'passenger' },
                activity: 'seeking_care',
                activityUntil: now + 20_000,
                travelIntent: { purpose: 'care', destinationKey: careKey },
              },
              vehicleDestination: { vehicleId: amb.id, dest },
            };
          }
        }
      }
      return beginTravel(p, { purpose: 'care', destinationKey: careKey }, now, ctx);
    }
  }

  // Arriving while commuting / seeking care — only with an explicit travelIntent.
  // Never treat bare workplaceKey as arrival (that ejected manual train/car drivers).
  if (
    (p.activity === 'commuting' || p.activity === 'seeking_care') &&
    p.location.kind === 'vehicle'
  ) {
    const v = ctx.vehicles[p.location.vehicleId];
    const intent = p.travelIntent;
    const targetKey = intent?.destinationKey;
    if (v && targetKey && vehicleNearKey(v, targetKey, 2)) {
      const purpose = intent?.purpose || (p.activity === 'seeking_care' ? 'care' : 'work');
      const arrived: Person = {
        ...p,
        location: locationForArrival(purpose, targetKey, p.homeKey),
        activity: activityForArrival(purpose),
        activityUntil:
          purpose === 'work'
            ? now + 45_000 + Math.random() * 30_000
            : purpose === 'shop'
              ? now + 15_000 + Math.random() * 15_000
              : purpose === 'care'
                ? now + 25_000 + Math.random() * 20_000
                : now + 30_000 + Math.random() * 40_000,
        travelIntent: undefined,
        taxiRideId: undefined,
        money:
          purpose === 'work'
            ? (p.money || 0) + 8
            : purpose === 'shop'
              ? Math.max(0, (p.money || 0) - 5)
              : p.money,
      };
      if (purpose === 'care') {
        arrived.health = 'healthy';
        arrived.illnessId = undefined;
      }
      // Park personal cars only — never auto-park trains / semis / taxis
      const vType = v.type || 'car';
      const parkId =
        p.location.seat === 'driver' &&
        vType !== 'taxi' &&
        vType !== 'train' &&
        vType !== 'semi'
          ? v.id
          : undefined;
      return {
        person: arrived,
        vehiclePark: parkId ? { vehicleId: parkId } : undefined,
        heal: purpose === 'care' || undefined,
        buildingInventoryDelta:
          purpose === 'shop'
            ? { buildingKey: targetKey, item: 'goods', delta: -1 }
            : undefined,
      };
    }
    // Mid-trip (or freeride with stale commuting flag): stay aboard
    return {
      person: {
        ...p,
        activityUntil: now + 10_000,
      },
    };
  }

  // In care → go home by vehicle
  if (p.activity === 'in_care') {
    return beginTravel(
      {
        ...p,
        health: 'healthy',
        illnessId: undefined,
      },
      { purpose: 'home', destinationKey: p.homeKey },
      now,
      ctx,
    );
  }

  if (isChild(p)) {
    return {
      person: {
        ...p,
        location: { kind: 'home', homeKey: p.homeKey },
        activity: 'home',
        activityUntil: now + 30_000 + Math.random() * 60_000,
        travelIntent: undefined,
      },
    };
  }

  // Working age: home → work → shop/home via walk / vehicles
  // When a schedule is present, opportunistic trips are lighter (schedule drives the day)
  const hasSchedule = !!(p.schedule && p.schedule.length);
  if (isWorkingAge(p)) {
    // Pending work assignment / idle at home: travel to workplace (never teleport)
    if (p.activity === 'home' || p.activity === 'idle') {
      const workFromIntent =
        p.travelIntent?.purpose === 'work' ? p.travelIntent.destinationKey : undefined;
      const work =
        workFromIntent ||
        (p.workplaceKey && workplaces.includes(p.workplaceKey) ? p.workplaceKey : null) ||
        (!hasSchedule && workplaces.length ? pick(workplaces) : null);
      if (work) {
        return beginTravel(
          { ...p, workplaceKey: p.workplaceKey || work },
          { purpose: 'work', destinationKey: work, transport: 'auto' },
          now,
          ctx,
        );
      }
      // Scheduled people with nothing to do: stay outside home
      if (hasSchedule) {
        return {
          person: {
            ...p,
            location:
              p.location.kind === 'home' || p.location.kind === 'outdoor'
                ? p.location.kind === 'outdoor'
                  ? p.location
                  : toOutdoorLocation(p.homeKey, ctx.grid)
                : p.location,
            activity: 'home',
            activityUntil: now + 30_000,
          },
        };
      }
    }

    if (p.activity === 'working') {
      // Must be physically at a building to work / count for staffing production
      if (p.location.kind !== 'building') {
        const work = p.workplaceKey || p.travelIntent?.destinationKey;
        if (work) {
          return beginTravel(p, { purpose: 'work', destinationKey: work }, now, ctx);
        }
        return {
          person: {
            ...p,
            activity: 'idle',
            activityUntil: now + 10_000,
          },
        };
      }
      const bkey = p.location.buildingKey;
      const bcfg = ctx.buildings[bkey];
      const assignedHere = !p.workplaceKey || p.workplaceKey === bkey;
      let invDelta: PeopleSimPatch['buildingInventoryDelta'];
      if (
        assignedHere &&
        bcfg &&
        (bcfg.role === 'factory' || bcfg.role === 'lumbermill' || bcfg.role === 'warehouse')
      ) {
        const item = bcfg.role === 'lumbermill' ? 'lumber' : 'goods';
        invDelta = { buildingKey: bkey, item, delta: 1 };
      }
      if (stores.length && Math.random() < 0.55 && (p.money || 0) >= 5) {
        const store = pick(stores);
        const travel = beginTravel(p, { purpose: 'shop', destinationKey: store }, now, ctx);
        return {
          ...travel,
          buildingInventoryDelta: invDelta,
          person: { ...travel.person, money: (p.money || 0) },
        };
      }
      const travel = beginTravel(p, { purpose: 'home', destinationKey: p.homeKey }, now, ctx);
      return {
        ...travel,
        buildingInventoryDelta: invDelta,
        person: { ...travel.person, money: (p.money || 0) + 8 },
      };
    }

    if (p.activity === 'shopping') {
      return beginTravel(p, { purpose: 'home', destinationKey: p.homeKey }, now, ctx);
    }
  }

  // Never teleport someone off a vehicle they are riding
  if (p.location.kind === 'vehicle') {
    return {
      person: {
        ...p,
        activity: p.activity === 'seeking_care' ? 'seeking_care' : 'commuting',
        activityUntil: now + 60_000,
      },
    };
  }

  // Elders: shop via taxi/car only
  if (p.ageYears >= 65) {
    if (stores.length && Math.random() < 0.3 && (p.activity === 'home' || p.activity === 'idle')) {
      return beginTravel(p, { purpose: 'shop', destinationKey: pick(stores) }, now, ctx);
    }
    if (p.activity === 'shopping') {
      return beginTravel(p, { purpose: 'home', destinationKey: p.homeKey }, now, ctx);
    }
    return {
      person: {
        ...p,
        location: { kind: 'home', homeKey: p.homeKey },
        activity: 'home',
        activityUntil: now + 60_000,
      },
    };
  }

  return {
    person: {
      ...p,
      location: { kind: 'home', homeKey: p.homeKey },
      activity: 'home',
      activityUntil: now + 20_000,
    },
  };
}

/**
 * Whether people/taxi AI may force a vehicle into isMoving.
 * Must NOT override active traffic signal / stop-sign / parking holds
 * (robotaxis obey lights and stop signs like other road traffic).
 */
function vehicleMayBeForcedMoving(v: Vehicle, now = Date.now()): boolean {
  if (v.manualOverride) return false;
  if (v.parkingStopUntil != null && now < v.parkingStopUntil) return false;
  if (v.trafficStopUntil != null && now < v.trafficStopUntil) return false;
  // Stoplight / stop-sign / yield / pedestrian holds: vehicle loop resumes when clear
  if (
    v.trafficStopReason === 'stoplight' ||
    v.trafficStopReason === 'stop-sign' ||
    v.trafficStopReason === 'yield' ||
    v.trafficStopReason === 'vehicle' ||
    v.trafficStopReason === 'pedestrian'
  ) {
    return false;
  }
  return true;
}

function applyVehicleDestination(
  nextVehicles: Record<string, Vehicle>,
  people: Record<string, Person>,
  vehicleId: string,
  dest: Point,
  person: Person,
  now = Date.now(),
): Record<string, Vehicle> {
  const v = nextVehicles[vehicleId];
  if (!v || v.manualOverride) return nextVehicles;
  const mayMove = vehicleMayBeForcedMoving(v, now);
  const loc = person.location;
  if (loc.kind === 'vehicle' && loc.seat === 'driver' && loc.vehicleId === vehicleId) {
    nextVehicles[vehicleId] = {
      ...v,
      driverId: person.id,
      destination: dest,
      isMoving: mayMove ? true : v.isMoving,
      turnIntent: null,
      randomTurning: false,
    };
    return nextVehicles;
  }
  // Autonomous taxi (or passenger-only ride) — still holds for red lights / stop signs
  if (v.type === 'taxi' || (loc.kind === 'vehicle' && loc.seat === 'passenger')) {
    nextVehicles[vehicleId] = {
      ...v,
      destination: dest,
      isMoving: mayMove ? true : v.isMoving,
      turnIntent: null,
      randomTurning: false,
    };
  }
  return nextVehicles;
}

/** Advance taxi pickups / dropoffs for all stations. */
function processTaxiRides(
  people: Record<string, Person>,
  buildings: Record<string, BuildingConfig>,
  vehicles: Record<string, Vehicle>,
  now: number,
): {
  people: Record<string, Person>;
  buildings: Record<string, BuildingConfig>;
  vehicles: Record<string, Vehicle>;
} {
  let nextPeople = people;
  let nextBuildings = { ...buildings };
  let nextVehicles = { ...vehicles };

  for (const [stationKey, cfg] of Object.entries(buildings)) {
    if (cfg.role !== 'taxi-station') continue;
    const rides = [...(cfg.activeTaxiRides || [])];
    if (!rides.length) continue;
    const remaining: ActiveTaxiRide[] = [];

    for (const ride of rides) {
      const taxi = nextVehicles[ride.taxiId];
      let passenger = nextPeople[ride.passengerId];
      if (!taxi || !passenger) continue;

      if (ride.phase === 'to_pickup') {
        if (vehicleNearKey(taxi, ride.pickupKey, 2)) {
          // Board passenger
          if (canBoardAsPassenger(passenger, taxi, nextPeople) === null || passenger.location.kind === 'vehicle') {
            passenger = {
              ...passenger,
              location: { kind: 'vehicle', vehicleId: taxi.id, seat: 'passenger' },
              activity: ride.purpose === 'care' ? 'seeking_care' : 'commuting',
              activityUntil: now + 25_000,
              travelIntent: {
                purpose: ride.purpose,
                destinationKey: ride.destinationKey,
              },
              taxiRideId: ride.id,
            };
            nextPeople = { ...nextPeople, [passenger.id]: passenger };
            const dest = parseKey(ride.destinationKey);
            if (dest) {
              const mayMove = vehicleMayBeForcedMoving(taxi, now);
              nextVehicles[taxi.id] = {
                ...taxi,
                destination: dest,
                isMoving: mayMove ? true : taxi.isMoving,
                turnIntent: null,
                randomTurning: false,
              };
            }
            remaining.push({ ...ride, phase: 'to_dropoff' });
            continue;
          }
        }
        // Still en route to pickup — never override traffic/parking holds
        if (!taxi.destination || (!taxi.isMoving && vehicleMayBeForcedMoving(taxi, now))) {
          const pickup = parseKey(ride.pickupKey);
          if (pickup) {
            nextVehicles[taxi.id] = {
              ...taxi,
              destination: pickup,
              isMoving: vehicleMayBeForcedMoving(taxi, now) ? true : taxi.isMoving,
              turnIntent: null,
              randomTurning: false,
            };
          }
        }
        remaining.push(ride);
        continue;
      }

      if (ride.phase === 'to_dropoff') {
        if (vehicleNearKey(taxi, ride.destinationKey, 2)) {
          // Drop off
          const purpose = ride.purpose;
          const destKey = ride.destinationKey;
          passenger = {
            ...passenger,
            location: locationForArrival(purpose, destKey, passenger.homeKey),
            activity: activityForArrival(purpose),
            activityUntil:
              purpose === 'work'
                ? now + 45_000 + Math.random() * 30_000
                : purpose === 'shop'
                  ? now + 15_000 + Math.random() * 15_000
                  : purpose === 'care'
                    ? now + 25_000 + Math.random() * 20_000
                    : now + 35_000,
            travelIntent: undefined,
            taxiRideId: undefined,
            money:
              purpose === 'shop'
                ? Math.max(0, (passenger.money || 0) - 8)
                : purpose === 'work'
                  ? (passenger.money || 0) + 8
                  : passenger.money,
          };
          if (purpose === 'care') {
            passenger = { ...passenger, health: 'healthy', illnessId: undefined };
          }
          nextPeople = { ...nextPeople, [passenger.id]: passenger };

          // Send taxi back to station (respect active traffic stop if mid-signal)
          const stationPt = parseKey(stationKey);
          const mayMove = vehicleMayBeForcedMoving(taxi, now);
          nextVehicles[taxi.id] = {
            ...taxi,
            destination: stationPt,
            isMoving: mayMove && !!stationPt,
            turnIntent: null,
            randomTurning: false,
            parkOnNextLot: true,
          };
          // ride completes — not re-added to remaining
          continue;
        }
        if (!taxi.destination || (!taxi.isMoving && vehicleMayBeForcedMoving(taxi, now))) {
          const dest = parseKey(ride.destinationKey);
          if (dest) {
            nextVehicles[taxi.id] = {
              ...taxi,
              destination: dest,
              isMoving: vehicleMayBeForcedMoving(taxi, now) ? true : taxi.isMoving,
              turnIntent: null,
              randomTurning: false,
            };
          }
        }
        remaining.push(ride);
      }
    }

    nextBuildings[stationKey] = { ...cfg, activeTaxiRides: remaining };
  }

  return { people: nextPeople, buildings: nextBuildings, vehicles: nextVehicles };
}

/** Run AI for all people; returns updated economy + vehicles */
export function tickPeopleSimulation(
  economy: EconomyState,
  vehicles: Record<string, Vehicle>,
  grid: GridData,
  now = Date.now(),
  traffic?: TrafficState | null,
  opts?: { realNow?: number },
): { economy: EconomyState; vehicles: Record<string, Vehicle> } {
  if (economy.peoplePaused) return { economy, vehicles };

  const realNow = opts?.realNow ?? Date.now();
  // `now` is city/sim time (schedules, activityUntil); realNow is for aging only
  let people = { ...(economy.people || {}) };
  let buildings = { ...(economy.buildings || {}) };
  let nextVehicles = { ...vehicles };

  // Auto-generate schedules for people who don't have one yet
  people = ensurePersonSchedules(people, grid, buildings);

  const ids = Object.keys(people);
  for (const id of ids) {
    const patch = simulatePersonStep(
      people[id],
      now,
      {
        grid,
        buildings,
        vehicles: nextVehicles,
        people,
        traffic,
      },
      { realNow },
    );
    people[id] = patch.person;

    if (patch.vehicleDestination) {
      const { vehicleId, dest } = patch.vehicleDestination;
      nextVehicles = applyVehicleDestination(
        nextVehicles,
        people,
        vehicleId,
        dest,
        patch.person,
        now,
      );
    }

    if (patch.vehiclePark) {
      const v = nextVehicles[patch.vehiclePark.vehicleId];
      if (v && !v.manualOverride) {
        nextVehicles[patch.vehiclePark.vehicleId] = {
          ...v,
          isMoving: false,
          destination: null,
          parkingStopUntil: now + 12_000,
        };
      }
    }

    if (patch.newTaxiRide) {
      const { stationKey, ride } = patch.newTaxiRide;
      const b = buildings[stationKey];
      // Only dispatch taxis already owned by a real station fleet — do not auto-claim
      if (b?.role === 'taxi-station') {
        const fleet = b.taxiFleetIds || [];
        if (fleet.includes(ride.taxiId)) {
          buildings[stationKey] = {
            ...b,
            activeTaxiRides: [...(b.activeTaxiRides || []), ride],
          };
        }
      }
    }

    if (patch.completeTaxiRide) {
      const { stationKey, rideId } = patch.completeTaxiRide;
      const b = buildings[stationKey];
      if (b) {
        buildings[stationKey] = {
          ...b,
          activeTaxiRides: (b.activeTaxiRides || []).filter(r => r.id !== rideId),
        };
      }
    }

    if (patch.buildingInventoryDelta) {
      const { buildingKey, item, delta } = patch.buildingInventoryDelta;
      const b = buildings[buildingKey];
      if (b) {
        const inv = { ...(b.inventory || {}) };
        inv[item] = Math.max(0, (inv[item] || 0) + delta);
        buildings[buildingKey] = { ...b, inventory: inv };
      }
    }
  }

  // Taxi pickup / dropoff state machine
  const taxiResult = processTaxiRides(people, buildings, nextVehicles, now);
  people = taxiResult.people;
  buildings = taxiResult.buildings;
  nextVehicles = taxiResult.vehicles;

  Object.keys(nextVehicles).forEach(vid => {
    nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], people);
  });

  return {
    economy: {
      ...economy,
      people,
      families: economy.families || {},
      buildings,
    },
    vehicles: nextVehicles,
  };
}
