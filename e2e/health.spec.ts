import { expect, test } from '@playwright/test';

test.describe('health', () => {
  test('GET /health reports ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.ok()).toBeTruthy();
    await expect(res.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'gridcity',
    });
  });

  test('GET /api/health reports ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' });
  });
});
