import { expect, test } from '@playwright/test';
import { createFreshRoom } from './helpers';

test.describe('person view', () => {
  test('indoor person view shows the building icon and Inside X,Y', async ({ page }) => {
    await createFreshRoom(page);

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

    const row = page.locator('[data-person-row]').first();
    await expect(row).toBeVisible();
    await row.click();

    await page.getByTestId('people-control-panel').click();
    await expect(page.getByTestId('person-view-indoor')).toBeVisible();
    await expect(page.getByTestId('person-view-indoor-label')).toHaveText(/^Inside -?\d+,-?\d+$/);
    await expect(page.getByTestId('person-view-indoor').locator('svg')).toBeVisible();
  });
});
