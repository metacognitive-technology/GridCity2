import { expect, test } from '@playwright/test';
import {
  advanceWalkingPerson,
  applyPeopleSimPatch,
  commuteIntentForPerson,
  createPerson,
  exchangeBusPassengers,
  getPersonMapPlacement,
  indoorTileKey,
  isOnRoadAsphalt,
  locationLabel,
  sidewalkPosition,
  simulatePersonStep,
  startPersonTravel,
  walkPointOnRoad,
} from '../src/people';
import { TILE_CONNECTIONS } from '../src/traffic';
import type { BuildingConfig, GridData, GridTile, Person, Vehicle } from '../src/types';

function tile(type: GridTile['type']): GridTile[] {
  return [{ type, rotation: 0 }];
}

/** Home at 0,0 — road 1,0 2,0 3,0 — factory at 4,0 */
function commuteGrid(): GridData {
  return {
    '0,0': tile('building-home'),
    '1,0': tile('road-straight'),
    '2,0': tile('road-straight'),
    '3,0': tile('road-straight'),
    '4,0': tile('building-factory'),
  };
}

function makeCar(partial: Partial<Vehicle> & Pick<Vehicle, 'id' | 'x' | 'y' | 'homeKey'>): Vehicle {
  return {
    heading: 90,
    lane: 1,
    progress: 0.5,
    color: '#dc2626',
    zIndex: 0,
    type: 'car',
    isMoving: false,
    ...partial,
  };
}

function ctxFor(
  person: Person,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
  extraPeople: Record<string, Person> = {},
) {
  const people = { [person.id]: person, ...extraPeople };
  const buildings: Record<string, BuildingConfig> = {
    '4,0': {
      anchorKey: '4,0',
      role: 'factory',
      inventory: {},
    },
  };
  return {
    grid,
    buildings,
    vehicles,
    people,
    traffic: null,
  };
}

test.describe('sidewalk vs asphalt', () => {
  test('2-lane NS road: white curbs are not asphalt; center is', () => {
    const grid: GridData = { '0,0': tile('road-straight') };
    expect(isOnRoadAsphalt(grid, 0.12, 0.5)).toBe(false);
    expect(isOnRoadAsphalt(grid, 0.88, 0.5)).toBe(false);
    expect(isOnRoadAsphalt(grid, 0.5, 0.5)).toBe(true);
    const west = sidewalkPosition(0, 0, 3, 0.5, 'road-straight');
    expect(isOnRoadAsphalt(grid, west.x, west.y)).toBe(false);
  });

  test('4-lane sidewalk sits in the narrow white band, not the black', () => {
    const grid: GridData = { '0,0': [{ type: 'road-4lane-straight', rotation: 0 }] };
    const west = sidewalkPosition(0, 0, 3, 0.5, 'road-4lane-straight');
    expect(west.x).toBeLessThan(0.1);
    expect(isOnRoadAsphalt(grid, west.x, west.y)).toBe(false);
    expect(isOnRoadAsphalt(grid, 0.5, 0.5)).toBe(true);
  });

  test('walking along a NS road stays on the curb without CROSS', () => {
    const grid: GridData = {
      '2,2': tile('road-straight'),
      '2,3': tile('road-straight'),
    };
    const start = walkPointOnRoad({ x: 2, y: 2 }, grid, 2.1, 2.2, { x: 2, y: 3 });
    expect(isOnRoadAsphalt(grid, start.x, start.y)).toBe(false);
    const person = createPerson({
      firstName: 'Sam',
      lastName: 'Curb',
      sex: 'm',
      ageYears: 30,
      homeKey: '1,2',
      now: Date.now(),
      placeAtWorkplaceIfNew: false,
    });
    const walking: Person = {
      ...person,
      location: {
        kind: 'walking',
        x: start.x,
        y: start.y,
        path: [{ x: 2, y: 2 }, { x: 2, y: 3 }],
        pathIndex: 0,
        destKey: '2,4',
      },
      activity: 'walking',
    };
    const stepped = advanceWalkingPerson(walking, grid, null, Date.now(), 0.4);
    expect(stepped.location.kind).toBe('walking');
    if (stepped.location.kind === 'walking') {
      expect(isOnRoadAsphalt(grid, stepped.location.x, stepped.location.y)).toBe(false);
      expect(stepped.location.crossing).toBeFalsy();
    }
    const place = getPersonMapPlacement(stepped, grid, {}, 0);
    expect(place.crossing).toBeFalsy();
  });

  test('crossing a NS road puts the person on asphalt and sets CROSS', () => {
    const grid: GridData = { '5,5': tile('road-straight') };
    const person = createPerson({
      firstName: 'Dee',
      lastName: 'Cross',
      sex: 'f',
      ageYears: 22,
      homeKey: '4,5',
      now: Date.now(),
      placeAtWorkplaceIfNew: false,
    });
    const walking: Person = {
      ...person,
      location: {
        kind: 'walking',
        x: 5.08,
        y: 5.5,
        path: [{ x: 5, y: 5 }, { x: 6, y: 5 }],
        pathIndex: 0,
        destKey: '6,5',
      },
      activity: 'walking',
    };
    const stepped = advanceWalkingPerson(walking, grid, null, Date.now(), 0.5);
    expect(stepped.location.kind).toBe('walking');
    if (stepped.location.kind === 'walking') {
      expect(isOnRoadAsphalt(grid, stepped.location.x, stepped.location.y)).toBe(true);
      expect(stepped.location.crossing).toBe(true);
    }
    expect(getPersonMapPlacement(stepped, grid, {}, 0).crossing).toBe(true);
  });
});

