import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/.auth/seller.json' });

test('simple test', async ({ page }) => {
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');
  console.log(await page.content());
});
