import { expect, test, type Page } from '@playwright/test';
import type { ActiveTaxiRide, BuildingConfig } from '../src/types';
import { releaseDeletedTaxis } from '../src/people';
import { createFreshRoom } from './helpers';

function station(key: string, partial: Partial<BuildingConfig> = {}): BuildingConfig {
  return {
    anchorKey: key,
    role: 'taxi-station',
    inventory: {},
    taxiStationOwnerId: `owner-${key}`,
    taxiFleetIds: [],
    activeTaxiRides: [],
    ...partial,
  };
}

function ride(taxiId: string, id = `ride-${taxiId}`): ActiveTaxiRide {
  return {
    id,
    taxiId,
    passengerId: 'person-1',
    phase: 'to_pickup',
    pickupKey: '1,1',
    destinationKey: '2,2',
    purpose: 'work',
    startedAt: 1,
  };
}

test('deleting a taxi drops it from every station that listed it', () => {
  const buildings = {
    '4,4': station('4,4', {
      taxiFleetIds: ['taxi-a', 'taxi-b'],
      activeTaxiRides: [ride('taxi-a'), ride('taxi-b', 'ride-b')],
    }),
    '8,4': station('8,4', {
      taxiFleetIds: ['taxi-a'],
      activeTaxiRides: [ride('taxi-a', 'ride-other')],
    }),
    '1,1': station('1,1', { taxiFleetIds: ['taxi-c'], activeTaxiRides: [ride('taxi-c')] }),
  };

  const next = releaseDeletedTaxis(buildings, ['taxi-a']);

  expect(next['4,4'].taxiFleetIds).toEqual(['taxi-b']);
  expect(next['4,4'].activeTaxiRides?.map(r => r.taxiId)).toEqual(['taxi-b']);
  expect(next['8,4'].taxiFleetIds).toEqual([]);
  expect(next['8,4'].activeTaxiRides).toEqual([]);
  expect(next['1,1']).toBe(buildings['1,1']);
  expect(releaseDeletedTaxis(buildings, ['missing'])).toBe(buildings);
  expect(releaseDeletedTaxis(buildings, [])).toBe(buildings);
});

async function clickCell(page: Page, x: number, y: number) {
  const map = page.getByTestId('map-viewport');
  await map.click({ position: { x: (x + 0.5) * 64, y: (y + 0.5) * 64 } });
}

async function openTaxiStation(page: Page) {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await clickCell(page, 6, 4);
  const panel = page.getByTestId('taxi-station-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test('deleting a taxi from Service Vehicles unassigns it from the station', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createFreshRoom(page);

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByTitle('Taxi Station (4×2, 4 bays)').click();
  await clickCell(page, 6, 4);

  const panel = await openTaxiStation(page);
  await panel.getByRole('button', { name: '+ Add taxi' }).click();
  await expect(panel).toContainText('Fleet (1)');
  await expect(panel).toContainText('Idle');
  await expect(panel).not.toContainText('Missing vehicle');

  await page.getByTitle('Close').click();
  await expect(panel).toBeHidden();
  await page.getByTitle('Logistics & Economy').click();

  await page.getByTitle('Service Vehicles').click();
  const service = page.locator('div.fixed').filter({
    has: page.getByRole('heading', { name: 'Service Vehicles' }),
  });
  await expect(service).toBeVisible();
  await service.getByRole('checkbox', { name: /^cab-/ }).check();
  await service.getByTitle('Remove Selected').click();
  await expect(service).toContainText('No service vehicles active');

  const reopened = await openTaxiStation(page);
  await expect(reopened).toContainText('No taxis yet');
  await expect(reopened).toContainText('Fleet (0)');
  await expect(reopened).not.toContainText('Missing vehicle');
  await expect(reopened).not.toContainText('Idle');
});

test('deleting a taxi from the station window clears that fleet', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createFreshRoom(page);

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByTitle('Taxi Station (4×2, 4 bays)').click();
  await clickCell(page, 6, 4);

  const panel = await openTaxiStation(page);
  await panel.getByRole('button', { name: '+ Add taxi' }).click();
  await expect(panel).toContainText('Fleet (1)');
  await panel.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(panel).toContainText('Fleet (0)');
  await expect(panel).toContainText('No taxis yet');
  await expect(panel).not.toContainText('Missing vehicle');
});
