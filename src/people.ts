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
  TravelPurpose,
  Vehicle,
  VehicleType,
  Point,
} from './types';

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

/** Count people assigned to a workplace (workplaceKey). */
export function countEmployeesAtBuilding(
  people: Record<string, Person> | undefined,
  buildingKey: string,
): number {
  if (!people || !buildingKey) return 0;
  return Object.values(people).filter(p => p.workplaceKey === buildingKey).length;
}

/** Assign or clear workplace for a set of people. */
export function assignPeopleWorkplace(
  people: Record<string, Person>,
  personIds: Iterable<string>,
  workplaceKey: string | undefined,
): Record<string, Person> {
  const next = { ...people };
  for (const id of personIds) {
    const p = next[id];
    if (!p) continue;
    next[id] = workplaceKey
      ? { ...p, workplaceKey }
      : { ...p, workplaceKey: undefined };
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
}): Person {
  const now = opts.now ?? Date.now();
  const familyId = opts.familyId || uid('fam');
  return {
    id: uid('person'),
    firstName: opts.firstName.trim() || 'Citizen',
    lastName: opts.lastName.trim() || 'Doe',
    ageYears: Math.max(0, Math.min(100, opts.ageYears)),
    ageUpdatedAt: now,
    sex: opts.sex,
    familyId,
    homeKey: opts.homeKey,
    workplaceKey: opts.workplaceKey,
    location: { kind: 'home', homeKey: opts.homeKey },
    health: opts.health || 'healthy',
    money: opts.money ?? 50,
    activity: 'home',
    activityUntil: now + 5000,
  };
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
    default:
      return 'Unknown';
  }
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

export function listHomeKeys(grid: GridData): string[] {
  const keys: string[] = [];
  Object.entries(grid).forEach(([key, tiles]) => {
    if (tiles?.some(t => t.type === 'building-home')) keys.push(key);
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

  homes.forEach(homeKey => {
    if (occupiedHomes.has(homeKey)) return;
    const { family, people: members } = createFamilyForHome(homeKey, now);
    // Assign jobs to working-age adults
    members.forEach(p => {
      if (isWorkingAge(p) && workplaces.length > 0 && Math.random() < 0.85) {
        p.workplaceKey = pick(workplaces);
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
    // No driver → cannot be moving (robotaxis always may move)
    isMoving: isRobotaxi || driverId ? vehicle.isMoving : false,
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
  return {
    ...people,
    [personId]: {
      ...p,
      location: { kind: 'vehicle', vehicleId, seat },
      activity: seat === 'driver' ? 'commuting' : 'commuting',
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

export function peopleAtHome(people: Record<string, Person>, homeKey: string): Person[] {
  return Object.values(people).filter(
    p => p.location.kind === 'home' && p.location.homeKey === homeKey,
  );
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
  return Object.values(people).filter(
    p => p.location.kind === 'building' && p.location.buildingKey === buildingKey,
  );
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
};

function currentPlaceKey(p: Person): string {
  if (p.location.kind === 'home') return p.location.homeKey;
  if (p.location.kind === 'building') return p.location.buildingKey;
  if (p.location.kind === 'tile') return `${p.location.x},${p.location.y}`;
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

/** Start travel via owned car or taxi (no teleport). */
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

  // Already in a vehicle — route it
  if (p.location.kind === 'vehicle') {
    return {
      person: {
        ...p,
        travelIntent: intent,
        activity: intent.purpose === 'care' ? 'seeking_care' : 'commuting',
        activityUntil: now + 20_000,
      },
      vehicleDestination: { vehicleId: p.location.vehicleId, dest },
    };
  }

  const placeKey = currentPlaceKey(p);
  const car = findOwnedCar(p, ctx.vehicles, ctx.people, placeKey);
  if (car && canBoardAsDriver(p, car, ctx.people) === null) {
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

  // Call a taxi to current place
  const idle = findIdleTaxi(ctx.buildings, ctx.vehicles, ctx.people);
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

  // No car, no taxi — stay put and retry later (never teleport)
  return {
    person: {
      ...p,
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
): PeopleSimPatch {
  let p = advancePersonAge(person, now);

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

  // Waiting for taxi — ride state machine advances in processTaxiRides
  if (p.activity === 'waiting_taxi') {
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
  if (p.activityUntil && now < p.activityUntil && p.activity !== 'commuting' && p.activity !== 'seeking_care') {
    return { person: p };
  }

  const stores = listStoreKeys(ctx.grid, ctx.buildings);
  const hospitals = listHospitalKeys(ctx.grid, ctx.buildings);
  const workplaces = listWorkplaceKeys(ctx.grid, ctx.buildings);

  // Sick / injured → travel to hospital (vehicle only)
  if (p.health !== 'healthy' && p.activity !== 'in_care' && p.activity !== 'seeking_care' && p.activity !== 'commuting') {
    const careKey = hospitals[0] || null;
    if (careKey) {
      if (p.health === 'injured') {
        const amb = Object.values(ctx.vehicles).find(
          v => v.type === 'ambulance' && !v.manualOverride && !getDriverId(ctx.people, v.id),
        );
        if (amb && p.location.kind !== 'vehicle' && canBoardAsPassenger(p, amb, ctx.people) === null) {
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

  // Arriving while commuting / seeking care
  if (
    (p.activity === 'commuting' || p.activity === 'seeking_care') &&
    p.location.kind === 'vehicle'
  ) {
    const v = ctx.vehicles[p.location.vehicleId];
    const intent = p.travelIntent;
    const targetKey =
      intent?.destinationKey ||
      (p.activity === 'seeking_care' ? hospitals[0] : p.workplaceKey);
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
      // Park personal car; taxis handled by ride processor
      const parkId =
        v.type !== 'taxi' && p.location.seat === 'driver' ? v.id : undefined;
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

  // Working age: home → work → shop/home via vehicles only
  if (isWorkingAge(p)) {
    if (p.activity === 'home' || p.activity === 'idle') {
      const work =
        p.workplaceKey && workplaces.includes(p.workplaceKey)
          ? p.workplaceKey
          : workplaces.length
            ? pick(workplaces)
            : null;
      if (work) {
        return beginTravel(
          { ...p, workplaceKey: work },
          { purpose: 'work', destinationKey: work },
          now,
          ctx,
        );
      }
    }

    if (p.activity === 'working') {
      const bkey = p.location.kind === 'building' ? p.location.buildingKey : p.workplaceKey;
      const bcfg = bkey ? ctx.buildings[bkey] : undefined;
      let invDelta: PeopleSimPatch['buildingInventoryDelta'];
      if (bcfg && (bcfg.role === 'factory' || bcfg.role === 'lumbermill' || bcfg.role === 'warehouse')) {
        const item = bcfg.role === 'lumbermill' ? 'lumber' : 'goods';
        invDelta = { buildingKey: bkey!, item, delta: 1 };
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
  // Stoplight / stop-sign / yield holds: vehicle loop resumes when clear
  if (
    v.trafficStopReason === 'stoplight' ||
    v.trafficStopReason === 'stop-sign' ||
    v.trafficStopReason === 'yield' ||
    v.trafficStopReason === 'vehicle'
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
): { economy: EconomyState; vehicles: Record<string, Vehicle> } {
  if (economy.peoplePaused) return { economy, vehicles };

  let people = { ...(economy.people || {}) };
  let buildings = { ...(economy.buildings || {}) };
  let nextVehicles = { ...vehicles };

  const ids = Object.keys(people);
  for (const id of ids) {
    const patch = simulatePersonStep(people[id], now, {
      grid,
      buildings,
      vehicles: nextVehicles,
      people,
    });
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
