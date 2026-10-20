import { expect, test } from '@playwright/test';
import { createFreshRoom, openLobby } from './helpers';

test.describe('lobby and rooms', () => {
  test('anonymous lobby is shown without sign-in', async ({ page }) => {
    await openLobby(page);
    await expect(page.getByTestId('create-room-button')).toBeEnabled();
    await expect(page.getByTestId('join-room-button')).toBeDisabled();
    await expect(page.getByText(/google|sign in|sign-in/i)).toHaveCount(0);
  });

  test('create room enters the city as an anonymous user', async ({ page }) => {
    const roomCode = await createFreshRoom(page);

    await expect(page.getByTestId('app-title')).toHaveText('Grid City');
    await expect(page.getByTestId('app-version')).toHaveText(/^v\d/);
    expect(roomCode).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/i);

    await expect(page.getByRole('button', { name: 'Roads', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rails', exact: true })).toBeVisible();
  });

  test('join stays disabled until a room code is typed', async ({ page }) => {
    await openLobby(page);
    const join = page.getByTestId('join-room-button');
    await expect(join).toBeDisabled();
    await page.getByTestId('join-room-input').fill('TEST');
    await expect(join).toBeEnabled();
  });
});
