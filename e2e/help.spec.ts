import { expect, test } from '@playwright/test';
import { createFreshRoom, openLobby } from './helpers';

test.describe('help documentation', () => {
  test('lobby help icon opens documentation in a new tab', async ({ page, context }) => {
    await openLobby(page);

    const popupPromise = context.waitForEvent('page');
    await page.getByTestId('lobby-help-button').click();
    const docs = await popupPromise;
    await docs.waitForLoadState('domcontentloaded');

    await expect(docs).toHaveURL(/\/help/);
    await expect(docs.getByTestId('help-page')).toBeVisible();
    await expect(docs.getByRole('heading', { name: 'Grid City Documentation' })).toBeVisible();
    await expect(docs.getByTestId('help-index')).toBeVisible();
    await expect(docs.getByRole('navigation', { name: 'Documentation index' })).toBeVisible();
  });

  test('title help icon in a room opens documentation in a new tab', async ({ page, context }) => {
    await createFreshRoom(page);

    await expect(page.getByTestId('app-title')).toHaveText('Grid City');
    await expect(page.getByTestId('help-button')).toBeVisible();

    const popupPromise = context.waitForEvent('page');
    await page.getByTestId('help-button').click();
    const docs = await popupPromise;
    await docs.waitForLoadState('domcontentloaded');

    await expect(docs).toHaveURL(/\/help/);
    await expect(docs.getByTestId('help-page')).toBeVisible();
  });

  test('documentation index hotlinks jump to matching sections', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByTestId('help-page')).toBeVisible();

    const index = page.getByTestId('help-index');
    await expect(index.getByRole('link', { name: 'Vehicles' })).toBeVisible();
    await expect(index.getByRole('link', { name: 'People & families' })).toBeVisible();
    await expect(index.getByRole('link', { name: 'Traffic control' })).toBeVisible();

    await index.getByRole('link', { name: 'Vehicles' }).click();
    await expect(page).toHaveURL(/#vehicles/);
    await expect(page.locator('#vehicles')).toBeInViewport();
    await expect(page.locator('#vehicles')).toHaveText(/Vehicles/);

    await index.getByRole('link', { name: 'City clock' }).click();
    await expect(page).toHaveURL(/#clock/);
    await expect(page.locator('#clock')).toBeInViewport();
  });
});
