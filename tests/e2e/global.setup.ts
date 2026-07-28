import { test as setup, expect } from '@playwright/test';
import fs from 'fs';

const users = ['seller', 'buyer', 'affiliate'];

for (const user of users) {
  setup(`authenticate as ${user}`, async ({ page }) => {
    // Check if auth file already exists
    const authFile = `tests/.auth/${user}.json`;
    if (fs.existsSync(authFile)) {
      return;
    }

    const email = `${user}-${Date.now()}@test.dev`;
    const password = 'testpassword123';

    await page.goto('/auth/signup');
    await page.fill('input[type="text"], input[name="name"]', `${user} name`);
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"]', password);
    
    // There might be a confirm password or other fields, let's just try to submit
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard or somewhere authenticated
    await page.waitForURL('**/dashboard**');

    // Save state
    await page.context().storageState({ path: authFile });
    
    // We also want to save the email so specs can use it if they need to reference the user
    fs.writeFileSync(`tests/.auth/${user}-email.txt`, email);
  });
}
