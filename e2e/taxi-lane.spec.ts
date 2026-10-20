import { expect, test, type Page } from '@playwright/test';
import { createFreshRoom } from './helpers';

async function clickCell(page: Page, x: number, y: number, fx = 0.5, fy = 0.5) {
  const map = page.getByTestId('map-viewport');
  await map.click({ position: { x: (x + fx) * 64, y: (y + fy) * 64 } });
}

async function spriteCenter(page: Page) {
  const map = page.getByTestId('map-viewport');
  const sprite = page.locator('[data-testid^="vehicle-sprite-cab-"]');
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

test('a manually driven taxi stays in its lane across the next tile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createFreshRoom(page);

  await page.getByRole('button', { name: 'Roads', exact: true }).click();
  await page.getByTitle('Straight Road').click();
  // Stay inside the map. Cell 12's center is the viewport's bottom edge.
  for (let y = 3; y <= 11; y++) {
    await clickCell(page, 8, y);
  }
  await page.keyboard.press('Escape');

  await page.getByTitle('Service Vehicles').click();
  const service = page.locator('div.fixed').filter({
    has: page.getByRole('heading', { name: 'Service Vehicles' }),
  });
  await expect(service).toBeVisible();
  await service.getByTitle('Add Robotaxi(s)').click();
  await service.getByRole('checkbox', { name: /^cab-/ }).check();
  await service.getByTitle('Place selected cars on grid').click();
  await service.locator('.border-b').first().locator('button').click();
  await expect(service).toBeHidden();

  // East half of a north-south road: right-hand lane, heading north.
  await clickCell(page, 8, 9, 0.75, 0.5);
  await page.keyboard.press('Escape');

  const sprite = page.locator('[data-testid^="vehicle-sprite-cab-"]');
  await expect(sprite).toBeVisible();
  await sprite.dblclick();

  const title = page.getByTestId('drive-panel-title');
  await expect(title).toBeVisible();
  const panel = title.locator('xpath=ancestor::*[@data-grid-control][1]');
  await panel.locator('input[type="checkbox"]').first().check();
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });

  const right = await spriteCenter(page);
  // Tile 8 center is 544. The right-hand lane sits east of it.
  expect(right.x).toBeGreaterThan(544);

  await page.keyboard.press('g');
  await expect.poll(async () => (await spriteCenter(page)).y, { timeout: 8000 }).toBeLessThan(right.y - 70);
  await page.keyboard.press('s');
  const afterRight = await spriteCenter(page);
  expect(Math.abs(afterRight.x - right.x)).toBeLessThan(4);

  // Shift into the oncoming lane, then cross another tile. It must not snap east.
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await spriteCenter(page)).x, { timeout: 2000 }).toBeLessThan(544);
  const left = await spriteCenter(page);

  await page.keyboard.press('g');
  await expect.poll(async () => (await spriteCenter(page)).y, { timeout: 8000 }).toBeLessThan(left.y - 70);
  await page.keyboard.press('s');
  const afterLeft = await spriteCenter(page);
  expect(Math.abs(afterLeft.x - left.x)).toBeLessThan(4);
  expect(afterLeft.x).toBeLessThan(544);
});
