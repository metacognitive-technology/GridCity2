import { expect, test, type Page } from '@playwright/test';
import {
  LANE_OFFSET_UNIT,
  ROUNDABOUT_ISLAND_R,
  ROUNDABOUT_LANE_R,
  ROUNDABOUT_OUTER_R,
  ROAD_WIDTH_2L,
  TILE_PX,
} from '../src/roadGeometry';
import { driveExitPorts, routeStepCost, TILE_CONNECTIONS } from '../src/traffic';
import type { GridData, GridTile, Vehicle } from '../src/types';
import { getTrajectory, roundaboutTravelFactor } from '../src/vehicleTrajectory';
import { bindRouteExit, getVehiclePose, resolveVehicleExit } from '../src/vehicleShapes';
import { createFreshRoom } from './helpers';

const TILE = 'road-roundabout-4way';

function pose(heading: number, exit: number, progress: number, lane = 1) {
  return getTrajectory(0, 0, heading, exit, lane, progress, TILE);
}

function samples(heading: number, exit: number, lane = 1, n = 32) {
  return Array.from({ length: n + 1 }, (_, i) => pose(heading, exit, i / n, lane));
}

function distToCenter(p: { posX: number; posY: number }) {
  return Math.hypot(p.posX - TILE_PX / 2, p.posY - TILE_PX / 2);
}

function onAsphalt(p: { posX: number; posY: number }) {
  const dx = p.posX - TILE_PX / 2;
  const dy = p.posY - TILE_PX / 2;
  if (Math.hypot(dx, dy) <= ROUNDABOUT_OUTER_R + 1.2) return true;
  const half = ROAD_WIDTH_2L / 2 + 1.2;
  const inTile = p.posX >= -1 && p.posX <= TILE_PX + 1 && p.posY >= -1 && p.posY <= TILE_PX + 1;
  return inTile && (Math.abs(dx) <= half || Math.abs(dy) <= half);
}

function angleOf(p: { posX: number; posY: number }) {
  return Math.atan2(p.posY - TILE_PX / 2, p.posX - TILE_PX / 2);
}

function grid(): GridData {
  const ns: GridTile = { type: 'road-straight', rotation: 0 };
  const ew: GridTile = { type: 'road-straight', rotation: 90 };
  return {
    '0,0': [{ type: 'road-roundabout-4way', rotation: 0 }],
    '0,-1': [ns],
    '0,1': [ns],
    '1,0': [ew],
    '-1,0': [ew],
  };
}

function veh(partial: Partial<Vehicle>): Vehicle {
  return {
    id: 'car',
    x: 0,
    y: 0,
    heading: 0,
    lane: 1,
    progress: 0.4,
    color: '#eab308',
    zIndex: 0,
    type: 'car',
    turnAroundAtDeadEnd: true,
    ...partial,
  };
}

test('mirror roundabout keeps the same ports as the quarter roundabout', () => {
  expect(TILE_CONNECTIONS['road-roundabout-reverse']).toEqual(TILE_CONNECTIONS['road-roundabout']);
  expect(TILE_CONNECTIONS['road-roundabout-4way']).toEqual([0, 1, 2, 3]);
  expect(driveExitPorts('road-roundabout-4way', [0, 1, 2, 3], 2, null).sort()).toEqual([0, 1, 2, 3]);
  expect(driveExitPorts('road-cross', [0, 1, 2, 3], 2, null)).toEqual([0, 1, 3]);
  expect(routeStepCost('road-roundabout-4way', 2, 2)).toBeGreaterThan(routeStepCost('road-cross', 2, 0));
});

