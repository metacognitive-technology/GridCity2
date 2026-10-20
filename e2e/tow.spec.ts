import { expect, test } from '@playwright/test';
import {
  canBeTowed,
  connectTowHook,
  disconnectTowHook,
  findTowTargetBehind,
  headingForward,
  isTowLinked,
  placeVehicleBehind,
  snapTowedVehicle,
  vehicleGridPos,
} from '../src/tow';
import type { Vehicle } from '../src/types';

function car(partial: Partial<Vehicle> & Pick<Vehicle, 'id' | 'x' | 'y'>): Vehicle {
  return {
    heading: 0,
    lane: 1,
    progress: 0.5,
    color: '#dc2626',
    zIndex: 0,
    type: 'car',
    isMoving: false,
    ...partial,
  };
}

function towTruck(partial: Partial<Vehicle> & Pick<Vehicle, 'id' | 'x' | 'y'>): Vehicle {
  return {
    heading: 0,
    lane: 1,
    progress: 0.5,
    color: '#ca8a04',
    zIndex: 0,
    type: 'tow-truck',
    isMoving: false,
    ...partial,
  };
}

test.describe('tow hook', () => {
  test('heading 0 (north) points toward -Y', () => {
    const f = headingForward(0);
    expect(f.x).toBeCloseTo(0, 5);
    expect(f.y).toBeCloseTo(-1, 5);
  });

  test('finds a car within ½ tile behind the tow truck and ignores vehicles ahead', () => {
    const tow = towTruck({ id: 'tow-1', x: 5, y: 5, heading: 0, progress: 0.5 });
    const behind = car({ id: 'car-b', x: 5, y: 5, heading: 0, progress: 0.15 });
    const ahead = car({ id: 'car-a', x: 5, y: 5, heading: 0, progress: 0.85 });
    const far = car({ id: 'car-f', x: 5, y: 7, heading: 0, progress: 0.5 });
    const fleet = { [tow.id]: tow, [behind.id]: behind, [ahead.id]: ahead, [far.id]: far };

    const target = findTowTargetBehind(tow, fleet);
    expect(target?.id).toBe('car-b');

    const behindPos = vehicleGridPos(behind);
    const towPos = vehicleGridPos(tow);
    expect(behindPos.y).toBeGreaterThan(towPos.y);
    expect(Math.hypot(behindPos.x - towPos.x, behindPos.y - towPos.y)).toBeLessThanOrEqual(0.5);
  });

  test('does not hook trains or a truck that is already towing', () => {
    const tow = towTruck({ id: 'tow-1', x: 3, y: 3, heading: 90, progress: 0.5 });
    const train: Vehicle = {
      ...car({ id: 'train-1', x: 2, y: 3, heading: 90, progress: 0.5 }),
      type: 'train',
    };
    const busy = towTruck({
      id: 'tow-2',
      x: 2,
      y: 3,
      heading: 90,
      progress: 0.5,
      towedVehicleId: 'car-x',
    });
    expect(canBeTowed(train, tow.id)).toBe(false);
    expect(canBeTowed(busy, tow.id)).toBe(false);
    expect(findTowTargetBehind(tow, { [tow.id]: tow, [train.id]: train })).toBeNull();
  });

  test('connect / disconnect and snap keep the hooked vehicle behind the truck', () => {
    const tow = towTruck({ id: 'tow-1', x: 8, y: 8, heading: 0, progress: 0.6 });
    const victim = car({ id: 'car-1', x: 8, y: 8, heading: 0, progress: 0.2, isMoving: true });
    let fleet = { [tow.id]: tow, [victim.id]: victim };

    const target = findTowTargetBehind(tow, fleet);
    expect(target?.id).toBe('car-1');

    fleet = connectTowHook(fleet, tow.id, victim.id);
    expect(fleet['tow-1'].towedVehicleId).toBe('car-1');
    expect(fleet['car-1'].towedById).toBe('tow-1');
    expect(fleet['car-1'].isMoving).toBe(false);
    expect(isTowLinked(fleet['tow-1'], fleet['car-1'])).toBe(true);

    const movedTow = { ...fleet['tow-1'], y: 7, progress: 0.7 };
    fleet = { ...fleet, [movedTow.id]: movedTow };
    fleet = snapTowedVehicle(fleet, movedTow);
    const follow = placeVehicleBehind(movedTow);
    expect(fleet['car-1'].x).toBe(follow.x);
    expect(fleet['car-1'].y).toBe(follow.y);
    expect(fleet['car-1'].heading).toBe(0);

    fleet = disconnectTowHook(fleet, tow.id);
    expect(fleet['tow-1'].towedVehicleId).toBeUndefined();
    expect(fleet['car-1'].towedById).toBeUndefined();
  });
});
