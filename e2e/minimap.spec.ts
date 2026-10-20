import { expect, test, type Page } from '@playwright/test';
import { createFreshRoom } from './helpers';

async function panMap(page: Page) {
  const canvas = page.locator('.flex-1.relative').first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + 180, box!.y + 180);
  await page.mouse.down();
  await page.mouse.move(box!.x + 420, box!.y + 300, { steps: 8 });
}

test.describe('overview minimap', () => {
  test('sits to the left of the right tool menu while panning', async ({ page }) => {
    await createFreshRoom(page);
    await panMap(page);

    const minimap = page.getByTestId('overview-minimap');
    const menu = page.getByTestId('right-tool-menu');
    await expect(minimap).toBeVisible();

    const mm = await minimap.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(mm).toBeTruthy();
    expect(menuBox).toBeTruthy();
    expect(mm!.x + mm!.width).toBeLessThanOrEqual(menuBox!.x + 1);

    await page.mouse.up();
  });

  test('sits to the left of an open right panel and is not covered', async ({ page }) => {
    await createFreshRoom(page);
    await page.getByTitle('People & Families').click();
    const panel = page.getByTestId('people-panel');
    await expect(panel).toBeVisible();

    await panMap(page);

    const minimap = page.getByTestId('overview-minimap');
    await expect(minimap).toBeVisible();

    const mm = await minimap.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(mm).toBeTruthy();
    expect(panelBox).toBeTruthy();
    expect(mm!.x + mm!.width).toBeLessThanOrEqual(panelBox!.x + 1);

    await page.mouse.up();
  });
});