test('4-way roundabout paths stay on the ring and match the exit lane', () => {
  const center = TILE_PX / 2;
  const cases: { name: string; exit: number; side: 'east' | 'north' | 'west' | 'south' }[] = [
    { name: 'straight', exit: 0, side: 'north' },
    { name: 'right', exit: 90, side: 'east' },
    { name: 'left', exit: 270, side: 'west' },
    { name: 'uturn', exit: 180, side: 'south' },
  ];

  for (const c of cases) {
    const pts = samples(0, c.exit);
    const start = pts[0];
    const end = pts[pts.length - 1];
    const straightStart = getTrajectory(0, 0, 0, 0, 1, 0);
    const straightEnd = getTrajectory(0, 0, c.exit, c.exit, 1, 1);

    expect(Math.hypot(start.posX - straightStart.posX, start.posY - straightStart.posY), c.name).toBeLessThan(0.6);
    expect(Math.hypot(end.posX - straightEnd.posX, end.posY - straightEnd.posY), c.name).toBeLessThan(0.6);

    for (const p of pts) {
      expect(distToCenter(p), `${c.name} island`).toBeGreaterThan(ROUNDABOUT_ISLAND_R - 0.6);
      expect(onAsphalt(p), `${c.name} asphalt ${p.posX.toFixed(1)},${p.posY.toFixed(1)}`).toBe(true);
    }

    if (c.side === 'north') {
      expect(end.posY).toBeLessThan(2);
      expect(end.posX).toBeGreaterThan(center);
    } else if (c.side === 'east') {
      expect(end.posX).toBeGreaterThan(TILE_PX - 2);
      expect(end.posY).toBeGreaterThan(center);
    } else if (c.side === 'west') {
      expect(end.posX).toBeLessThan(2);
      expect(end.posY).toBeLessThan(center);
    } else {
      expect(end.posY).toBeGreaterThan(TILE_PX - 2);
      expect(end.posX).toBeLessThan(center);
    }
  }

  // Straight rides the east flank of the island, not through it and not the long way west.
  const straight = samples(0, 0);
  expect(Math.min(...straight.map(p => p.posX))).toBeGreaterThan(center - 4);
  expect(Math.max(...straight.map(p => p.posX))).toBeGreaterThan(center + ROUNDABOUT_LANE_R * 0.7);

  // Left continues around to the west side.
  const left = samples(0, 270);
  expect(Math.min(...left.map(p => p.posX))).toBeLessThan(center - ROUNDABOUT_LANE_R * 0.6);
  expect(Math.min(...left.map(p => p.posY))).toBeLessThan(center - ROUNDABOUT_LANE_R * 0.5);

  // U-turn loops far enough to pass the west side before leaving south.
  const uturn = samples(0, 180);
  expect(Math.min(...uturn.map(p => p.posX))).toBeLessThan(center - ROUNDABOUT_LANE_R * 0.6);
  expect(Math.min(...uturn.map(p => p.posY))).toBeLessThan(center - 4);

  // Circulation is counterclockwise: angle around the center decreases along the ring.
  const ring = straight.filter(p => Math.abs(distToCenter(p) - ROUNDABOUT_LANE_R) < 2.5);
  expect(ring.length).toBeGreaterThan(3);
  let decreases = 0;
  for (let i = 1; i < ring.length; i++) {
    let d = angleOf(ring[i]) - angleOf(ring[i - 1]);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    if (d < -0.01) decreases++;
  }
  expect(decreases).toBeGreaterThan(ring.length * 0.6);

  // A wrong-side approach still starts on that lane and exits on the right-hand lane.
  const wrongStart = pose(0, 0, 0, -1);
  const rightStart = getTrajectory(0, 0, 0, 0, -1, 0);
  expect(Math.hypot(wrongStart.posX - rightStart.posX, wrongStart.posY - rightStart.posY)).toBeLessThan(0.6);
  expect(wrongStart.posX).toBeLessThan(center);
  const wrongEnd = pose(0, 0, 1, -1);
  expect(wrongEnd.posX).toBeGreaterThan(center);

  // Longer loops are not faster than a straight tile.
  expect(roundaboutTravelFactor(0, 0, 0, 0, 1)).toBeLessThanOrEqual(1);
  expect(roundaboutTravelFactor(0, 0, 0, 180, 1)).toBeLessThan(roundaboutTravelFactor(0, 0, 0, 90, 1));
  expect(LANE_OFFSET_UNIT).toBeGreaterThan(0);
});

test('vehicles can leave a 4-way roundabout straight, left, right, or by U-turn', () => {
  const tile = grid()['0,0'][0];
  const g = grid();
  const base = veh({});
  expect(resolveVehicleExit(base, tile, g)).toBe(0);
  expect(resolveVehicleExit({ ...base, turnIntent: 'right' }, tile, g)).toBe(90);
  expect(resolveVehicleExit({ ...base, turnIntent: 'left' }, tile, g)).toBe(270);
  expect(resolveVehicleExit({ ...base, turnIntent: 'uturn' }, tile, g)).toBe(180);

  bindRouteExit(() => 180);
  const routed = resolveVehicleExit(
    { ...base, destination: { x: 0, y: 3 }, turnIntent: null },
    tile,
    g,
  );
  expect(routed).toBe(180);

  const sprite = getVehiclePose({ ...base, progress: 0.55, turnIntent: 'left' }, g);
  const straight = getTrajectory(0, 0, 0, 0, 1, 0.55);
  expect(Math.hypot(sprite.posX - straight.posX, sprite.posY - straight.posY)).toBeGreaterThan(4);
});

