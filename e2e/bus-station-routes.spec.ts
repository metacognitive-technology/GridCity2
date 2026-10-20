import { expect, test, type Page } from '@playwright/test';
import { createFreshRoom } from './helpers';

async function clickCell(page: Page, x: number, y: number) {
  const map = page.getByTestId('map-viewport');
  await map.click({ position: { x: (x + 0.5) * 64, y: (y + 0.5) * 64 } });
}

test('station routes can be defined and assigned per bus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createFreshRoom(page);

  await page.getByTitle('Bus Stop (2-Lane)').click();
  await clickCell(page, 6, 1);
  await clickCell(page, 8, 1);
  await clickCell(page, 7, 1);

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByTitle('Bus Station (2×2, 2 bays)').click();
  await clickCell(page, 6, 3);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await clickCell(page, 6, 3);

  const panel = page.getByTestId('bus-station-panel');
  await expect(panel).toBeVisible();

  await page.getByTestId('bus-route-add').click();
  const name = page.getByTestId('bus-route-name');
  await expect(name).toHaveValue('Route 1');
  await name.fill('Downtown');
  await name.press('Enter');
  await expect(page.getByTestId('bus-route-list')).toContainText('Downtown');

  await page.getByTestId('bus-route-add-stops').click();
  await expect(page.getByTestId('bus-route-banner')).toContainText('Downtown');
  await clickCell(page, 6, 1);
  await clickCell(page, 8, 1);
  await expect(page.getByTestId('bus-route-stops')).toContainText('6,1');
  await expect(page.getByTestId('bus-route-stops')).toContainText('8,1');
  const line = page.getByTestId('bus-route-overlay-line');
  await expect(line).toBeVisible();
  await expect(page.locator('[data-route-seg]')).toHaveCount(4);
  const lineBox = await line.boundingBox();
  expect(lineBox).not.toBeNull();
  expect(Math.max(lineBox!.width, lineBox!.height)).toBeGreaterThan(40);
  expect(Math.min(lineBox!.width, lineBox!.height)).toBeGreaterThanOrEqual(10);
  await expect(line).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  await expect(page.getByTestId('bus-route-stop-num-0')).toHaveText('1');
  await expect(page.getByTestId('bus-route-stop-num-1')).toHaveText('2');

  await page.getByTestId('bus-route-add').click();
  await expect(name).toHaveValue('Route 2');
  await name.fill('Uptown');
  await name.press('Enter');
  await expect(page.getByTestId('bus-route-list')).toContainText('Uptown');
  await page.getByTestId('bus-route-add-stops').click();
  await expect(page.getByTestId('bus-route-banner')).toContainText('Uptown');
  await clickCell(page, 7, 1);
  await expect(page.getByTestId('bus-route-stops')).toContainText('7,1');
  await expect(page.getByTestId('bus-route-stops')).not.toContainText('6,1');
  await expect(page.getByTestId('bus-route-stop-num-0')).toHaveText('1');
  await expect(page.getByTestId('bus-route-stop-num-1')).toHaveCount(0);
  await expect(page.locator('[data-route-seg]')).toHaveCount(0);

  await page.getByTestId('bus-fleet-add').click();
  await page.getByTestId('bus-fleet-add').click();
  const selects = page.locator('[data-testid^="bus-route-select-"]');
  await expect(selects).toHaveCount(2);

  await selects.nth(0).selectOption({ label: 'Downtown (2 stops)' });
  await selects.nth(1).selectOption({ label: 'Uptown (1 stop)' });

  const starts = page.locator('[data-testid^="bus-start-"]');
  await starts.nth(0).click();
  await starts.nth(1).click();

  const statuses = page.locator('[data-testid^="bus-status-"]');
  await expect(statuses.nth(0)).toContainText('Downtown');
  await expect(statuses.nth(0)).toContainText('route');
  await expect(statuses.nth(1)).toContainText('Uptown');
  await expect(statuses.nth(1)).toContainText('route');
  await expect(statuses.nth(0)).not.toContainText('Uptown');
  await expect(statuses.nth(1)).not.toContainText('Downtown');

  // Deleting Uptown releases only that bus.
  await page.getByTestId('bus-route-list').getByRole('button', { name: /Uptown/ }).click();
  await page.getByTestId('bus-route-delete').click();
  await expect(page.getByTestId('bus-route-list')).not.toContainText('Uptown');
  await expect(statuses.nth(0)).toContainText('Downtown');
  await expect(statuses.nth(1)).toContainText('No route');
  await expect(statuses.nth(1)).toContainText('Idle');
  await expect(page.getByTestId('bus-route-stop-num-0')).toHaveText('1');
  await expect(page.getByTestId('bus-route-stop-num-1')).toHaveText('2');
  await expect(page.locator('[data-route-seg]')).toHaveCount(4);

  // Narrow viewport: the route controls stay on screen.
  await page.setViewportSize({ width: 390, height: 844 });
  const add = page.getByTestId('bus-route-add');
  await expect(add).toBeVisible();
  const box = await add.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
});
