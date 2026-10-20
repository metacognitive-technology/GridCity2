import { expect, test } from '@playwright/test';
import { APP_VERSION, formatAppVersion } from '../src/version';

test.describe('app version', () => {
  test('starts at v1 and formats tenths', () => {
    expect(formatAppVersion('1.0')).toBe('v1');
    expect(formatAppVersion('1')).toBe('v1');
    expect(formatAppVersion('1.1')).toBe('v1.1');
    expect(formatAppVersion('2.0')).toBe('v2');
    expect(formatAppVersion(APP_VERSION)).toMatch(/^v\d/);
  });
});