function titled(page: Page, title: string) {
  return page.getByTitle(title, { exact: true });
}

async function clickCell(page: Page, x: number, y: number) {
  const map = page.getByTestId('map-viewport');
  await map.click({ position: { x: (x + 0.5) * 64, y: (y + 0.5) * 64 } });
}

async function spriteCenter(page: Page) {
  const map = page.getByTestId('map-viewport');
  const sprite = page.locator('[data-testid^="vehicle-sprite-car-"]');
  await expect(sprite).toBeVisible();
  const mapBox = await map.boundingBox();
  const box = await sprite.boundingBox();
  expect(mapBox).toBeTruthy();
  expect(box).toBeTruthy();
  return {
    x: box!.x + box!.width / 2 - mapBox!.x,
    y: box!.y + box!.height / 2 - mapBox!.y,
  };
}

async function spriteHeading(page: Page) {
  const sprite = page.locator('[data-testid^="vehicle-sprite-car-"]');
  const transform = await sprite.evaluate(el => getComputedStyle(el).transform);
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) return 0;
  const [a, b] = match[1].split(',').map(part => Number(part.trim()));
  return (Math.atan2(b, a) * 180) / Math.PI;
}

test('roundabout tiles are on the road palette', async ({ page }) => {
  await createFreshRoom(page);
  await page.getByRole('button', { name: 'Roads', exact: true }).click();
  const roundabout = titled(page, 'Roundabout');
  const mirror = titled(page, 'Roundabout Mirror');
  const fourWay = titled(page, '4-Way Roundabout');
  await roundabout.scrollIntoViewIfNeeded();
  await expect(roundabout).toBeVisible();
  await expect(mirror).toBeVisible();
  await expect(fourWay).toBeVisible();
  await fourWay.click();
  await expect(fourWay).toHaveClass(/border-blue-500/);
  await mirror.click();
  await expect(mirror).toHaveClass(/border-blue-500/);
  await expect(roundabout).not.toHaveClass(/border-blue-500/);
});

test('placed roundabouts draw the mirror and the four-way circle', async ({ page }) => {
  await createFreshRoom(page);
  await page.getByRole('button', { name: 'Roads', exact: true }).click();

  async function place(title: string, x: number, y: number) {
    const button = titled(page, title);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await clickCell(page, x, y);
  }

  await place('Roundabout', 2, 2);
  await place('Roundabout Mirror', 4, 2);
  await place('4-Way Roundabout', 6, 2);
  await place('Straight Road', 6, 3);
  await page.keyboard.press('Escape');

  const map = page.getByTestId('map-viewport');
  const mirror = map.locator('svg[width="64"] g[transform="translate(64 0) scale(-1 1)"]');
  await expect(mirror).toHaveCount(1);
  await expect(mirror.locator('path').first()).toBeVisible();
  await expect(map.locator('svg[width="64"] circle[r="24"]')).toHaveCount(1);
  await expect(map.locator('svg[width="64"] circle[r="16"]')).toHaveCount(1);
  await expect(map.locator('svg[width="64"] circle[r="8"][fill="#86efac"]')).toHaveCount(1);
  for (const transform of [
    'translate(48 32) rotate(0)',
    'translate(32 16) rotate(270)',
    'translate(16 32) rotate(180)',
    'translate(32 48) rotate(90)',
  ]) {
    await expect(map.locator(`svg[width="64"] path[transform="${transform}"]`)).toHaveCount(1);
  }

  await map.screenshot({
    path: '/tmp/gridcity-verify/roundabout-tiles.png',
    clip: { x: 96, y: 96, width: 384, height: 192 },
  });
});

