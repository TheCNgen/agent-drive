import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../../app/lib/config';

test.use({ storageState: 'tests/.auth/seller.json' });

test.describe('Phase 1: Storage (GCS)', () => {
  const bucketName = config.gcs.bucketName;
  const testFileName = 'storage_test_file.txt';
  const testFilePath = path.join('tests/fixtures', testFileName);

  test.beforeAll(() => {
    if (!fs.existsSync('tests/fixtures')) {
      fs.mkdirSync('tests/fixtures', { recursive: true });
    }
    fs.writeFileSync(testFilePath, 'Hello GCS World!');
  });

  test('upload -> list -> download -> delete', async ({ page, request }) => {
    // 1. Upload
    await page.goto('/dashboard');
    // Assuming there is an input type="file" on the dashboard or an "upload" button that opens a dialog.
    // The existing UI for CashDrive v1 has a file input. Let's find it.
    // Let's assume the button has text "Upload" or input type file is present
    
    // Instead of guessing the exact UI of CashDrive v1, let's look for input[type="file"]
    // Or we can just use the API if the UI is too complex, but the prompt says:
    // "upload via setInputFiles() -> file appears in the folder listing -> download link resolves 200 with the right content-type -> delete removes it"
    
    // We'll wait for network idle to ensure dashboard is loaded
    await page.waitForLoadState('networkidle');

    // Click on the Upload button in the FileExplorer to open the modal
    await page.click('button:has-text("Upload")');
    
    // Wait for the file input in the modal to appear and set the file
    await page.setInputFiles('input[type="file"]', testFilePath);
    
    // Click the submit "Upload" button inside the modal
    await page.click('.fixed button:has-text("Upload")');

    // Wait for it to appear in the UI.
    // Usually there's a div containing the file name
    const fileItem = page.getByText(testFileName, { exact: true });
    await expect(fileItem).toBeVisible({ timeout: 15000 });

    // 2. Check GCS bucket using gcloud CLI
    const gcloudLs = execSync(`gcloud storage ls -r gs://${bucketName}/uploads/`).toString();
    // gcloud ls should show the file in the bucket
    expect(gcloudLs).toContain(testFileName);
    
    // Check region explicitly
    const gcloudInfo = execSync(`gcloud storage buckets describe gs://${bucketName} --format="json"`).toString();
    const bucketInfo = JSON.parse(gcloudInfo);
    expect(bucketInfo.location).toBe('EUROPE-WEST1');

    // 3. Download
    // Click on the file item to open the FileViewerModal
    await fileItem.click();
    
    // In the FileViewerModal, our file is a text file, so it should render in an iframe
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 10000 });
    const fileUrl = await iframe.getAttribute('src');
    
    // Fetch the URL and verify 200
    const response = await request.get(fileUrl!);
    expect(response.status()).toBe(200);
    // Note: Since this is GCS directly, content-type is set during upload
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/plain');
    
    // Check content
    const downloadedContent = (await response.body()).toString('utf-8');
    expect(downloadedContent).toBe('Hello GCS World!');
    
    // Close modal
    await page.locator('button[title="Close"]').click();

    // 4. Delete
    // Hover to show buttons
    await fileItem.hover();
    // Click delete button
    await page.locator(`button[title^="Delete ${testFileName}"]`).click();
    
    // Wait for confirmation if there is one
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    // Wait for it to disappear
    await expect(fileItem).toBeHidden();

    // 5. Confirm deletion with gcloud CLI
    const gcloudLsAfter = execSync(`gcloud storage ls -r gs://${bucketName}/uploads/ || true`).toString();
    expect(gcloudLsAfter).not.toContain(testFileName);
  });
});
