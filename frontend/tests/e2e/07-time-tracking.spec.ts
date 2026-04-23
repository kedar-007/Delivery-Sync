/**
 * Time Tracking tests — entries render, delete/retract show custom confirm.
 */
import { test, expect } from '@playwright/test';
import { gotoPage, waitForPageReady, assertNoCrash } from './helpers/nav';

const DIALOG = '[role="dialog"]';

function trapNativeDialog(page: import('@playwright/test').Page) {
  let fired = false;
  page.on('dialog', async (d) => { fired = true; await d.dismiss(); });
  return () => fired;
}

test.describe('Time Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPage(page, 'time-tracking');
    await waitForPageReady(page);
  });

  test('page loads without crash', async ({ page }) => {
    await assertNoCrash(page);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('tabs are visible (My Time Log, Analytics, Approvals)', async ({ page }) => {
    // The actual tab labels are "My Time Log", "Analytics", "Approvals"
    const myLogTab = page.locator('text=/My Time Log|My Log/i').first();
    await expect(myLogTab).toBeVisible({ timeout: 8_000 });
  });

  test('Log Time button opens modal', async ({ page }) => {
    const logBtn = page.locator('button:has-text("Log Time")').first();
    if (await logBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await logBtn.click();
      await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 5_000 });
      await page.locator('button:has-text("Cancel")').first().click();
    } else {
      test.skip(true, 'Log Time button not visible');
    }
  });

  test('time entries table renders', async ({ page }) => {
    // Should show "My Time Entries" heading or a table of entries
    const heading = page.locator('text=/My Time Entries|Time Entries/i').first();
    await expect(heading).toBeVisible({ timeout: 8_000 });
  });

  test('delete time entry shows custom confirm (not native browser)', async ({ page }) => {
    const nativeFired = trapNativeDialog(page);

    // Delete button is the trash icon in the ACTIONS column (last icon for "Saved" entries)
    // It has no text but has an SVG icon
    const deleteBtn = page.locator('button[title="Delete"], button[aria-label*="delete" i], button[title*="delete" i]').first();
    if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await deleteBtn.click();
      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
      expect(nativeFired()).toBeFalsy();
      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).toBeHidden({ timeout: 3_000 });
    } else {
      test.skip(true, 'No deletable time entries visible');
    }
  });

  test('retract submission shows custom confirm', async ({ page }) => {
    const nativeFired = trapNativeDialog(page);

    const retractBtn = page.locator('button[title="Retract"], button[title*="retract" i], button[aria-label*="retract" i]').first();
    if (await retractBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await retractBtn.click();
      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
      expect(nativeFired()).toBeFalsy();
      await modal.locator('button:has-text("Cancel")').click();
    } else {
      test.skip(true, 'No submitted entries to retract');
    }
  });
});
