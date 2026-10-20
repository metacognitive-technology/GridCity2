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
  TravelPreference,
  Vehicle,
  VehicleType,
  Point,
  TrafficState,
  GridTile,
} from './types';
import { isRoadTile, TILE_CONNECTIONS } from './traffic';
import { ROAD_INSET_1L, ROAD_INSET_2L, ROAD_INSET_4L, TILE_PX } from './roadGeometry';

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

/** Tile key when the person is inside a home or building; otherwise null. */
export function indoorTileKey(loc: PersonLocation): string | null {
  if (loc.kind === 'home') return loc.homeKey;
  if (loc.kind === 'building') return loc.buildingKey;
  return null;
}

export function locationLabel(loc: PersonLocation): string {
  switch (loc.kind) {
    case 'home':
      return `Inside ${loc.homeKey}`;
    case 'building':
      return `Inside ${loc.buildingKey}`;
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

function isTrainStationType(type: string | undefined): boolean {
  return type === 'building-station' || type === 'building-train-station-large';
}

function isPersonWaiting(activity?: string): boolean {
  return activity === 'waiting_taxi' || activity === 'waiting_bus' || activity === 'waiting_train';
}

export const TRAVEL_PREFERENCE_OPTIONS: { id: TravelPreference; label: string }[] = [
  { id: 'car', label: 'Car' },
  { id: 'bus', label: 'Bus' },
  { id: 'robotaxi', label: 'Robotaxi' },
  { id: 'train', label: 'Train' },
  { id: 'walk', label: 'Walk' },
];

export function preferenceToTransport(pref: TravelPreference): TravelTransport {
  return pref === 'robotaxi' ? 'taxi' : pref;
}

export function travelPreferenceLabel(pref: TravelPreference | undefined): string {
  if (!pref) return 'Auto';
  return TRAVEL_PREFERENCE_OPTIONS.find(o => o.id === pref)?.label || pref;
}

const FAMILY_PREF_CYCLE: TravelPreference[] = ['car', 'walk', 'bus', 'robotaxi', 'train'];

/** True if cell is road (incl. bus stops / crossings). */
function cellIsRoad(grid: GridData, x: number, y: number): boolean {
  const t = topTile(grid, `${x},${y}`);
  if (!t) return false;
  return isRoadTile(t.type) || t.type === 'rail-road-crossing' || isBusStopTile(t.type);
}

/** Asphalt inset as a 0–1 fraction of the tile (white curb is outside this band). */
export function roadAsphaltInsetFrac(type?: string): number {
  if (type?.includes('4lane')) return ROAD_INSET_4L / TILE_PX;
  if (type?.includes('oneway')) return ROAD_INSET_1L / TILE_PX;
  return ROAD_INSET_2L / TILE_PX;
}

/** Center of the white sidewalk strip (from the tile edge). */
export function sidewalkCenterFrac(type?: string): number {
  const asphalt = roadAsphaltInsetFrac(type);
  return Math.max(0.04, Math.min(0.2, asphalt * 0.5));
}

function roadPorts(type: string, rotation: number): number[] {
  const ports =
    TILE_CONNECTIONS[type] ||
    (type === 'rail-road-crossing' || type.startsWith('road') ? [0, 1, 2, 3] : []);
  const rot = ((Math.round((rotation || 0) / 90) % 4) + 4) % 4;
  return ports.map(p => (p + rot) % 4);
}

/** Local 0–1 coords: true if this point is on the black asphalt of the tile. */
export function isLocalOnAsphalt(
  lx: number,
  ly: number,
  type: string,
  rotation = 0,
): boolean {
  if (type.startsWith('parking-')) return false;
  const inset = roadAsphaltInsetFrac(type);
  const outer = 1 - inset;
  const ports = new Set(roadPorts(type, rotation));
  if (ports.size === 0 && (type.startsWith('road') || type === 'rail-road-crossing')) {
    ports.add(0);
    ports.add(2);
  }
  const inX = lx >= inset && lx <= outer;
  const inY = ly >= inset && ly <= outer;
  const hasN = ports.has(0);
  const hasE = ports.has(1);
  const hasS = ports.has(2);
  const hasW = ports.has(3);
  const ns = (hasN || hasS) && inX && (
    (hasN && hasS) ||
    (hasN && ly <= outer) ||
    (hasS && ly >= inset) ||
    inY
  );
  const ew = (hasE || hasW) && inY && (
    (hasE && hasW) ||
    (hasE && lx >= inset) ||
    (hasW && lx <= outer) ||
    inX
  );
  return ns || ew;
}

/** True when a person is standing on the black roadway (not the white curb). */
export function isOnRoadAsphalt(grid: GridData, wx: number, wy: number): boolean {
  const tx = Math.floor(wx);
  const ty = Math.floor(wy);
  const t = topTile(grid, `${tx},${ty}`);
  if (!t) return false;
  if (!cellIsRoad(grid, tx, ty)) return false;
  return isLocalOnAsphalt(wx - tx, wy - ty, t.type, t.rotation || 0);
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

/** Sidewalk position on a road tile (white curb, not asphalt). side: 0=N 1=E 2=S 3=W */
export function sidewalkPosition(
  tx: number,
  ty: number,
  side: number,
  along = 0.5,
  tileType?: string,
): { x: number; y: number } {
  const s = ((side % 4) + 4) % 4;
  const inset = sidewalkCenterFrac(tileType);
  const a = Math.max(inset, Math.min(1 - inset, along));
  if (s === 0) return { x: tx + a, y: ty + inset }; // north curb
  if (s === 1) return { x: tx + 1 - inset, y: ty + a }; // east
  if (s === 2) return { x: tx + a, y: ty + 1 - inset }; // south
  return { x: tx + inset, y: ty + a }; // west
}

/**
 * Continuous point on a road tile for walking.
 * Stays on the white curb when moving along the road; only aims at the
 * asphalt center when the path is crossing the street.
 */
export function walkPointOnRoad(
  tile: Point,
  grid: GridData,
  fromX: number,
  fromY: number,
  next?: Point,
): { x: number; y: number } {
  const t = topTile(grid, `${tile.x},${tile.y}`);
  const type = t?.type || 'road-straight';
  const rotation = t?.rotation || 0;
  const ports = new Set(roadPorts(type, rotation));
  const nsRoad = ports.has(0) || ports.has(2);
  const ewRoad = ports.has(1) || ports.has(3);

  let moveDx = 0;
  let moveDy = 0;
  if (next) {
    moveDx = next.x - tile.x;
    moveDy = next.y - tile.y;
  } else {
    moveDx = tile.x + 0.5 - fromX;
    moveDy = tile.y + 0.5 - fromY;
  }
  const movingNS = Math.abs(moveDy) >= Math.abs(moveDx);
  const lx = fromX - tile.x;
  const ly = fromY - tile.y;
  const curb = sidewalkCenterFrac(type);
  // Corners stay in the white; mid-edge of an intersection is asphalt.
  const alongNS = next ? (moveDy > 0 ? 1 - curb : curb) : Math.max(curb, Math.min(1 - curb, ly));
  const alongEW = next ? (moveDx > 0 ? 1 - curb : curb) : Math.max(curb, Math.min(1 - curb, lx));

  // Along a NS-only road: stay on east or west white strip
  if (nsRoad && !ewRoad) {
    if (movingNS || Math.abs(moveDx) < 0.1) {
      const side = lx < 0.5 ? 3 : 1;
      return sidewalkPosition(tile.x, tile.y, side, 0.5, type);
    }
    // Perpendicular: crossing to the other side
    return { x: tile.x + 0.5, y: tile.y + 0.5 };
  }
  // Along an EW-only road: stay on north or south white strip
  if (ewRoad && !nsRoad) {
    if (!movingNS || Math.abs(moveDy) < 0.1) {
      const side = ly < 0.5 ? 0 : 2;
      return sidewalkPosition(tile.x, tile.y, side, 0.5, type);
    }
    return { x: tile.x + 0.5, y: tile.y + 0.5 };
  }
  // Intersection / T: walk the white corner on the approach side, not the asphalt center
  if (nsRoad && ewRoad) {
    if (movingNS) {
      const side = lx < 0.5 ? 3 : 1;
      return sidewalkPosition(tile.x, tile.y, side, alongNS, type);
    }
    const side = ly < 0.5 ? 0 : 2;
    return sidewalkPosition(tile.x, tile.y, side, alongEW, type);
  }
  const side = nearestSidewalkSide(tile.x, tile.y, fromX, fromY);
  return sidewalkPosition(tile.x, tile.y, side, 0.5, type);
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
    // Side of road nearest the click (white sidewalk / curb)
    const sp = walkPointOnRoad(
      { x: gridX, y: gridY },
      grid,
      gridX + relX,
      gridY + relY,
    );
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
 * Always visible: inside home/building, walking, waiting outside, or riding a vehicle.
 */
export function getPersonMapPlacement(
  person: Person,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
  stackIndex = 0,
): {
  x: number;
  y: number;
  visible: boolean;
  crossing?: boolean;
  waiting?: boolean;
  inVehicle?: boolean;
} {
  const loc = person.location;
  const fan = (stackIndex % 2 === 0 ? 1 : -1) * Math.ceil(stackIndex / 2) * 0.12;
  const vfan = Math.floor(stackIndex / 5) * 0.08;

  if (loc.kind === 'vehicle') {
    const v = vehicles[loc.vehicleId];
    if (!v) {
      const tile = personTilePos(person) || parseKey(person.homeKey) || { x: 0, y: 0 };
      return { x: tile.x + 0.5, y: tile.y + 0.5, visible: true };
    }
    // Sit on the vehicle so the occupant stays visible above the car sprite
    return {
      x: v.x + 0.5 + fan * 0.25,
      y: v.y + 0.42 + vfan,
      visible: true,
      inVehicle: true,
    };
  }

  if (loc.kind === 'walking') {
    return {
      x: loc.x,
      y: loc.y,
      visible: true,
      crossing: isOnRoadAsphalt(grid, loc.x, loc.y),
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
        waiting: isPersonWaiting(person.activity),
      };
    }
    const stand = outdoorStandPosition(loc.atKey, grid, stackIndex);
    return {
      x: stand.x,
      y: stand.y,
      visible: true,
      waiting: isPersonWaiting(person.activity),
    };
  }

  if (loc.kind === 'tile') {
    // Stand on sidewalk of tile if road, else center-south
    if (cellIsRoad(grid, loc.x, loc.y)) {
      const t = topTile(grid, `${loc.x},${loc.y}`);
      const side = 2;
      const sp = sidewalkPosition(
        loc.x,
        loc.y,
        side,
        0.35 + (stackIndex % 3) * 0.15,
        t?.type,
      );
      return {
        x: sp.x,
        y: sp.y,
        visible: true,
        waiting: isPersonWaiting(person.activity),
        crossing: isOnRoadAsphalt(grid, sp.x, sp.y),
      };
    }
    return {
      x: loc.x + 0.5 + ((stackIndex % 3) - 1) * 0.1,
      y: loc.y + 0.72,
      visible: true,
      waiting: isPersonWaiting(person.activity),
    };
  }

  if (loc.kind === 'home' || loc.kind === 'building') {
    const key = loc.kind === 'home' ? loc.homeKey : loc.buildingKey;
    const p = parseKey(key) || { x: 0, y: 0 };
    // Inside the footprint (tile center), not the curb — shows they entered
    return {
      x: p.x + 0.5 + fan,
      y: p.y + 0.42 + vfan,
      visible: true,
    };
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
  if (transport === 'car' || transport === 'taxi' || transport === 'bus' || transport === 'train') return false;
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
    stand = walkPointOnRoad(first, grid, first.x + 0.5, first.y + 0.9, path[1]);
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
      crossing: isOnRoadAsphalt(grid, stand.x, stand.y),
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
  buildings?: Record<string, BuildingConfig>,
): Person {
  if (person.location.kind !== 'walking') return person;
  const loc = person.location;
  const path = loc.path;
  let idx = loc.pathIndex;
  if (!path.length || idx >= path.length) {
    return finishWalkArrival(person, now, buildings, grid);
  }

  let x = loc.x;
  let y = loc.y;
  let remaining = stepTiles;

  while (remaining > 0 && idx < path.length) {
    const targetTile = path[idx];
    const isRoad = cellIsRoad(grid, targetTile.x, targetTile.y);
    let tx: number;
    let ty: number;
    if (isRoad) {
      const next = path[idx + 1];
      const sp = walkPointOnRoad(targetTile, grid, x, y, next);
      tx = sp.x;
      ty = sp.y;
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
    }
  }

  const crossing = isOnRoadAsphalt(grid, x, y);

  if (idx >= path.length) {
    return finishWalkArrival(
      {
        ...person,
        location: { ...loc, x, y, pathIndex: idx, crossing: false },
      },
      now,
      buildings,
      grid,
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

function finishWalkArrival(
  person: Person,
  now: number,
  buildings?: Record<string, BuildingConfig>,
  grid?: GridData,
): Person {
  const intent = person.travelIntent;

  // Reached the owned car — stand next to it; the next travel step boards and drives.
  if (intent?.pickupVehicleId) {
    const atKey =
      person.location.kind === 'walking'
        ? person.location.destKey ||
          `${Math.floor(person.location.x)},${Math.floor(person.location.y)}`
        : currentPlaceKey(person);
    return {
      ...person,
      location: grid ? toOutdoorLocation(atKey, grid) : { kind: 'outdoor', atKey },
      activity: 'commuting',
      activityUntil: now,
      travelIntent: intent,
    };
  }

  const walkedKey =
    person.location.kind === 'walking'
      ? person.location.destKey ||
        `${Math.floor(person.location.x)},${Math.floor(person.location.y)}`
      : currentPlaceKey(person);

  // Reached the bus stop — wait for the bus. Train access keeps its station as viaKey.
  if (
    intent?.leg === 'to-bus-stop' ||
    (intent?.leg === 'to-train-station' && person.busDropoffStop && walkedKey !== intent.viaKey)
  ) {
    const stop = intent.leg === 'to-bus-stop' ? intent.viaKey || walkedKey : walkedKey;
    return {
      ...person,
      location: grid ? toOutdoorLocation(stop, grid) : { kind: 'outdoor', atKey: stop },
      activity: 'waiting_bus',
      activityUntil: now + 180_000,
      busDropoffStop: intent.alightKey || person.busDropoffStop,
      travelIntent:
        intent.leg === 'to-train-station'
          ? intent
          : { ...intent, leg: 'bus-ride' },
    };
  }

  // Reached the train station on foot — wait for a train.
  if (intent?.leg === 'to-train-station') {
    const station = intent.viaKey || walkedKey;
    return {
      ...person,
      location: grid ? toOutdoorLocation(station, grid) : { kind: 'outdoor', atKey: station },
      activity: 'waiting_train',
      activityUntil: now,
      travelIntent: intent,
    };
  }

  const purpose = intent?.purpose || 'home';
  const destKey = intent?.destinationKey || person.homeKey;
  const shopMs =
    purpose === 'shop' ? shoppingDwellMs(buildings?.[destKey]) : 0;
  return {
    ...person,
    location: locationForArrival(purpose, destKey, person.homeKey),
    activity: activityForArrival(purpose),
    activityUntil:
      purpose === 'work'
        ? now + 45_000 + Math.random() * 30_000
        : purpose === 'shop'
          ? now + shopMs
          : purpose === 'care'
            ? now + 25_000
            : now + 30_000 + Math.random() * 40_000,
    travelIntent: undefined,
    taxiRideId: undefined,
  };
}

/** True if the person's current tile is within maxDist of the vehicle. */
export function personNearVehicle(person: Person, vehicle: Vehicle, maxDist = 2): boolean {
  const pos = personTilePos(person, { [vehicle.id]: vehicle });
  if (!pos) return false;
  return manh(Math.floor(pos.x), Math.floor(pos.y), Math.floor(vehicle.x), Math.floor(vehicle.y)) <= maxDist;
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
      onRoad = isOnRoadAsphalt(grid, px, py);
      crossing = onRoad;
    } else if (loc.kind === 'tile' && cellIsRoad(grid, loc.x, loc.y)) {
      px = loc.x + 0.5;
      py = loc.y + 0.5;
      onRoad = isOnRoadAsphalt(grid, px, py);
      crossing = onRoad;
    } else if (loc.kind === 'outdoor') {
      const tp = parseKey(loc.atKey);
      if (!tp) continue;
      px = tp.x + (loc.ox ?? 0.5);
      py = tp.y + (loc.oy ?? 0.5);
      onRoad = isOnRoadAsphalt(grid, px, py);
      crossing = onRoad;
      if (!onRoad) continue;
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
    person.activity === 'waiting_bus' ||
    person.activity === 'waiting_train' ||
    person.activity === 'commuting' ||
    person.activity === 'seeking_care' ||
    person.activity === 'walking' ||
    person.activity === 'shopping'
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

  const prefTransport = person.travelPreference
    ? preferenceToTransport(person.travelPreference)
    : best.transport || 'auto';
  return {
    intent: {
      purpose: best.purpose as TravelPurpose,
      destinationKey: dest,
      transport: prefTransport,
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
    travelPreference: FAMILY_PREF_CYCLE[Math.floor(Math.random() * FAMILY_PREF_CYCLE.length)],
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
 * Drop deleted taxis from every station that still lists them.
 * Fleet membership and in-progress rides for those ids are removed.
 * Returns the same buildings object when nothing referenced the ids.
 */
export function releaseDeletedTaxis(
  buildings: Record<string, BuildingConfig>,
  removedIds: Iterable<string>,
): Record<string, BuildingConfig> {
  const gone = new Set(removedIds);
  gone.delete('');
  if (gone.size === 0) return buildings;
  let next: Record<string, BuildingConfig> | null = null;
  for (const [key, cfg] of Object.entries(buildings)) {
    const fleet = cfg.taxiFleetIds;
    const rides = cfg.activeTaxiRides;
    const nextFleet = fleet?.filter(id => !gone.has(id));
    const nextRides = rides?.filter(r => !gone.has(r.taxiId));
    const fleetChanged = !!fleet && nextFleet!.length !== fleet.length;
    const ridesChanged = !!rides && nextRides!.length !== rides.length;
    if (!fleetChanged && !ridesChanged) continue;
    if (!next) next = { ...buildings };
    next[key] = {
      ...cfg,
      ...(fleetChanged ? { taxiFleetIds: nextFleet } : {}),
      ...(ridesChanged ? { activeTaxiRides: nextRides } : {}),
    };
  }
  return next ?? buildings;
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

export function personAtBuildingKey(person: Person, buildingKey: string): boolean {
  if (person.location.kind === 'building' && person.location.buildingKey === buildingKey) return true;
  if (person.location.kind === 'outdoor' && person.location.atKey === buildingKey) return true;
  return false;
}

/** Shoppers physically at this store (inside or standing outside). */
export function peopleShoppingAt(
  people: Record<string, Person> | undefined,
  buildingKey: string,
): Person[] {
  if (!people || !buildingKey) return [];
  return Object.values(people).filter(
    p => p.activity === 'shopping' && personAtBuildingKey(p, buildingKey),
  );
}

/** How long a shopper stays to receive 1 unit at the store's per-customer rate. */
export function shoppingDwellMs(cfg: BuildingConfig | undefined): number {
  const rates = cfg?.consumptionRates || {};
  const goodsRate = rates.goods || 0;
  const others = Object.entries(rates)
    .filter(([id, r]) => id !== 'goods' && (r || 0) > 0)
    .map(([, r]) => r);
  const rate = goodsRate > 0 ? goodsRate : others.length ? Math.max(...others) : 0;
  if (!(rate > 0)) return 4000;
  return Math.round(Math.max(2000, Math.min(60_000, 1000 / rate)));
}

function storePurchaseItems(cfg: BuildingConfig | undefined): string[] {
  if (!cfg?.consumptionRates) return ['goods'];
  const items = Object.entries(cfg.consumptionRates)
    .filter(([, r]) => (r || 0) > 0)
    .map(([id]) => id);
  return items.length > 0 ? items : ['goods'];
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
  buildingInventoryDelta?:
    | { buildingKey: string; item: string; delta: number }
    | Array<{ buildingKey: string; item: string; delta: number }>;
  heal?: boolean;
  /** Register a new taxi ride on a station */
  newTaxiRide?: { stationKey: string; ride: ActiveTaxiRide };
  /** Remove completed taxi ride */
  completeTaxiRide?: { stationKey: string; rideId: string };
}

export type SimCtx = {
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

function isAtTravelDestination(p: Person, destKey: string): boolean {
  if (!destKey) return false;
  if (p.location.kind === 'home' && (p.location.homeKey === destKey || p.homeKey === destKey)) {
    return true;
  }
  if (p.location.kind === 'building' && p.location.buildingKey === destKey) return true;
  if (p.location.kind === 'outdoor' && p.location.atKey === destKey) return true;
  return false;
}

/** Tile a car or taxi should aim at. Train/bus access legs aim at viaKey. */
function intentMoveKey(intent: PersonTravelIntent): string {
  if ((intent.leg === 'to-train-station' || intent.leg === 'to-bus-stop') && intent.viaKey) {
    return intent.viaKey;
  }
  return intent.destinationKey;
}

/** Road / driveway tile a car should route to for a building or home key. */
function driveDestinationPoint(intent: PersonTravelIntent, grid: GridData): Point | null {
  const key = intentMoveKey(intent);
  const p = parseKey(key);
  if (!p) return null;
  // Going home (final leg) still parks on the house tile, matching commute tests.
  if (!intent.leg && intent.purpose === 'home') return p;
  const t = topTile(grid, key);
  if (t) {
    const ty = t.type;
    if (
      isRoadTile(ty) ||
      ty.startsWith('parking-') ||
      isResidentialHomeType(ty) ||
      isBusStopTile(ty)
    ) {
      return p;
    }
  }
  const road = findNearestRoadNeighbor(key, grid);
  if (road) return parseKey(road.roadKey);
  return p;
}

function shouldDriveOwnedCar(
  intent: PersonTravelIntent,
  car: Vehicle | null,
): boolean {
  if (!car) return false;
  if (
    intent.transport === 'walk' ||
    intent.transport === 'taxi' ||
    intent.transport === 'bus' ||
    intent.transport === 'train'
  ) {
    return false;
  }
  if (intent.transport === 'car') return true;
  // auto: work / home commute always uses the family car when available
  return intent.purpose === 'work' || intent.purpose === 'home';
}

function arrivedFromTrip(
  p: Person,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
  opts?: { payWork?: boolean },
): PeopleSimPatch {
  const purpose = intent.purpose;
  const destKey = intent.destinationKey;
  const shopMs = purpose === 'shop' ? shoppingDwellMs(ctx.buildings[destKey]) : 0;
  return {
    person: {
      ...p,
      location: locationForArrival(purpose, destKey, p.homeKey),
      activity: activityForArrival(purpose),
      activityUntil:
        purpose === 'work'
          ? now + 45_000 + Math.random() * 30_000
          : purpose === 'shop'
            ? now + shopMs
            : purpose === 'care'
              ? now + 25_000
              : now + 30_000 + Math.random() * 40_000,
      travelIntent: undefined,
      taxiRideId: undefined,
      money: opts?.payWork && purpose === 'work' ? (p.money || 0) + 8 : p.money,
    },
  };
}

/** Public commute: start walking or driving immediately (no teleport). */
export function startPersonTravel(
  person: Person,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
): PeopleSimPatch {
  return beginTravel(person, intent, now, ctx);
}

/**
 * Intent for Go To Work / Go Home: drive the owned car if there is one, otherwise walk.
 */
export function commuteIntentForPerson(
  person: Person,
  purpose: 'work' | 'home',
  vehicles: Record<string, Vehicle>,
  people: Record<string, Person>,
): PersonTravelIntent | null {
  const destinationKey = purpose === 'work' ? person.workplaceKey : person.homeKey;
  if (!destinationKey) return null;
  if (person.travelPreference) {
    return {
      purpose,
      destinationKey,
      transport: preferenceToTransport(person.travelPreference),
    };
  }
  const car = findOwnedCar(person, vehicles, people);
  return {
    purpose,
    destinationKey,
    transport: car ? 'car' : 'walk',
  };
}

const STORE_PURCHASE_COST = 5;

/** Shopper finished checkout: take 1 unit per consumption-rate item, pay, and leave. */
function completeStoreVisit(p: Person, now: number, ctx: SimCtx): PeopleSimPatch {
  let storeKey: string | null = null;
  if (p.location.kind === 'building') storeKey = p.location.buildingKey;
  else if (p.location.kind === 'outdoor') storeKey = p.location.atKey;

  const cfg = storeKey ? ctx.buildings[storeKey] : undefined;
  const deltas: Array<{ buildingKey: string; item: string; delta: number }> = [];
  let money = p.money || 0;
  if (storeKey && cfg?.role === 'store') {
    const inv = cfg.inventory || {};
    for (const item of storePurchaseItems(cfg)) {
      if ((inv[item] || 0) >= 1) {
        deltas.push({ buildingKey: storeKey, item, delta: -1 });
      }
    }
    if (deltas.length > 0) money = Math.max(0, money - STORE_PURCHASE_COST);
  }

  const travel = beginTravel(
    {
      ...p,
      money,
      activity: 'idle',
      travelIntent: undefined,
    },
    { purpose: 'home', destinationKey: p.homeKey },
    now,
    ctx,
  );
  return {
    ...travel,
    buildingInventoryDelta:
      deltas.length === 1 ? deltas[0] : deltas.length > 0 ? deltas : undefined,
    person: { ...travel.person, money },
  };
}

function boardOwnedCarAndDrive(
  p: Person,
  car: Vehicle,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
): PeopleSimPatch {
  const driveDest = driveDestinationPoint(intent, ctx.grid) || parseKey(intent.destinationKey);
  return {
    person: {
      ...p,
      location: { kind: 'vehicle', vehicleId: car.id, seat: 'driver' },
      activity: intent.purpose === 'care' ? 'seeking_care' : 'commuting',
      activityUntil: now + 25_000,
      travelIntent: { ...intent, transport: 'car', pickupVehicleId: undefined },
      taxiRideId: undefined,
    },
    vehicleDestination: driveDest ? { vehicleId: car.id, dest: driveDest } : undefined,
  };
}

function walkToOwnedCar(
  p: Person,
  car: Vehicle,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
): PeopleSimPatch | null {
  const carKey = `${Math.floor(car.x)},${Math.floor(car.y)}`;
  const walker = beginWalkTrip(
    p,
    { ...intent, destinationKey: carKey, transport: 'walk' },
    ctx.grid,
    ctx.traffic,
    ctx.vehicles,
    now,
  );
  if (!walker) return null;
  return {
    person: {
      ...walker,
      travelIntent: {
        ...intent,
        transport: 'car',
        pickupVehicleId: car.id,
      },
      location:
        walker.location.kind === 'walking'
          ? { ...walker.location, destKey: carKey }
          : walker.location,
    },
  };
}

export function listBusStopKeys(grid: GridData): string[] {
  const keys: string[] = [];
  Object.entries(grid).forEach(([key, tiles]) => {
    const top = tiles?.[tiles.length - 1];
    if (top && isBusStopTile(top.type)) keys.push(key);
  });
  return keys;
}

export function listTrainStationAnchors(grid: GridData): string[] {
  const keys = new Set<string>();
  Object.entries(grid).forEach(([key, tiles]) => {
    for (const t of tiles || []) {
      if (!isTrainStationType(t.type)) continue;
      if (t.part === 'member') keys.add(t.anchorKey || key);
      else keys.add(key);
    }
  });
  return Array.from(keys);
}

function stationCells(anchor: string, grid: GridData): Point[] {
  const cells: Point[] = [];
  Object.entries(grid).forEach(([key, tiles]) => {
    const t = (tiles || []).find(x => isTrainStationType(x.type));
    if (!t) return;
    const owns = key === anchor || t.anchorKey === anchor;
    if (!owns) return;
    const p = parseKey(key);
    if (p) cells.push(p);
  });
  if (!cells.length) {
    const p = parseKey(anchor);
    if (p) cells.push(p);
  }
  return cells;
}

function nearestKeyToPoint(origin: Point, keys: string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const k of keys) {
    const p = parseKey(k);
    if (!p) continue;
    const d = manh(origin.x, origin.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Tiles around a stopped bus that waiting riders can board from. */
export const BUS_BOARD_RADIUS = 2;

function routeStopNearest(stops: string[], targetKey: string | undefined): string | null {
  if (!targetKey || stops.length === 0) return null;
  const origin = parseKey(targetKey);
  if (!origin) return null;
  return nearestKeyToPoint(origin, stops);
}

/** Place the rider is trying to reach on this bus (station for a train connection). */
function passengerAlightTarget(person: Person): string | undefined {
  const intent = person.travelIntent;
  if (intent?.leg === 'to-train-station') {
    return intent.viaKey || intent.alightKey || intent.destinationKey || person.busDropoffStop;
  }
  return intent?.destinationKey || person.busDropoffStop || intent?.alightKey;
}

function personWantsBus(p: Person): boolean {
  if (p.location.kind === 'vehicle') return false;
  if (p.activity === 'working' || p.activity === 'in_care' || p.activity === 'shopping') return false;
  return (
    p.activity === 'waiting_bus' ||
    p.travelIntent?.leg === 'bus-ride' ||
    p.travelIntent?.leg === 'to-bus-stop' ||
    (p.travelIntent?.leg === 'to-train-station' && !!p.busDropoffStop)
  );
}

/**
 * Board people waiting at this stop onto the bus, and alight riders when this stop
 * is the route stop nearest their destination. They leave outdoors with a from-bus
 * trip so the next step walks or takes another mode. Same map when nobody moves.
 */
export function exchangeBusPassengers(
  people: Record<string, Person>,
  bus: Vehicle,
  grid: GridData,
  now: number,
): Record<string, Person> {
  const here = `${Math.floor(bus.x)},${Math.floor(bus.y)}`;
  const route = bus.busRoute || [];
  const top = grid[here]?.[grid[here].length - 1];
  const onStop = !!top && isBusStopTile(top.type);
  if (!onStop && !route.includes(here)) return people;
  const stopPt = parseKey(here);
  if (!stopPt) return people;

  let next = people;
  let changed = false;
  const commit = (id: string, person: Person) => {
    if (!changed) {
      next = { ...people };
      changed = true;
    }
    next[id] = person;
  };

  const alightHere = (p: Person): boolean => {
    const best = routeStopNearest(route, passengerAlightTarget(p));
    if (best) return best === here;
    return p.busDropoffStop === here || p.travelIntent?.alightKey === here;
  };

  for (const pid of getPassengerIds(people, bus.id)) {
    const p = people[pid];
    if (!p || !alightHere(p)) continue;
    const intent = p.travelIntent;
    if (intent?.leg === 'to-train-station') {
      commit(pid, {
        ...p,
        location: toOutdoorLocation(here, grid),
        activity: 'commuting',
        activityUntil: now,
        busDropoffStop: undefined,
        taxiRideId: undefined,
        travelIntent: intent,
      });
      continue;
    }
    commit(pid, {
      ...p,
      location: toOutdoorLocation(here, grid),
      activity: 'commuting',
      activityUntil: now,
      busDropoffStop: undefined,
      taxiRideId: undefined,
      travelIntent: intent
        ? {
            purpose: intent.purpose,
            destinationKey: intent.destinationKey,
            transport: 'walk',
            leg: 'from-bus',
          }
        : undefined,
    });
  }

  const maxPax = bus.maxPassengers ?? getMaxPassengers(bus.type);
  let aboard = getPassengerIds(next, bus.id).length;
  const candidates = Object.values(next)
    .filter(p => {
      if (!personWantsBus(p)) return false;
      const pos = personTilePos(p);
      if (!pos) return false;
      if (manh(Math.floor(pos.x), Math.floor(pos.y), stopPt.x, stopPt.y) > BUS_BOARD_RADIUS) {
        return false;
      }
      const best = routeStopNearest(route, passengerAlightTarget(p));
      // Already at the closest stop this bus visits — wait for a useful ride.
      if (best === here) return false;
      return true;
    })
    .sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b)));

  for (const p of candidates) {
    if (aboard >= maxPax) break;
    if (canBoardAsPassenger(p, bus, next)) continue;
    const intent = p.travelIntent;
    const keepTrain = intent?.leg === 'to-train-station';
    const dropoff =
      routeStopNearest(route, passengerAlightTarget(p)) ||
      p.busDropoffStop ||
      intent?.alightKey ||
      route.find(k => k !== here) ||
      here;
    if (dropoff === here) continue;
    commit(p.id, {
      ...p,
      location: { kind: 'vehicle', vehicleId: bus.id, seat: 'passenger' },
      activity: keepTrain && intent?.purpose === 'care' ? 'seeking_care' : 'commuting',
      activityUntil: now + 120_000,
      busDropoffStop: dropoff,
      taxiRideId: undefined,
      travelIntent: keepTrain
        ? intent
        : {
            purpose: intent?.purpose || 'home',
            destinationKey: intent?.destinationKey || dropoff,
            transport: 'bus',
            leg: 'bus-ride',
            viaKey: here,
            alightKey: dropoff,
          },
    });
    aboard += 1;
  }

  return next;
}

function nearestStationAnchor(origin: Point, anchors: string[], grid: GridData): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const a of anchors) {
    let d = 9999;
    for (const c of stationCells(a, grid)) d = Math.min(d, manh(origin.x, origin.y, c.x, c.y));
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

function personAtAnchor(
  person: Person,
  anchor: string,
  grid: GridData,
  vehicles?: Record<string, Vehicle>,
): boolean {
  const cells = stationCells(anchor, grid);
  if (person.location.kind === 'building' && person.location.buildingKey === anchor) return true;
  if (person.location.kind === 'outdoor' && person.location.atKey === anchor) return true;
  if (person.location.kind === 'outdoor') {
    const p = parseKey(person.location.atKey);
    if (p && cells.some(c => c.x === p.x && c.y === p.y)) return true;
  }
  const pos = personTilePos(person, vehicles);
  if (!pos) return false;
  const tx = Math.floor(pos.x);
  const ty = Math.floor(pos.y);
  return cells.some(c => Math.abs(c.x - tx) + Math.abs(c.y - ty) <= 1);
}

function nearestRailKey(anchor: string, grid: GridData): string | null {
  let best: { key: string; d: number } | null = null;
  for (const c of stationCells(anchor, grid)) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        const t = topTile(grid, `${x},${y}`);
        if (!t?.type.startsWith('rail')) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (!best || d < best.d) best = { key: `${x},${y}`, d };
      }
    }
  }
  return best?.key ?? null;
}

function trainAtStation(v: Vehicle, anchor: string, grid: GridData): boolean {
  if (stationCells(anchor, grid).some(c => manh(v.x, v.y, c.x, c.y) <= 1)) return true;
  const rail = nearestRailKey(anchor, grid);
  return !!rail && vehicleNearKey(v, rail, 0);
}

function findTrainNearStation(
  anchor: string,
  vehicles: Record<string, Vehicle>,
  grid: GridData,
): Vehicle | null {
  let best: Vehicle | null = null;
  let bestD = 99;
  for (const v of Object.values(vehicles)) {
    if (v.type !== 'train') continue;
    let d = 99;
    for (const c of stationCells(anchor, grid)) d = Math.min(d, manh(v.x, v.y, c.x, c.y));
    const rail = nearestRailKey(anchor, grid);
    const rp = rail ? parseKey(rail) : null;
    if (rp) d = Math.min(d, manh(v.x, v.y, rp.x, rp.y));
    if (d <= 2 && d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

function modeFromPerson(p: Person, intent: PersonTravelIntent): TravelPreference | null {
  if (p.travelPreference) return p.travelPreference;
  if (intent.transport === 'walk') return 'walk';
  if (intent.transport === 'car') return 'car';
  if (intent.transport === 'taxi') return 'robotaxi';
  if (intent.transport === 'bus') return 'bus';
  if (intent.transport === 'train') return 'train';
  return null;
}

function walkToPlace(
  p: Person,
  intent: PersonTravelIntent,
  placeKey: string,
  now: number,
  ctx: SimCtx,
): PeopleSimPatch {
  const walker = beginWalkTrip(
    p,
    { ...intent, destinationKey: placeKey, transport: 'walk' },
    ctx.grid,
    ctx.traffic,
    ctx.vehicles,
    now,
  );
  if (!walker) {
    return {
      person: {
        ...p,
        location: toOutdoorLocation(currentPlaceKey(p), ctx.grid),
        activity: 'idle',
        activityUntil: now + 15_000,
        travelIntent: intent,
      },
    };
  }
  return {
    person: {
      ...walker,
      travelIntent: intent,
      location:
        walker.location.kind === 'walking'
          ? { ...walker.location, destKey: placeKey }
          : walker.location,
    },
  };
}

/** Road cell a taxi should drive to for a building, home, or stop key. */
function taxiRoutePoint(key: string, grid: GridData): Point | null {
  const direct = parseKey(key);
  if (!direct) return null;
  const t = topTile(grid, key);
  if (t && (isRoadTile(t.type) || t.type.startsWith('parking-') || isBusStopTile(t.type))) {
    return direct;
  }
  const road = findNearestRoadNeighbor(key, grid);
  if (road) return parseKey(road.roadKey);
  return direct;
}

function requestRobotaxi(
  p: Person,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
  destKey: string,
): PeopleSimPatch {
  const placeKey = currentPlaceKey(p);
  const outdoorWait = toOutdoorLocation(placeKey, ctx.grid);
  const idle = findIdleTaxi(ctx.buildings, ctx.vehicles, ctx.people);
  if (idle) {
    const ride: ActiveTaxiRide = {
      id: uid('ride'),
      taxiId: idle.taxi.id,
      passengerId: p.id,
      passengerLabel: personDisplayName(p),
      phase: 'to_pickup',
      pickupKey: placeKey,
      destinationKey: destKey,
      purpose: intent.purpose,
      startedAt: now,
    };
    const pickup = taxiRoutePoint(placeKey, ctx.grid);
    return {
      person: {
        ...p,
        location: outdoorWait,
        activity: 'waiting_taxi',
        activityUntil: now + 90_000,
        travelIntent: intent,
        taxiRideId: ride.id,
      },
      newTaxiRide: { stationKey: idle.stationKey, ride },
      vehicleDestination: pickup ? { vehicleId: idle.taxi.id, dest: pickup } : undefined,
    };
  }
  const fleetExists = Object.values(ctx.buildings).some(
    b => b.role === 'taxi-station' && (b.taxiFleetIds || []).length > 0,
  );
  if (fleetExists) {
    return {
      person: {
        ...p,
        location: outdoorWait,
        activity: 'waiting_taxi',
        activityUntil: now + 12_000,
        travelIntent: intent,
      },
    };
  }
  return walkToPlace(
    p,
    { ...intent, transport: intent.leg ? intent.transport : 'walk' },
    intent.leg === 'to-train-station' && intent.viaKey ? intent.viaKey : intent.destinationKey,
    now,
    ctx,
  );
}

/**
 * Walk to the nearest stop, wait, and leave the drop-off stop on the person.
 * Returns null when a bus ride would not move them closer.
 */
function beginBusTrip(
  p: Person,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
): PeopleSimPatch | null {
  const stops = listBusStopKeys(ctx.grid);
  if (!stops.length) return null;
  const from = personTilePos(p, ctx.vehicles);
  if (!from) return null;
  const trainAccess = intent.leg === 'to-train-station' && !!intent.viaKey;
  const alightOrigin = parseKey(trainAccess ? intent.viaKey! : intent.destinationKey);
  if (!alightOrigin) return null;
  const board = nearestKeyToPoint(from, stops);
  const alight = nearestKeyToPoint(alightOrigin, stops);
  if (!board || !alight || board === alight) return null;
  const boardPt = parseKey(board);
  if (!boardPt) return null;
  const atBoard = manh(from.x, from.y, boardPt.x, boardPt.y) <= 1;

  if (trainAccess) {
    const nextIntent: PersonTravelIntent = { ...intent, leg: 'to-train-station' };
    if (atBoard) {
      return {
        person: {
          ...p,
          location: toOutdoorLocation(board, ctx.grid),
          activity: 'waiting_bus',
          activityUntil: now + 180_000,
          busDropoffStop: alight,
          travelIntent: nextIntent,
          taxiRideId: undefined,
        },
      };
    }
    const walker = beginWalkTrip(
      p,
      { ...intent, destinationKey: board, transport: 'walk' },
      ctx.grid,
      ctx.traffic,
      ctx.vehicles,
      now,
    );
    if (!walker) return null;
    return {
      person: {
        ...walker,
        busDropoffStop: alight,
        travelIntent: nextIntent,
        location:
          walker.location.kind === 'walking'
            ? { ...walker.location, destKey: board }
            : walker.location,
      },
    };
  }

  const busIntent: PersonTravelIntent = {
    purpose: intent.purpose,
    destinationKey: intent.destinationKey,
    transport: 'bus',
    leg: 'to-bus-stop',
    viaKey: board,
    alightKey: alight,
  };
  if (atBoard) {
    return {
      person: {
        ...p,
        location: toOutdoorLocation(board, ctx.grid),
        activity: 'waiting_bus',
        activityUntil: now + 180_000,
        busDropoffStop: alight,
        travelIntent: { ...busIntent, leg: 'bus-ride' },
        taxiRideId: undefined,
      },
    };
  }
  const walker = beginWalkTrip(
    p,
    { ...busIntent, destinationKey: board, transport: 'walk' },
    ctx.grid,
    ctx.traffic,
    ctx.vehicles,
    now,
  );
  if (!walker) return null;
  return {
    person: {
      ...walker,
      busDropoffStop: alight,
      travelIntent: busIntent,
      location:
        walker.location.kind === 'walking'
          ? { ...walker.location, destKey: board }
          : walker.location,
    },
  };
}

function boardOrWaitForTrain(
  p: Person,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
): PeopleSimPatch {
  const station = intent.viaKey || intent.destinationKey;
  const alight = intent.alightKey || station;
  const train = findTrainNearStation(station, ctx.vehicles, ctx.grid);
  if (train && canBoardAsPassenger(p, train, ctx.people) === null) {
    const rail = nearestRailKey(alight, ctx.grid);
    const destPt = rail ? parseKey(rail) : null;
    return {
      person: {
        ...p,
        location: { kind: 'vehicle', vehicleId: train.id, seat: 'passenger' },
        activity: intent.purpose === 'care' ? 'seeking_care' : 'commuting',
        activityUntil: now + 60_000,
        travelIntent: {
          ...intent,
          leg: 'train-ride',
          transport: 'train',
          viaKey: station,
          alightKey: alight,
          pickupVehicleId: undefined,
        },
        taxiRideId: undefined,
      },
      vehicleDestination:
        destPt && !train.manualOverride ? { vehicleId: train.id, dest: destPt } : undefined,
    };
  }
  return {
    person: {
      ...p,
      location: toOutdoorLocation(station, ctx.grid),
      activity: 'waiting_train',
      activityUntil: now + 20_000,
      travelIntent: { ...intent, leg: 'to-train-station', viaKey: station, alightKey: alight },
    },
  };
}

/** After a train (or a bus that did not finish the trip): car if it is here, else bus, taxi, or walk. */
function beginEgress(p: Person, intent: PersonTravelIntent, now: number, ctx: SimCtx): PeopleSimPatch {
  const clean: PersonTravelIntent = {
    purpose: intent.purpose,
    destinationKey: intent.destinationKey,
    transport: 'walk',
    leg: intent.leg,
  };
  if (isAtTravelDestination(p, intent.destinationKey) && p.location.kind !== 'vehicle') {
    return arrivedFromTrip(p, clean, now, ctx);
  }
  const dist = personDistToKey(p, intent.destinationKey, ctx.vehicles);
  const car = findOwnedCar(p, ctx.vehicles, ctx.people);
  if (car && personNearVehicle(p, car, 3) && canBoardAsDriver(p, car, ctx.people) === null) {
    const carIntent: PersonTravelIntent = { ...clean, transport: 'car', leg: undefined };
    if (personNearVehicle(p, car, 2)) return boardOwnedCarAndDrive(p, car, carIntent, now, ctx);
    const toCar = walkToOwnedCar(p, car, carIntent, now, ctx);
    if (toCar) return toCar;
  }
  if (dist > WALK_MAX_TILES) {
    const bus = beginBusTrip(
      p,
      { purpose: intent.purpose, destinationKey: intent.destinationKey },
      now,
      ctx,
    );
    if (bus) return bus;
    if (findIdleTaxi(ctx.buildings, ctx.vehicles, ctx.people)) {
      return requestRobotaxi(
        p,
        { purpose: intent.purpose, destinationKey: intent.destinationKey, transport: 'taxi' },
        now,
        ctx,
        intent.destinationKey,
      );
    }
  }
  return walkToPlace(p, clean, intent.destinationKey, now, ctx);
}

/** Reach intent.viaKey by car, bus, taxi, or on foot. Does not board a train. */
function accessToStation(p: Person, intent: PersonTravelIntent, now: number, ctx: SimCtx): PeopleSimPatch {
  const station = intent.viaKey || intent.destinationKey;
  const kept: PersonTravelIntent = { ...intent, leg: 'to-train-station', viaKey: station };
  const car = findOwnedCar(p, ctx.vehicles, ctx.people);
  if (car && canBoardAsDriver(p, car, ctx.people) === null) {
    const carIntent: PersonTravelIntent = { ...kept, transport: 'car' };
    if (personNearVehicle(p, car, 2)) return boardOwnedCarAndDrive(p, car, carIntent, now, ctx);
    const toCar = walkToOwnedCar(p, car, carIntent, now, ctx);
    if (toCar) return toCar;
  }
  const bus = beginBusTrip(p, kept, now, ctx);
  if (bus) return bus;
  if (findIdleTaxi(ctx.buildings, ctx.vehicles, ctx.people)) {
    return requestRobotaxi(p, { ...kept, transport: 'taxi' }, now, ctx, station);
  }
  return walkToPlace(p, { ...kept, transport: 'train' }, station, now, ctx);
}

function beginTrainTrip(p: Person, intent: PersonTravelIntent, now: number, ctx: SimCtx): PeopleSimPatch {
  const anchors = listTrainStationAnchors(ctx.grid);
  const from = personTilePos(p, ctx.vehicles);
  const destPt = parseKey(intent.destinationKey);
  if (!from || !destPt || anchors.length === 0) {
    return beginEgress(p, { ...intent, leg: 'from-train' }, now, ctx);
  }
  const board = nearestStationAnchor(from, anchors, ctx.grid);
  const alight = nearestStationAnchor(destPt, anchors, ctx.grid);
  if (!board || !alight || board === alight) {
    return beginEgress(p, { ...intent, leg: 'from-train' }, now, ctx);
  }
  const trainIntent: PersonTravelIntent = {
    ...intent,
    transport: 'train',
    leg: 'to-train-station',
    viaKey: board,
    alightKey: alight,
    pickupVehicleId: undefined,
  };
  if (personAtAnchor(p, board, ctx.grid, ctx.vehicles)) {
    return boardOrWaitForTrain(p, trainIntent, now, ctx);
  }
  return accessToStation(p, trainIntent, now, ctx);
}

function directTravel(
  p: Person,
  intent: PersonTravelIntent,
  now: number,
  ctx: SimCtx,
): PeopleSimPatch | null {
  if (intent.pickupVehicleId) {
    const car = ctx.vehicles[intent.pickupVehicleId];
    if (car && canBoardAsDriver(p, car, ctx.people) === null) {
      if (personNearVehicle(p, car, 2)) return boardOwnedCarAndDrive(p, car, intent, now, ctx);
      const toCar = walkToOwnedCar(p, car, intent, now, ctx);
      if (toCar) return toCar;
    }
  }

  if (intent.leg === 'bus-ride') {
    const aboard = p.location.kind === 'vehicle' ? ctx.vehicles[p.location.vehicleId] : undefined;
    if (p.location.kind === 'vehicle' && (!aboard || aboard.type === 'bus')) {
      return {
        person: {
          ...p,
          travelIntent: intent,
          activity: intent.purpose === 'care' ? 'seeking_care' : 'commuting',
          activityUntil: now + 20_000,
        },
      };
    }
    // Left the bus before the right stop — wait for another, or walk on.
    return (
      beginBusTrip(p, intent, now, ctx) ||
      beginEgress(p, { ...intent, leg: 'from-bus', transport: 'walk' }, now, ctx)
    );
  }

  if (intent.leg === 'train-ride') {
    return {
      person: {
        ...p,
        travelIntent: intent,
        activity: 'commuting',
        activityUntil: now + 20_000,
      },
    };
  }

  if (intent.leg === 'to-bus-stop') {
    if (p.location.kind === 'vehicle') return null;
    return (
      beginBusTrip(p, intent, now, ctx) ||
      walkToPlace(p, { ...intent, transport: 'walk' }, intent.viaKey || intent.destinationKey, now, ctx)
    );
  }

  if (intent.leg === 'to-train-station') {
    if (p.location.kind === 'vehicle') {
      const v = ctx.vehicles[p.location.vehicleId];
      if (!v || v.type === 'train' || v.type === 'bus' || v.type === 'semi') {
        return {
          person: { ...p, travelIntent: intent, activity: 'commuting', activityUntil: now + 20_000 },
        };
      }
      return null;
    }
    if (intent.viaKey && personAtAnchor(p, intent.viaKey, ctx.grid, ctx.vehicles)) {
      return boardOrWaitForTrain(p, intent, now, ctx);
    }
    return accessToStation(p, intent, now, ctx);
  }

  if (intent.leg === 'from-bus' || intent.leg === 'from-train') {
    return beginEgress(p, intent, now, ctx);
  }

  if (p.location.kind === 'vehicle') return null;

  const mode = modeFromPerson(p, intent);
  if (mode === 'train') return beginTrainTrip(p, intent, now, ctx);
  if (mode === 'bus') {
    return (
      beginBusTrip(p, intent, now, ctx) ||
      walkToPlace(
        p,
        { purpose: intent.purpose, destinationKey: intent.destinationKey, transport: 'walk' },
        intent.destinationKey,
        now,
        ctx,
      )
    );
  }
  if (mode === 'robotaxi') {
    return requestRobotaxi(
      p,
      { ...intent, transport: 'taxi', leg: undefined, viaKey: undefined, alightKey: undefined },
      now,
      ctx,
      intent.destinationKey,
    );
  }
  if (mode === 'walk') {
    return walkToPlace(
      p,
      {
        purpose: intent.purpose,
        destinationKey: intent.destinationKey,
        transport: 'walk',
      },
      intent.destinationKey,
      now,
      ctx,
    );
  }
  if (mode === 'car') {
    const car = findOwnedCar(p, ctx.vehicles, ctx.people);
    if (car && canBoardAsDriver(p, car, ctx.people) === null) {
      const carIntent: PersonTravelIntent = { ...intent, transport: 'car' };
      if (personNearVehicle(p, car, 2)) return boardOwnedCarAndDrive(p, car, carIntent, now, ctx);
      const toCar = walkToOwnedCar(p, car, carIntent, now, ctx);
      if (toCar) return toCar;
    }
    return walkToPlace(
      p,
      { purpose: intent.purpose, destinationKey: intent.destinationKey, transport: 'walk' },
      intent.destinationKey,
      now,
      ctx,
    );
  }
  return null;
}

/** Start travel via walk, owned car, taxi, bus, or train (no teleport). */
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

  // Final arrival. Mid-leg trips (walk to a station or stop) are not done yet.
  if (
    (!intent.leg || intent.leg === 'from-bus' || intent.leg === 'from-train') &&
    isAtTravelDestination(p, intent.destinationKey) &&
    p.location.kind !== 'vehicle'
  ) {
    return arrivedFromTrip(p, intent, now, ctx);
  }

  const directed = directTravel(p, intent, now, ctx);
  if (directed) return directed;

  const placeKey = currentPlaceKey(p);
  const car = findOwnedCar(p, ctx.vehicles, ctx.people, placeKey);
  const driveCar = shouldDriveOwnedCar(intent, car);

  // Already in a vehicle — attach trip intent and route cars/service
  if (p.location.kind === 'vehicle') {
    const aboard = ctx.vehicles[p.location.vehicleId];
    const vType = aboard?.type || 'car';
    const mayRouteVehicle =
      !!aboard &&
      !aboard.manualOverride &&
      vType !== 'train' &&
      vType !== 'semi';
    const driveDest = driveDestinationPoint(intent, ctx.grid) || dest;
    return {
      person: {
        ...p,
        travelIntent: { ...intent, pickupVehicleId: undefined },
        activity: intent.purpose === 'care' ? 'seeking_care' : 'commuting',
        activityUntil: now + 20_000,
      },
      vehicleDestination: mayRouteVehicle
        ? { vehicleId: p.location.vehicleId, dest: driveDest }
        : undefined,
    };
  }

  // Walk to owned car, then drive
  if (driveCar && car && canBoardAsDriver(p, car, ctx.people) === null) {
    if (personNearVehicle(p, car, 2)) {
      return boardOwnedCarAndDrive(p, car, intent, now, ctx);
    }
    const toCar = walkToOwnedCar(p, car, intent, now, ctx);
    if (toCar) return toCar;
    // Can't path to the car — fall through to walking the trip
  }

  // Already walking toward this dest (same mode) — keep going
  if (
    p.location.kind === 'walking' &&
    p.travelIntent?.destinationKey === intent.destinationKey &&
    !p.travelIntent?.pickupVehicleId &&
    !intent.pickupVehicleId &&
    (p.travelIntent?.transport || 'auto') === (intent.transport || 'auto')
  ) {
    return { person: { ...p, travelIntent: intent, activity: 'walking' } };
  }

  const commuteOnFoot =
    intent.transport === 'walk' ||
    ((intent.purpose === 'work' || intent.purpose === 'home') && !driveCar);

  // Walk for explicit walk, work/home without a car, or short auto trips
  if (commuteOnFoot || shouldWalkTrip(p, intent.destinationKey, intent.transport, ctx.vehicles)) {
    const walker = beginWalkTrip(p, { ...intent, transport: commuteOnFoot ? 'walk' : intent.transport }, ctx.grid, ctx.traffic, ctx.vehicles, now);
    if (walker) return { person: walker };
    // No path — fall through to taxi / retry
  }

  // Shop / care (and leftover auto): family car if nearby
  if (
    car &&
    !commuteOnFoot &&
    intent.transport !== 'taxi' &&
    intent.transport !== 'bus' &&
    canBoardAsDriver(p, car, ctx.people) === null &&
    personNearVehicle(p, car, 2)
  ) {
    return boardOwnedCarAndDrive(p, car, intent, now, ctx);
  }

  const outdoorWait = toOutdoorLocation(placeKey, ctx.grid);

  // Taxi (not for explicit walk, and not the default work/home commute)
  const allowTaxi =
    intent.transport !== 'walk' &&
    intent.transport !== 'car' &&
    !commuteOnFoot;
  const idle = allowTaxi ? findIdleTaxi(ctx.buildings, ctx.vehicles, ctx.people) : null;
  if (idle) {
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

  // Last resort: walk even if far
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
    const walked = advanceWalkingPerson(p, ctx.grid, ctx.traffic, now, 0.45, ctx.buildings);
    // Reached the owned car this step — board and drive immediately
    if (
      walked.location.kind !== 'walking' &&
      walked.travelIntent?.pickupVehicleId
    ) {
      return beginTravel(walked, walked.travelIntent, now, ctx);
    }
    return { person: walked };
  }

  // Pending user/AI trip (Go To Work / Go Home / pickup) — start immediately
  if (p.activity === 'waiting_train' && p.travelIntent) {
    return boardOrWaitForTrain(p, p.travelIntent, now, ctx);
  }

  if (p.activity === 'waiting_bus') {
    if (p.activityUntil && now < p.activityUntil) return { person: p };
    return { person: { ...p, activityUntil: now + 60_000 } };
  }

  if (
    p.travelIntent &&
    p.location.kind !== 'vehicle' &&
    p.activity !== 'waiting_taxi' &&
    p.activity !== 'waiting_train' &&
    p.activity !== 'shopping' &&
    p.activity !== 'in_care'
  ) {
    return beginTravel(p, p.travelIntent, now, ctx);
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

  // Finished checkout dwell — take goods (if in stock) and leave the store
  if (p.activity === 'shopping') {
    return completeStoreVisit(p, now, ctx);
  }

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
    const leg = intent?.leg;

    // Stay aboard until the bus loop alights them at their stop.
    if (leg === 'bus-ride' || (leg === 'to-train-station' && v?.type === 'bus')) {
      return { person: { ...p, activity: 'commuting', activityUntil: now + 10_000 } };
    }

    // Leave the train at the station nearest the final destination, then continue.
    if (leg === 'train-ride' && v?.type === 'train' && intent?.alightKey) {
      if (trainAtStation(v, intent.alightKey, ctx.grid)) {
        const dropped: Person = {
          ...p,
          location: toOutdoorLocation(intent.alightKey, ctx.grid),
          activity: 'commuting',
          activityUntil: now,
          taxiRideId: undefined,
          travelIntent: {
            purpose: intent.purpose,
            destinationKey: intent.destinationKey,
            leg: 'from-train',
            transport: 'auto',
          },
        };
        return beginTravel(dropped, dropped.travelIntent, now, ctx);
      }
      return { person: { ...p, activity: 'commuting', activityUntil: now + 10_000 } };
    }

    const targetKey =
      (leg === 'to-train-station' || leg === 'to-bus-stop') && intent?.viaKey
        ? intent.viaKey
        : intent?.destinationKey;
    const nearDist = leg === 'to-train-station' ? 3 : 2;
    if (v && targetKey && vehicleNearKey(v, targetKey, nearDist)) {
      if (leg === 'to-train-station') {
        const vType = v.type || 'car';
        const parkId =
          p.location.seat === 'driver' && vType !== 'taxi' && vType !== 'train' && vType !== 'semi'
            ? v.id
            : undefined;
        return {
          person: {
            ...p,
            location: toOutdoorLocation(intent?.viaKey || targetKey, ctx.grid),
            activity: 'waiting_train',
            activityUntil: now,
            travelIntent: intent,
            taxiRideId: undefined,
          },
          vehiclePark: parkId ? { vehicleId: parkId } : undefined,
        };
      }
      const purpose = intent?.purpose || (p.activity === 'seeking_care' ? 'care' : 'work');
      // Park and leave the car at the curb, then enter on the next travel step
      const vType = v.type || 'car';
      const parkId =
        p.location.seat === 'driver' &&
        vType !== 'taxi' &&
        vType !== 'train' &&
        vType !== 'semi'
          ? v.id
          : undefined;
      const atCurb: Person = {
        ...p,
        location: toOutdoorLocation(targetKey, ctx.grid),
        activity: 'commuting',
        activityUntil: now,
        travelIntent: { purpose, destinationKey: targetKey },
        taxiRideId: undefined,
        money: purpose === 'work' ? (p.money || 0) + 8 : p.money,
      };
      if (purpose === 'care') {
        atCurb.health = 'healthy';
        atCurb.illnessId = undefined;
      }
      return {
        person: atCurb,
        vehiclePark: parkId ? { vehicleId: parkId } : undefined,
        heal: purpose === 'care' || undefined,
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
  const loc = person.location;
  const next: Vehicle = {
    ...v,
    destination: dest,
    turnIntent: null,
    randomTurning: false,
  };
  // Leave a driveway / lot immediately when a commute starts
  delete next.parkingStopUntil;
  const blockedBySignal =
    (v.trafficStopUntil != null && now < v.trafficStopUntil) ||
    v.trafficStopReason === 'stoplight' ||
    v.trafficStopReason === 'stop-sign';
  if (!blockedBySignal) {
    next.isMoving = true;
  }
  if (loc.kind === 'vehicle' && loc.seat === 'driver' && loc.vehicleId === vehicleId) {
    next.driverId = person.id;
    nextVehicles[vehicleId] = next;
    return nextVehicles;
  }
  // Autonomous taxi (or passenger-only ride) — still holds for red lights / stop signs
  if (v.type === 'taxi' || (loc.kind === 'vehicle' && loc.seat === 'passenger')) {
    nextVehicles[vehicleId] = next;
  }
  return nextVehicles;
}

/** Apply a travel/sim patch to people + vehicles (occupancy, destination, park). */
export function applyPeopleSimPatch(
  patch: PeopleSimPatch,
  people: Record<string, Person>,
  vehicles: Record<string, Vehicle>,
  now: number,
): { people: Record<string, Person>; vehicles: Record<string, Vehicle> } {
  const nextPeople = { ...people, [patch.person.id]: patch.person };
  let nextVehicles = { ...vehicles };
  if (patch.vehicleDestination) {
    nextVehicles = applyVehicleDestination(
      nextVehicles,
      nextPeople,
      patch.vehicleDestination.vehicleId,
      patch.vehicleDestination.dest,
      patch.person,
      now,
    );
  }
  if (patch.vehiclePark) {
    const v = nextVehicles[patch.vehiclePark.vehicleId];
    if (v && !v.manualOverride) {
      const parked: Vehicle = {
        ...v,
        isMoving: false,
        destination: null,
        parkingStopUntil: now + 12_000,
      };
      nextVehicles[patch.vehiclePark.vehicleId] = parked;
    }
  }
  Object.keys(nextVehicles).forEach(vid => {
    nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], nextPeople);
  });
  return { people: nextPeople, vehicles: nextVehicles };
}

/** Advance taxi pickups / dropoffs for all stations. */
function processTaxiRides(
  people: Record<string, Person>,
  buildings: Record<string, BuildingConfig>,
  vehicles: Record<string, Vehicle>,
  now: number,
  grid: GridData,
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
              travelIntent: passenger.travelIntent?.leg
                ? passenger.travelIntent
                : {
                    purpose: ride.purpose,
                    destinationKey: ride.destinationKey,
                    transport: 'taxi',
                  },
              taxiRideId: ride.id,
            };
            nextPeople = { ...nextPeople, [passenger.id]: passenger };
            const dest = taxiRoutePoint(ride.destinationKey, grid) || parseKey(ride.destinationKey);
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
          const pickup = taxiRoutePoint(ride.pickupKey, grid) || parseKey(ride.pickupKey);
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
        const dropRadius = passenger.travelIntent?.leg === 'to-train-station' ? 3 : 2;
        if (vehicleNearKey(taxi, ride.destinationKey, dropRadius)) {
          // Train access: the taxi only covers the ride to the station.
          if (passenger.travelIntent?.leg === 'to-train-station') {
            const station = passenger.travelIntent.viaKey || ride.destinationKey;
            passenger = {
              ...passenger,
              location: { kind: 'outdoor', atKey: station },
              activity: 'waiting_train',
              activityUntil: now,
              taxiRideId: undefined,
              travelIntent: passenger.travelIntent,
            };
            nextPeople = { ...nextPeople, [passenger.id]: passenger };
            const stationPt = taxiRoutePoint(stationKey, grid) || parseKey(stationKey);
            const mayMove = vehicleMayBeForcedMoving(taxi, now);
            nextVehicles[taxi.id] = {
              ...taxi,
              destination: stationPt,
              isMoving: mayMove && !!stationPt,
              turnIntent: null,
              randomTurning: false,
              parkOnNextLot: true,
            };
            continue;
          }
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
                  ? now + shoppingDwellMs(nextBuildings[destKey])
                  : purpose === 'care'
                    ? now + 25_000 + Math.random() * 20_000
                    : now + 35_000,
            travelIntent: undefined,
            taxiRideId: undefined,
            money:
              purpose === 'work'
                ? (passenger.money || 0) + 8
                : passenger.money,
          };
          if (purpose === 'care') {
            passenger = { ...passenger, health: 'healthy', illnessId: undefined };
          }
          nextPeople = { ...nextPeople, [passenger.id]: passenger };

          // Send taxi back to station (respect active traffic stop if mid-signal)
          const stationPt = taxiRoutePoint(stationKey, grid) || parseKey(stationKey);
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
          const dest = taxiRoutePoint(ride.destinationKey, grid) || parseKey(ride.destinationKey);
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
      const deltas = Array.isArray(patch.buildingInventoryDelta)
        ? patch.buildingInventoryDelta
        : [patch.buildingInventoryDelta];
      for (const { buildingKey, item, delta } of deltas) {
        const b = buildings[buildingKey];
        if (!b) continue;
        const inv = { ...(b.inventory || {}) };
        inv[item] = Math.max(0, (inv[item] || 0) + delta);
        buildings[buildingKey] = { ...b, inventory: inv };
      }
    }
  }

  // Taxi pickup / dropoff state machine
  const taxiResult = processTaxiRides(people, buildings, nextVehicles, now, grid);
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