test.describe('indoor location labels', () => {
  test('home and building locations are Inside X,Y', () => {
    expect(indoorTileKey({ kind: 'home', homeKey: '3,7' })).toBe('3,7');
    expect(locationLabel({ kind: 'home', homeKey: '3,7' })).toBe('Inside 3,7');
    expect(indoorTileKey({ kind: 'building', buildingKey: '4,0' })).toBe('4,0');
    expect(locationLabel({ kind: 'building', buildingKey: '4,0' })).toBe('Inside 4,0');
    expect(indoorTileKey({ kind: 'outdoor', atKey: '1,0' })).toBeNull();
    expect(locationLabel({ kind: 'outdoor', atKey: '1,0' })).toBe('Outside 1,0');
  });
});

test.describe('commute: go to work / go home', () => {
  test('person icons are visible at home, walking, in a car, and at work', () => {
    const grid = commuteGrid();
    const now = Date.now();
    const person = createPerson({
      firstName: 'Pat',
      lastName: 'Walker',
      sex: 'm',
      ageYears: 30,
      homeKey: '0,0',
      workplaceKey: '4,0',
      now,
      placeAtWorkplaceIfNew: false,
    });
    const car = makeCar({ id: 'car-1', x: 1, y: 0, homeKey: '0,0' });
    const vehicles = { [car.id]: car };

    const atHome = getPersonMapPlacement(person, grid, vehicles, 0);
    expect(atHome.visible).toBe(true);

    const walking: Person = {
      ...person,
      location: {
        kind: 'walking',
        x: 1.4,
        y: 0.8,
        path: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
        pathIndex: 0,
        destKey: '4,0',
      },
      activity: 'walking',
    };
    const onFoot = getPersonMapPlacement(walking, grid, vehicles, 0);
    expect(onFoot.visible).toBe(true);
    expect(onFoot.x).toBeCloseTo(1.4);
    expect(onFoot.y).toBeCloseTo(0.8);

    const driving: Person = {
      ...person,
      location: { kind: 'vehicle', vehicleId: car.id, seat: 'driver' },
      activity: 'commuting',
    };
    const inCar = getPersonMapPlacement(driving, grid, vehicles, 0);
    expect(inCar.visible).toBe(true);
    expect(inCar.inVehicle).toBe(true);
    expect(inCar.x).toBeGreaterThan(car.x);
    expect(inCar.x).toBeLessThan(car.x + 1);

    const atWork: Person = {
      ...person,
      location: { kind: 'building', buildingKey: '4,0' },
      activity: 'working',
    };
    const inside = getPersonMapPlacement(atWork, grid, vehicles, 0);
    expect(inside.visible).toBe(true);
    expect(Math.floor(inside.x)).toBe(4);
    expect(inside.x).toBeCloseTo(4.5, 1);
  });

  test('Go To Work without a car starts walking toward the workplace', () => {
    const grid = commuteGrid();
    const now = Date.now();
    const person = createPerson({
      firstName: 'Lee',
      lastName: 'Foot',
      sex: 'f',
      ageYears: 28,
      homeKey: '0,0',
      workplaceKey: '4,0',
      now,
      placeAtWorkplaceIfNew: false,
    });
    const intent = commuteIntentForPerson(person, 'work', {}, { [person.id]: person });
    expect(intent).toEqual({
      purpose: 'work',
      destinationKey: '4,0',
      transport: 'walk',
    });
    const patch = startPersonTravel(person, intent!, now, ctxFor(person, grid, {}));
    expect(patch.person.location.kind).toBe('walking');
    expect(patch.person.activity).toBe('walking');
    expect(patch.person.travelIntent?.destinationKey).toBe('4,0');
    expect(patch.vehicleDestination).toBeUndefined();
    if (patch.person.location.kind === 'walking') {
      const last = patch.person.location.path[patch.person.location.path.length - 1];
      expect(last).toEqual({ x: 4, y: 0 });
    }
    let walker = patch.person;
    for (let i = 0; i < 80 && walker.location.kind === 'walking'; i++) {
      walker = advanceWalkingPerson(walker, grid, null, now, 0.6, {});
    }
    expect(walker.location).toEqual({ kind: 'building', buildingKey: '4,0' });
    expect(walker.activity).toBe('working');
  });

  test('Go To Work with a nearby owned car boards and drives, then parks and enters', () => {
    const grid = commuteGrid();
    const now = Date.now();
    const person = createPerson({
      firstName: 'Sam',
      lastName: 'Driver',
      sex: 'm',
      ageYears: 35,
      homeKey: '0,0',
      workplaceKey: '4,0',
      now,
      placeAtWorkplaceIfNew: false,
    });
    const car = makeCar({ id: 'car-1', x: 1, y: 0, homeKey: '0,0' });
    const vehicles = { [car.id]: car };
    const people = { [person.id]: person };
    const intent = commuteIntentForPerson(person, 'work', vehicles, people);
    expect(intent?.transport).toBe('car');

    const patch = startPersonTravel(person, intent!, now, ctxFor(person, grid, vehicles));
    expect(patch.person.location).toEqual({
      kind: 'vehicle',
      vehicleId: car.id,
      seat: 'driver',
    });
    expect(patch.person.activity).toBe('commuting');
    expect(patch.vehicleDestination?.vehicleId).toBe(car.id);
    // Drive to the road beside the factory, not into the building tile
    expect(patch.vehicleDestination?.dest).toEqual({ x: 3, y: 0 });

    const applied = applyPeopleSimPatch(patch, people, vehicles, now);
    expect(applied.vehicles[car.id].destination).toEqual({ x: 3, y: 0 });
    expect(applied.vehicles[car.id].isMoving).toBe(true);
    expect(applied.vehicles[car.id].driverId).toBe(person.id);
  });

  test('Go To Work walks to a distant owned car before driving', () => {
    const grid = commuteGrid();
    const now = Date.now();
    const person = createPerson({
      firstName: 'Kim',
      lastName: 'Hike',
      sex: 'f',
      ageYears: 40,
      homeKey: '0,0',
      workplaceKey: '4,0',
      now,
      placeAtWorkplaceIfNew: false,
    });
    // Car is at the far end of the block, not next to home
    const car = makeCar({ id: 'car-1', x: 3, y: 0, homeKey: '0,0' });
    const vehicles = { [car.id]: car };
    const intent = commuteIntentForPerson(person, 'work', vehicles, { [person.id]: person });
    expect(intent?.transport).toBe('car');

    const patch = startPersonTravel(person, intent!, now, ctxFor(person, grid, vehicles));
    expect(patch.person.location.kind).toBe('walking');
    expect(patch.person.travelIntent?.pickupVehicleId).toBe(car.id);
    expect(patch.person.travelIntent?.destinationKey).toBe('4,0');
    if (patch.person.location.kind === 'walking') {
      expect(patch.person.location.destKey).toBe('3,0');
    }
  });

  test('Go Home without a car walks home and Go Home with a car drives home', () => {
    const grid = commuteGrid();
    const now = Date.now();
    const atWork = createPerson({
      firstName: 'Alex',
      lastName: 'Shift',
      sex: 'm',
      ageYears: 32,
      homeKey: '0,0',
      workplaceKey: '4,0',
      now,
      placeAtWorkplaceIfNew: true,
    });
    expect(atWork.location.kind).toBe('building');

    const walkIntent = commuteIntentForPerson(atWork, 'home', {}, { [atWork.id]: atWork });
    expect(walkIntent?.transport).toBe('walk');
    const walkPatch = startPersonTravel(atWork, walkIntent!, now, ctxFor(atWork, grid, {}));
    expect(walkPatch.person.location.kind).toBe('walking');
    if (walkPatch.person.location.kind === 'walking') {
      const last = walkPatch.person.location.path[walkPatch.person.location.path.length - 1];
      expect(last).toEqual({ x: 0, y: 0 });
    }

    const car = makeCar({ id: 'car-1', x: 3, y: 0, homeKey: '0,0' });
    const vehicles = { [car.id]: car };
    const driveIntent = commuteIntentForPerson(atWork, 'home', vehicles, { [atWork.id]: atWork });
    expect(driveIntent?.transport).toBe('car');
    const drivePatch = startPersonTravel(
      atWork,
      driveIntent!,
      now,
      ctxFor(atWork, grid, vehicles),
    );
    expect(drivePatch.person.location.kind).toBe('vehicle');
    expect(drivePatch.vehicleDestination?.dest).toEqual({ x: 0, y: 0 });
  });

  test('arriving by car parks, leaves the car, and enters the building', () => {
    const grid = commuteGrid();
    const now = Date.now();
    const person = createPerson({
      firstName: 'Rio',
      lastName: 'Park',
      sex: 'm',
      ageYears: 36,
      homeKey: '0,0',
      workplaceKey: '4,0',
      now,
      placeAtWorkplaceIfNew: false,
    });
    const car = makeCar({ id: 'car-1', x: 3, y: 0, homeKey: '0,0', driverId: person.id });
    const driving: Person = {
      ...person,
      location: { kind: 'vehicle', vehicleId: car.id, seat: 'driver' },
      activity: 'commuting',
      travelIntent: { purpose: 'work', destinationKey: '4,0', transport: 'car' },
    };
    const vehicles = { [car.id]: car };
    const ctx = ctxFor(driving, grid, vehicles);
    const step1 = simulatePersonStep(driving, now, ctx);
    expect(step1.vehiclePark?.vehicleId).toBe(car.id);
    expect(step1.person.location.kind).toBe('outdoor');
    expect(step1.person.travelIntent?.destinationKey).toBe('4,0');

    const parked = applyPeopleSimPatch(step1, ctx.people, vehicles, now);
    expect(parked.vehicles[car.id].isMoving).toBe(false);
    expect(parked.vehicles[car.id].driverId).toBeUndefined();

    const step2 = startPersonTravel(step1.person, step1.person.travelIntent!, now, {
      ...ctx,
      people: parked.people,
      vehicles: parked.vehicles,
    });
    expect(step2.person.location).toEqual({ kind: 'building', buildingKey: '4,0' });
    expect(step2.person.activity).toBe('working');
  });

  test('walk preference leaves the owned car parked', () => {
    const grid = commuteGrid();
    const now = Date.now();
    const person: Person = {
      ...createPerson({
        firstName: 'Ned',
        lastName: 'Walker',
        sex: 'm',
        ageYears: 33,
        homeKey: '0,0',
        workplaceKey: '4,0',
        now,
        placeAtWorkplaceIfNew: false,
      }),
      travelPreference: 'walk',
    };
    const car = makeCar({ id: 'car-1', x: 1, y: 0, homeKey: '0,0' });
    const intent = commuteIntentForPerson(person, 'work', { [car.id]: car }, { [person.id]: person });
    expect(intent?.transport).toBe('walk');
    const patch = startPersonTravel(person, intent!, now, ctxFor(person, grid, { [car.id]: car }));
    expect(patch.person.location.kind).toBe('walking');
    expect(patch.vehicleDestination).toBeUndefined();
    expect(patch.person.travelIntent?.destinationKey).toBe('4,0');
  });

  test('bus preference walks to the nearest stop and alights at the stop nearest work', () => {
    const grid: GridData = {
      '0,0': tile('building-home'),
      '1,0': tile('road-straight'),
      '2,0': tile('road-bus-stop'),
      '3,0': tile('road-straight'),
      '4,0': tile('road-bus-stop'),
      '5,0': tile('building-factory'),
    };
    const now = Date.now();
    const person: Person = {
      ...createPerson({
        firstName: 'Bea',
        lastName: 'Rider',
        sex: 'f',
        ageYears: 29,
        homeKey: '0,0',
        workplaceKey: '5,0',
        now,
        placeAtWorkplaceIfNew: false,
      }),
      travelPreference: 'bus',
    };
    const intent = commuteIntentForPerson(person, 'work', {}, { [person.id]: person });
    expect(intent?.transport).toBe('bus');
    const patch = startPersonTravel(person, intent!, now, ctxFor(person, grid, {}));
    expect(patch.person.location.kind).toBe('walking');
    expect(patch.person.busDropoffStop).toBe('4,0');
    expect(patch.person.travelIntent?.viaKey).toBe('2,0');
    expect(patch.person.travelIntent?.leg).toBe('to-bus-stop');
    if (patch.person.location.kind === 'walking') {
      expect(patch.person.location.destKey).toBe('2,0');
    }
    let walker = patch.person;
    for (let i = 0; i < 40 && walker.location.kind === 'walking'; i++) {
      walker = advanceWalkingPerson(walker, grid, null, now, 0.8, {});
    }
    expect(walker.activity).toBe('waiting_bus');
    expect(walker.location.kind).toBe('outdoor');
    expect(walker.busDropoffStop).toBe('4,0');
  });

  test('waiting riders board a stopped bus and alight at the stop nearest the destination', () => {
    const grid: GridData = {
      '0,0': tile('building-home'),
      '1,0': tile('road-straight'),
      '2,0': tile('road-bus-stop'),
      '3,0': tile('road-straight'),
      '4,0': tile('road-bus-stop'),
      '5,0': tile('building-factory'),
      '6,0': tile('road-straight'),
      '7,0': tile('road-bus-stop'),
    };
    const now = Date.now();
    const buildings: Record<string, BuildingConfig> = {
      '5,0': { anchorKey: '5,0', role: 'factory', inventory: {} },
    };
    const waiting = (first: string, atKey: string, extra: Partial<Person> = {}): Person => ({
      ...createPerson({
        firstName: first,
        lastName: 'Rider',
        sex: 'f',
        ageYears: 29,
        homeKey: '0,0',
        workplaceKey: '5,0',
        now,
        placeAtWorkplaceIfNew: false,
      }),
      activity: 'waiting_bus',
      activityUntil: now + 180_000,
      location: { kind: 'outdoor', atKey },
      busDropoffStop: '9,0',
      travelIntent: {
        purpose: 'work',
        destinationKey: '5,0',
        transport: 'bus',
        leg: 'bus-ride',
        viaKey: atKey,
        alightKey: '9,0',
      },
      ...extra,
    });

    const ada = waiting('Ada', '2,0');
    const far = waiting('Fay', '2,0', {
      location: { kind: 'tile', x: 2, y: 3 },
    });
    const worker = waiting('Wes', '2,0', { activity: 'working' });
    const bus = (x: number, maxPassengers?: number): Vehicle => ({
      id: 'bus-1',
      type: 'bus',
      x,
      y: 0,
      heading: 90,
      lane: 1,
      progress: 0.5,
      color: '#2563eb',
      zIndex: 0,
      isMoving: false,
      busPhase: 'boarding',
      busRoute: ['2,0', '7,0', '4,0'],
      ...(maxPassengers !== undefined ? { maxPassengers } : {}),
    });

    let people: Record<string, Person> = {
      [ada.id]: ada,
      [far.id]: far,
      [worker.id]: worker,
    };
    people = exchangeBusPassengers(people, bus(2), grid, now);
    expect(people[ada.id].location).toEqual({ kind: 'vehicle', vehicleId: 'bus-1', seat: 'passenger' });
    expect(people[ada.id].busDropoffStop).toBe('4,0');
    expect(people[ada.id].travelIntent?.leg).toBe('bus-ride');
    expect(people[ada.id].travelIntent?.alightKey).toBe('4,0');
    expect(people[far.id].location.kind).toBe('tile');
    expect(people[worker.id].activity).toBe('working');

    const late = waiting('Bea', '2,0');
    people = { ...people, [late.id]: late };
    const again = exchangeBusPassengers(people, bus(2), grid, now);
    expect(again[late.id].location).toEqual({ kind: 'vehicle', vehicleId: 'bus-1', seat: 'passenger' });
    expect(again[ada.id].location).toEqual({ kind: 'vehicle', vehicleId: 'bus-1', seat: 'passenger' });

    const atFarStop = exchangeBusPassengers(again, bus(7), grid, now);
    expect(atFarStop[ada.id].location.kind).toBe('vehicle');
    expect(atFarStop[late.id].location.kind).toBe('vehicle');

    const alighted = exchangeBusPassengers(atFarStop, bus(4), grid, now);
    for (const id of [ada.id, late.id]) {
      const p = alighted[id];
      expect(p.location.kind).toBe('outdoor');
      if (p.location.kind === 'outdoor') expect(p.location.atKey).toBe('4,0');
      expect(p.activity).toBe('commuting');
      expect(p.busDropoffStop).toBeUndefined();
      expect(p.travelIntent).toEqual({
        purpose: 'work',
        destinationKey: '5,0',
        transport: 'walk',
        leg: 'from-bus',
      });
    }

    const walked = simulatePersonStep(alighted[ada.id], now, {
      grid,
      buildings,
      vehicles: {},
      people: alighted,
      traffic: null,
    });
    expect(walked.person.location.kind).toBe('walking');
    if (walked.person.location.kind === 'walking') {
      expect(walked.person.location.destKey).toBe('5,0');
    }
    expect(walked.person.location.kind).not.toBe('building');

    const alreadyThere = waiting('Cara', '4,0');
    const stayed = exchangeBusPassengers({ [alreadyThere.id]: alreadyThere }, bus(4), grid, now);
    expect(stayed[alreadyThere.id].activity).toBe('waiting_bus');
    expect(stayed[alreadyThere.id].location.kind).toBe('outdoor');

    const full = exchangeBusPassengers(
      { [ada.id]: { ...ada, location: { kind: 'outdoor', atKey: '2,0' } } },
      bus(2, 0),
      grid,
      now,
    );
    expect(full[ada.id].location.kind).toBe('outdoor');
  });

  test('a train connection alights at the stop nearest the station and keeps going', () => {
    const grid: GridData = {
      '2,0': tile('road-bus-stop'),
      '4,0': tile('road-bus-stop'),
      '5,0': tile('building-station'),
    };
    const now = Date.now();
    const person: Person = {
      ...createPerson({
        firstName: 'Tess',
        lastName: 'Rail',
        sex: 'f',
        ageYears: 34,
        homeKey: '0,0',
        now,
        placeAtWorkplaceIfNew: false,
      }),
      activity: 'waiting_bus',
      activityUntil: now + 60_000,
      location: { kind: 'outdoor', atKey: '2,0' },
      busDropoffStop: '4,0',
      travelIntent: {
        purpose: 'work',
        destinationKey: '9,0',
        transport: 'bus',
        leg: 'to-train-station',
        viaKey: '5,0',
        alightKey: '5,0',
      },
    };
    const busAt = (x: number): Vehicle => ({
      id: 'bus-1',
      type: 'bus',
      x,
      y: 0,
      heading: 90,
      lane: 1,
      progress: 0.5,
      color: '#2563eb',
      zIndex: 0,
      isMoving: false,
      busRoute: ['2,0', '4,0'],
    });
    const boarded = exchangeBusPassengers({ [person.id]: person }, busAt(2), grid, now);
    expect(boarded[person.id].location.kind).toBe('vehicle');
    expect(boarded[person.id].busDropoffStop).toBe('4,0');
    const dropped = exchangeBusPassengers(boarded, busAt(4), grid, now);
    expect(dropped[person.id].location.kind).toBe('outdoor');
    if (dropped[person.id].location.kind === 'outdoor') {
      expect(dropped[person.id].location.atKey).toBe('4,0');
    }
    expect(dropped[person.id].travelIntent?.leg).toBe('to-train-station');
    expect(dropped[person.id].travelIntent?.viaKey).toBe('5,0');
  });

  test('robotaxi preference waits at home for the taxi', () => {
    const grid = commuteGrid();
    const now = Date.now();
    const person: Person = {
      ...createPerson({
        firstName: 'Rex',
        lastName: 'Hail',
        sex: 'm',
        ageYears: 41,
        homeKey: '0,0',
        workplaceKey: '4,0',
        now,
        placeAtWorkplaceIfNew: false,
      }),
      travelPreference: 'robotaxi',
    };
    const taxi: Vehicle = {
      id: 'taxi-1',
      type: 'taxi',
      x: 3,
      y: 0,
      heading: 270,
      lane: 1,
      progress: 0.5,
      color: '#eab308',
      zIndex: 0,
      isMoving: false,
    };
    const buildings: Record<string, BuildingConfig> = {
      '4,0': { anchorKey: '4,0', role: 'factory', inventory: {} },
      '1,1': {
        anchorKey: '1,1',
        role: 'taxi-station',
        inventory: {},
        taxiFleetIds: ['taxi-1'],
        taxiStationOwnerId: 'owner-1',
      },
    };
    const patch = startPersonTravel(
      person,
      commuteIntentForPerson(person, 'work', { 'taxi-1': taxi }, { [person.id]: person })!,
      now,
      {
        grid,
        buildings,
        vehicles: { 'taxi-1': taxi },
        people: { [person.id]: person },
        traffic: null,
      },
    );
    expect(patch.person.activity).toBe('waiting_taxi');
    expect(patch.person.location.kind).toBe('outdoor');
    expect(patch.newTaxiRide?.ride.destinationKey).toBe('4,0');
    expect(patch.newTaxiRide?.ride.phase).toBe('to_pickup');
    expect(patch.vehicleDestination?.vehicleId).toBe('taxi-1');
  });

  test('train preference walks to the nearest station, bound for the station nearest work', () => {
    const grid: GridData = {
      '0,0': tile('building-home'),
      '1,0': tile('road-straight'),
      '1,1': tile('building-station'),
      '2,0': tile('road-straight'),
      '3,0': tile('road-straight'),
      '4,0': tile('building-factory'),
      '4,1': tile('building-station'),
      '2,2': tile('rail-straight'),
    };
    const now = Date.now();
    const person: Person = {
      ...createPerson({
        firstName: 'Ada',
        lastName: 'Rail',
        sex: 'f',
        ageYears: 37,
        homeKey: '0,0',
        workplaceKey: '4,0',
        now,
        placeAtWorkplaceIfNew: false,
      }),
      travelPreference: 'train',
    };
    const intent = commuteIntentForPerson(person, 'work', {}, { [person.id]: person });
    const patch = startPersonTravel(person, intent!, now, ctxFor(person, grid, {}));
    expect(patch.person.location.kind).toBe('walking');
    expect(patch.person.travelIntent?.leg).toBe('to-train-station');
    expect(patch.person.travelIntent?.viaKey).toBe('1,1');
    expect(patch.person.travelIntent?.alightKey).toBe('4,1');
    expect(patch.person.travelIntent?.destinationKey).toBe('4,0');
    if (patch.person.location.kind === 'walking') {
      expect(patch.person.location.destKey).toBe('1,1');
    }
  });

  test('a person waiting at a station boards a nearby train toward the alight station', () => {
    const grid: GridData = {
      '0,0': tile('building-home'),
      '1,1': tile('building-station'),
      '1,2': tile('rail-straight'),
      '4,0': tile('building-factory'),
      '4,1': tile('building-station'),
      '4,2': tile('rail-straight'),
    };
    const now = Date.now();
    const person: Person = {
      ...createPerson({
        firstName: 'Bo',
        lastName: 'Track',
        sex: 'm',
        ageYears: 34,
        homeKey: '0,0',
        workplaceKey: '4,0',
        now,
        placeAtWorkplaceIfNew: false,
      }),
      travelPreference: 'train',
      location: { kind: 'outdoor', atKey: '1,1' },
      activity: 'waiting_train',
    };
    const train: Vehicle = {
      id: 'train-1',
      type: 'train',
      x: 1,
      y: 2,
      heading: 90,
      lane: 0,
      progress: 0.5,
      color: '#334155',
      zIndex: 0,
      isMoving: false,
    };
    const patch = startPersonTravel(
      person,
      {
        purpose: 'work',
        destinationKey: '4,0',
        transport: 'train',
        leg: 'to-train-station',
        viaKey: '1,1',
        alightKey: '4,1',
      },
      now,
      ctxFor(person, grid, { 'train-1': train }),
    );
    expect(patch.person.location).toEqual({
      kind: 'vehicle',
      vehicleId: 'train-1',
      seat: 'passenger',
    });
    expect(patch.person.travelIntent?.leg).toBe('train-ride');
    expect(patch.vehicleDestination?.dest).toEqual({ x: 4, y: 2 });
  });
});

test('cul-de-sac tile connects as a single 2-lane stem', () => {
  expect(TILE_CONNECTIONS['road-cul-de-sac']).toEqual([2]);
});
