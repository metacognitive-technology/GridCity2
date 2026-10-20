import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFreshRoom } from './helpers';

async function clickCell(page: Page, x: number, y: number, fx = 0.5, fy = 0.5) {
  const map = page.getByTestId('map-viewport');
  await map.click({ position: { x: (x + fx) * 64, y: (y + fy) * 64 } });
}

function trafficPanel(page: Page): Locator {
  return page.locator('div.fixed').filter({
    has: page.getByRole('heading', { name: 'Traffic Control' }),
  });
}

test('stop sign and stoplight lists can select all of their own kind', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await createFreshRoom(page);

  await page.getByRole('button', { name: 'Roads', exact: true }).click();
  const cross = page.getByTitle('Crossroad', { exact: true });
  await cross.scrollIntoViewIfNeeded();
  await cross.click();
  await clickCell(page, 4, 4);
  await page.keyboard.press('Escape');

  await page.getByTitle('Traffic Control', { exact: true }).click();
  const panel = trafficPanel(page);
  await expect(panel).toBeVisible();

  const selectSigns = panel.getByRole('checkbox', { name: 'Select all stop signs' });
  const selectLights = panel.getByRole('checkbox', { name: 'Select all stoplights' });
  await expect(selectSigns).toBeDisabled();
  await expect(selectLights).toBeDisabled();

  await panel.getByRole('button', { name: '🛑 Stop Sign', exact: true }).click();
  await clickCell(page, 4, 4, 0.5, 0.1);
  await clickCell(page, 4, 4, 0.5, 0.9);
  await clickCell(page, 4, 4, 0.1, 0.5);
  await expect(panel.getByText('Sign #1')).toBeVisible();
  await expect(panel.getByText('Sign #2')).toBeVisible();
  await expect(panel.getByText('Sign #3')).toBeVisible();

  await panel.getByRole('button', { name: '🚦 Stoplight', exact: true }).click();
  await clickCell(page, 4, 4, 0.622, 0.0625);
  await clickCell(page, 4, 4, 0.378, 0.9375);
  await expect(panel.getByText('Light #1')).toBeVisible();
  await expect(panel.getByText('Light #2')).toBeVisible();

  const signRows = panel.getByRole('checkbox', { name: /Sign #/ });
  const lightRows = panel.getByRole('checkbox', { name: /Light #/ });
  await expect(signRows).toHaveCount(3);
  await expect(lightRows).toHaveCount(2);
  await expect(selectSigns).toBeEnabled();
  await expect(selectLights).toBeEnabled();

  await signRows.nth(0).check();
  await expect(selectSigns).not.toBeChecked();
  await selectSigns.check();
  await expect(signRows).toHaveCount(3);
  for (const box of await signRows.all()) await expect(box).toBeChecked();
  for (const box of await lightRows.all()) await expect(box).not.toBeChecked();
  await expect(selectLights).not.toBeChecked();

  await selectLights.check();
  for (const box of await lightRows.all()) await expect(box).toBeChecked();
  for (const box of await signRows.all()) await expect(box).toBeChecked();

  await selectSigns.uncheck();
  for (const box of await signRows.all()) await expect(box).not.toBeChecked();
  for (const box of await lightRows.all()) await expect(box).toBeChecked();

  await selectSigns.check();
  await panel.getByTitle('Delete selected stop signs', { exact: true }).click();
  await expect(panel.getByText('No stop signs placed')).toBeVisible();
  await expect(selectSigns).toBeDisabled();
  await expect(panel.getByText('Light #1')).toBeVisible();
  await expect(panel.getByText('Light #2')).toBeVisible();
  for (const box of await lightRows.all()) await expect(box).toBeChecked();
  await expect(selectLights).toBeChecked();
});
