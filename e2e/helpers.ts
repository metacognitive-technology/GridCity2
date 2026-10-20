import { expect, type Page } from '@playwright/test';

/** Open the app and wait for the anonymous lobby (no sign-in). */
export async function openLobby(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('lobby-dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grid City Collaborative' })).toBeVisible();
  await expect(page.getByTestId('lobby-version')).toHaveText(/^v\d/);
}

/** Create a new collaborative room and return its code. */
export async function createFreshRoom(page: Page): Promise<string> {
  await openLobby(page);
  await page.getByTestId('create-room-button').click();
  await expect(page.getByTestId('lobby-dialog')).toBeHidden();
  await expect(page.getByTestId('active-room')).toBeVisible();
  const roomCode = (await page.getByTestId('active-room-code').textContent())?.trim() ?? '';
  expect(roomCode.length).toBeGreaterThan(0);
  return roomCode;
}
