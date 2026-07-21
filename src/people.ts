/**
 * Citizens, families, and vehicle seating helpers for Grid City.
 */

import type {
  BuildingConfig,
  EconomyState,
  GridData,
  Person,
  Family,
  PersonLocation,
  PersonSex,
  PersonActivity,
  Vehicle,
  VehicleType,
  Point,
} from './types';

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

export function syncVehicleOccupancy(
  vehicle: Vehicle,
  people: Record<string, Person>,
): Vehicle {
  const driverId = getDriverId(people, vehicle.id);
  const passengerIds = getPassengerIds(people, vehicle.id);
  const maxPassengers = vehicle.maxPassengers ?? getMaxPassengers(vehicle.type);
  return {
    ...vehicle,
    driverId: driverId || undefined,
    passengerIds,
    maxPassengers,
    // No driver → cannot be moving
    isMoving: driverId ? vehicle.isMoving : false,
  };
}

export function canBoardAsDriver(person: Person, vehicle: Vehicle, people: Record<string, Person>): string | null {
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
 * Returns updated person + optional vehicle destination / building inventory tweaks.
 */
export interface PeopleSimPatch {
  person: Person;
  vehicleDestination?: { vehicleId: string; dest: Point };
  buildingInventoryDelta?: { buildingKey: string; item: string; delta: number };
  heal?: boolean;
}

export function simulatePersonStep(
  person: Person,
  now: number,
  ctx: {
    grid: GridData;
    buildings: Record<string, BuildingConfig>;
    vehicles: Record<string, Vehicle>;
    people: Record<string, Person>;
  },
): PeopleSimPatch {
  let p = advancePersonAge(person, now);

  // Death at 100 — stay as retired corpse-less: cap and idle at home
  if (p.ageYears >= 100) {
    p = {
      ...p,
      ageYears: 100,
      activity: 'home',
      location: { kind: 'home', homeKey: p.homeKey },
      activityUntil: now + 3600_000,
    };
    return { person: p };
  }

  // Random chance to fall ill
  if (p.health === 'healthy' && isAdult(p) && Math.random() < 0.0008) {
    p = {
      ...p,
      health: Math.random() < 0.6 ? 'sick' : 'injured',
      illnessId: Math.random() < 0.5 ? 'flu' : 'trauma',
    };
  }

  // Still busy
  if (p.activityUntil && now < p.activityUntil) {
    return { person: p };
  }

  const stores = listStoreKeys(ctx.grid, ctx.buildings);
  const hospitals = listHospitalKeys(ctx.grid, ctx.buildings);
  const workplaces = listWorkplaceKeys(ctx.grid, ctx.buildings);

  // Sick / injured → seek care
  if (p.health !== 'healthy' && p.activity !== 'in_care') {
    const careKey = hospitals[0] || null;
    if (careKey) {
      // Prefer ambulance if injured
      if (p.health === 'injured') {
        const amb = Object.values(ctx.vehicles).find(v => v.type === 'ambulance' && !getDriverId(ctx.people, v.id));
        if (amb && p.location.kind !== 'vehicle') {
          // Board as passenger if possible, else go to hospital building
          const err = canBoardAsPassenger(p, amb, ctx.people);
          if (!err) {
            return {
              person: {
                ...p,
                location: { kind: 'vehicle', vehicleId: amb.id, seat: 'passenger' },
                activity: 'seeking_care',
                activityUntil: now + 20_000,
              },
              vehicleDestination: {
                vehicleId: amb.id,
                dest: parseKey(careKey)!,
              },
            };
          }
        }
      }
      // Walk/teleport into hospital building
      if (p.location.kind !== 'building' || p.location.buildingKey !== careKey) {
        return {
          person: {
            ...p,
            location: { kind: 'building', buildingKey: careKey },
            activity: 'in_care',
            activityUntil: now + 25_000 + Math.random() * 20_000,
          },
        };
      }
      return {
        person: {
          ...p,
          health: 'healthy',
          illnessId: undefined,
          activity: 'home',
          location: { kind: 'home', homeKey: p.homeKey },
          activityUntil: now + 15_000,
        },
        heal: true,
      };
    }
  }

  // In care → heal
  if (p.activity === 'in_care') {
    return {
      person: {
        ...p,
        health: 'healthy',
        illnessId: undefined,
        activity: 'home',
        location: { kind: 'home', homeKey: p.homeKey },
        activityUntil: now + 20_000,
      },
      heal: true,
    };
  }

  // Children stay home mostly
  if (isChild(p)) {
    return {
      person: {
        ...p,
        location: { kind: 'home', homeKey: p.homeKey },
        activity: 'home',
        activityUntil: now + 30_000 + Math.random() * 60_000,
      },
    };
  }

  // Working age: work → shop → home cycle
  if (isWorkingAge(p)) {
    if (p.activity === 'home' || p.activity === 'idle') {
      const work = p.workplaceKey && workplaces.includes(p.workplaceKey)
        ? p.workplaceKey
        : workplaces.length
          ? pick(workplaces)
          : null;
      if (work) {
        // Prefer family car at home
        const homeCar = Object.values(ctx.vehicles).find(
          v =>
            (v.type === 'car' || v.type === 'taxi' || !v.type) &&
            v.homeKey === p.homeKey &&
            !getDriverId(ctx.people, v.id),
        );
        if (homeCar && canBoardAsDriver(p, homeCar, ctx.people) === null) {
          return {
            person: {
              ...p,
              workplaceKey: work,
              location: { kind: 'vehicle', vehicleId: homeCar.id, seat: 'driver' },
              activity: 'commuting',
              activityUntil: now + 25_000,
            },
            vehicleDestination: { vehicleId: homeCar.id, dest: parseKey(work)! },
          };
        }
        // Teleport to work if no car
        return {
          person: {
            ...p,
            workplaceKey: work,
            location: { kind: 'building', buildingKey: work },
            activity: 'working',
            activityUntil: now + 40_000 + Math.random() * 40_000,
          },
        };
      }
    }

    if (p.activity === 'commuting' && p.location.kind === 'vehicle') {
      // Arrive at destination building if vehicle is near
      const v = ctx.vehicles[p.location.vehicleId];
      const target = p.workplaceKey;
      if (v && target) {
        const [tx, ty] = target.split(',').map(Number);
        if (Math.abs(v.x - tx) + Math.abs(v.y - ty) <= 2) {
          return {
            person: {
              ...p,
              location: { kind: 'building', buildingKey: target },
              activity: 'working',
              activityUntil: now + 45_000 + Math.random() * 30_000,
            },
          };
        }
      }
      return {
        person: {
          ...p,
          activityUntil: now + 12_000,
        },
      };
    }

    if (p.activity === 'working') {
      // Produce goods at factory-like workplaces
      const bkey = p.location.kind === 'building' ? p.location.buildingKey : p.workplaceKey;
      const bcfg = bkey ? ctx.buildings[bkey] : undefined;
      let invDelta: PeopleSimPatch['buildingInventoryDelta'];
      if (bcfg && (bcfg.role === 'factory' || bcfg.role === 'lumbermill' || bcfg.role === 'warehouse')) {
        const item = bcfg.role === 'lumbermill' ? 'lumber' : bcfg.role === 'factory' ? 'goods' : 'goods';
        invDelta = { buildingKey: bkey!, item, delta: 1 };
      }
      // After work → shop or home
      if (stores.length && Math.random() < 0.55 && (p.money || 0) >= 5) {
        const store = pick(stores);
        return {
          person: {
            ...p,
            money: (p.money || 0) - 5,
            location: { kind: 'building', buildingKey: store },
            activity: 'shopping',
            activityUntil: now + 15_000 + Math.random() * 15_000,
          },
          buildingInventoryDelta: invDelta,
        };
      }
      return {
        person: {
          ...p,
          money: (p.money || 0) + 8,
          location: { kind: 'home', homeKey: p.homeKey },
          activity: 'home',
          activityUntil: now + 30_000 + Math.random() * 40_000,
        },
        buildingInventoryDelta: invDelta,
      };
    }

    if (p.activity === 'shopping') {
      const storeKey = p.location.kind === 'building' ? p.location.buildingKey : stores[0];
      return {
        person: {
          ...p,
          location: { kind: 'home', homeKey: p.homeKey },
          activity: 'home',
          activityUntil: now + 40_000 + Math.random() * 50_000,
        },
        buildingInventoryDelta: storeKey
          ? { buildingKey: storeKey, item: 'goods', delta: -1 }
          : undefined,
      };
    }
  }

  // Elders: mostly home, occasional shop/care
  if (p.ageYears >= 65) {
    if (stores.length && Math.random() < 0.3) {
      return {
        person: {
          ...p,
          location: { kind: 'building', buildingKey: pick(stores) },
          activity: 'shopping',
          activityUntil: now + 20_000,
        },
      };
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

function parseKey(key: string): Point | null {
  const [x, y] = key.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
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

  // Age + AI (sample or all — all is fine for small towns)
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
      const v = nextVehicles[vehicleId];
      if (v) {
        // Ensure person is driver if they're supposed to drive
        const loc = patch.person.location;
        if (loc.kind === 'vehicle' && loc.seat === 'driver') {
          nextVehicles[vehicleId] = {
            ...v,
            driverId: patch.person.id,
            destination: dest,
            isMoving: true,
            turnIntent: null,
            randomTurning: false,
          };
        } else if (loc.kind === 'vehicle' && loc.seat === 'passenger') {
          // Need a driver — assign nearest adult at same place or leave parked destination for ambulance AI
          const driver = Object.values(people).find(
            p =>
              p.id !== patch.person.id &&
              isAdult(p) &&
              p.health === 'healthy' &&
              p.location.kind !== 'vehicle',
          );
          if (driver && !getDriverId(people, vehicleId)) {
            people[driver.id] = {
              ...driver,
              location: { kind: 'vehicle', vehicleId, seat: 'driver' },
              activity: 'commuting',
              activityUntil: now + 30_000,
            };
            nextVehicles[vehicleId] = {
              ...v,
              driverId: driver.id,
              destination: dest,
              isMoving: true,
            };
          }
        }
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

  // Sync occupancy on all vehicles
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