/** Stop a new car on a north-south road and build a 4-way roundabout in front of it. */
async function approachRoundabout(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createFreshRoom(page);
  await page.getByRole('button', { name: 'Roads', exact: true }).click();
  const straight = titled(page, 'Straight Road');
  await straight.scrollIntoViewIfNeeded();
  await straight.click();
  for (let y = 3; y <= 8; y++) await clickCell(page, 4, y);
  await page.keyboard.press('Escape');

  await titled(page, 'Cars').click();
  const cars = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: 'Cars' }) });
  await expect(cars).toBeVisible();
  await cars.getByTitle('Add car(s)').click();
  const sprite = page.locator('[data-testid^="vehicle-sprite-car-"]');
  await expect(sprite).toBeVisible();
  await page.keyboard.press('s');
  await cars.locator('.border-b button').click();
  await expect(cars).toBeHidden();

  await page.keyboard.press('ArrowRight');
  const stopped = await spriteCenter(page);
  const heading = await spriteHeading(page);
  const north = Math.abs(heading) < 45 || Math.abs(heading) > 315;
  const south = Math.abs(Math.abs(heading) - 180) < 45;
  expect(north || south, `heading ${heading}`).toBe(true);

  const tileX = 4;
  const tileY = Math.floor(stopped.y / 64);
  const centerX = (tileX + 0.5) * 64;
  await expect.poll(async () => {
    const x = (await spriteCenter(page)).x;
    return north ? x > centerX : x < centerX;
  }, { timeout: 3000 }).toBe(true);

  const aheadY = north ? tileY - 1 : tileY + 1;
  await page.getByRole('button', { name: 'Roads', exact: true }).click();
  const fourWay = titled(page, '4-Way Roundabout');
  await fourWay.scrollIntoViewIfNeeded();
  await fourWay.click();
  await clickCell(page, tileX, aheadY);
  await straight.scrollIntoViewIfNeeded();
  await straight.click();
  const exitY = north ? aheadY - 1 : aheadY + 1;
  await clickCell(page, tileX, exitY);
  await clickCell(page, tileX - 1, aheadY);
  await clickCell(page, tileX + 1, aheadY);
  await page.keyboard.press('Escape');

  await sprite.dblclick();
  const title = page.getByTestId('drive-panel-title');
  await expect(title).toBeVisible();
  const panel = title.locator('xpath=ancestor::*[@data-grid-control][1]');
  await panel.locator('input[type="checkbox"]').first().check();
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });

  return { north, centerX, aheadY, panel };
}

test('a car drives straight through a 4-way roundabout', async ({ page }) => {
  test.setTimeout(45_000);
  const { north, centerX, aheadY, panel } = await approachRoundabout(page);
  const roundX = centerX;
  const roundY = (aheadY + 0.5) * 64;
  let shot = false;
  await page.keyboard.press('g');
  await expect.poll(async () => {
    const here = await spriteCenter(page);
    if (!shot && Math.hypot(here.x - roundX, here.y - roundY) < 26) {
      shot = true;
      await page.getByTestId('map-viewport').screenshot({
        path: '/tmp/gridcity-verify/roundabout-straight.png',
        clip: {
          x: Math.max(0, roundX - 96),
          y: Math.max(0, roundY - 96),
          width: 192,
          height: 192,
        },
      });
      await panel.screenshot({ path: '/tmp/gridcity-verify/driver-straight.png' });
    }
    const passed = north ? here.y < aheadY * 64 : here.y > (aheadY + 1) * 64;
    const rightLane = north ? here.x > centerX : here.x < centerX;
    return passed && rightLane;
  }, { timeout: 15_000 }).toBe(true);
  await page.keyboard.press('s');
});

test('a car U-turns around a 4-way roundabout', async ({ page }) => {
  test.setTimeout(45_000);
  const { north, centerX, aheadY, panel } = await approachRoundabout(page);
  const roundX = centerX;
  const roundY = (aheadY + 0.5) * 64;
  let shot = false;
  await page.keyboard.press('g');
  await expect.poll(async () => {
    await page.keyboard.press('u');
    const here = await spriteCenter(page);
    if (!shot && here.x < centerX - 8 && Math.abs(here.y - roundY) < 30) {
      shot = true;
      await page.getByTestId('map-viewport').screenshot({
        path: '/tmp/gridcity-verify/roundabout-uturn.png',
        clip: {
          x: Math.max(0, roundX - 96),
          y: Math.max(0, roundY - 96),
          width: 192,
          height: 192,
        },
      });
      await panel.screenshot({ path: '/tmp/gridcity-verify/driver-uturn.png' });
    }
    // Back on the approach road, in the right-hand lane of the reversed heading.
    const onApproach = north ? here.y > (aheadY + 1) * 64 + 4 : here.y < aheadY * 64 - 4;
    const exitLane = north ? here.x < centerX : here.x > centerX;
    return onApproach && exitLane;
  }, { timeout: 20_000, intervals: [40, 80, 80] }).toBe(true);
  await page.keyboard.press('s');
});
