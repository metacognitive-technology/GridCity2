import { expect, test } from '@playwright/test';
import { createFreshRoom } from './helpers';

async function placeHomeAndPopulate(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByTitle('Home').click();
  const canvas = page.locator('.flex-1.relative').first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + 96, box!.y + 96);
  await page.getByTitle('People & Families').click();
  const panel = page.getByTestId('people-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Populate houses' }).click();
  await expect(page.locator('[data-person-row]').first()).toBeVisible();
  return panel;
}

test.describe('people panel', () => {
  test('control selected people is a compact icon row and the list can grow', async ({ page }) => {
    await createFreshRoom(page);
    await page.getByTitle('People & Families').click();

    const panel = page.getByTestId('people-panel');
    await expect(panel).toBeVisible();

    const bar = page.getByTestId('people-control-bar');
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('people-control-assign-work')).toBeVisible();
    await expect(page.getByTestId('people-control-go-work')).toBeVisible();
    await expect(page.getByTestId('people-control-send-home')).toBeVisible();
    await expect(page.getByText('Control selected people')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Board as driver' })).toHaveCount(0);

    const list = page.getByTestId('people-list');
    await expect(list).toBeVisible();
    const box = await list.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(120);
  });

  test('right tool menu and people panel stay pinned to the viewport right edge after panning', async ({ page }) => {
    await createFreshRoom(page);

    const menu = page.getByTestId('right-tool-menu');
    await expect(menu).toBeVisible();

    const viewport = page.viewportSize()!;
    const menuBefore = await menu.boundingBox();
    expect(menuBefore).toBeTruthy();
    expect(menuBefore!.x + menuBefore!.width).toBeGreaterThan(viewport.width - 80);

    const canvas = page.locator('.flex-1.relative').first();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    await page.mouse.move(canvasBox!.x + 180, canvasBox!.y + 180);
    await page.mouse.down();
    await page.mouse.move(canvasBox!.x + 480, canvasBox!.y + 320, { steps: 8 });
    await page.mouse.up();

    await page.getByTitle('People & Families').click();
    const panel = page.getByTestId('people-panel');
    await expect(panel).toBeVisible();

    const panelBox = await panel.boundingBox();
    expect(panelBox).toBeTruthy();
    expect(panelBox!.y).toBeGreaterThanOrEqual(-1);
    expect(panelBox!.x + panelBox!.width).toBeGreaterThan(viewport.width - 8);
    expect(panelBox!.x).toBeGreaterThan(viewport.width / 2);

    const menuAfter = await menu.boundingBox();
    expect(menuAfter).toBeTruthy();
    expect(menuAfter!.x + menuAfter!.width).toBeGreaterThan(viewport.width - 80);
    expect(menuAfter!.y).toBeGreaterThan(viewport.height / 3);
  });

  test('travel preference applies to selected people and the person panel', async ({ page }) => {
    await createFreshRoom(page);
    const panel = await placeHomeAndPopulate(page);

    await expect(panel.getByTestId('travel-pref-bus')).toBeDisabled();
    await page.locator('[data-person-row]').first().locator('input[type=checkbox]').check();
    await panel.getByTestId('people-travel-preference').getByText('Bus', { exact: true }).click();

    await expect(page.locator('[data-person-row]').first()).toContainText('Bus');

    await page.locator('[data-person-row]').first().locator('button').first().click();
    const personPanel = page.locator('.fixed').filter({ has: page.getByTestId('person-go-home') });
    await expect(personPanel.getByTestId('travel-pref-bus')).toBeChecked();

    await personPanel.getByText('Walk', { exact: true }).click();
    await expect(page.locator('[data-person-row]').first()).toContainText('Walk');
    await expect(panel.getByTestId('travel-pref-walk')).toBeChecked();

    await page.setViewportSize({ width: 390, height: 800 });
    const travel = panel.getByTestId('people-travel-preference');
    await expect(travel).toBeVisible();
    const travelBox = await travel.boundingBox();
    expect(travelBox).toBeTruthy();
    expect(travelBox!.height).toBeGreaterThan(28);
    await expect(personPanel.getByText('Walk', { exact: true })).toBeVisible();
  });
});

test('cul-de-sac tile is on the road palette', async ({ page }) => {
  await createFreshRoom(page);
  await page.getByRole('button', { name: 'Roads', exact: true }).click();
  await expect(page.getByTitle('Cul-de-sac')).toBeVisible();
});
