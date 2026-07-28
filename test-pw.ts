import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

test('simple test', async ({ page }) => {
  await page.goto('http://localhost:3000');
  console.log(await page.title());
});
