/**
 * Admin page tests — user list, deactivate/activate flow, custom confirm dialogs.
 */
import { test, expect } from '@playwright/test';
import { gotoPage, waitForPageReady, assertNoCrash } from './helpers/nav';

const DIALOG = '[role="dialog"]';

function trapNativeDialog(page: import('@playwright/test').Page) {
  let fired = false;
  page.on('dialog', async (d) => { fired = true; await d.dismiss(); });
  return () => fired;
}

test.describe('Admin - User Management', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPage(page, 'admin');
    await waitForPageReady(page);
  });

  test('admin page loads without crash', async ({ page }) => {
    await assertNoCrash(page);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('user list renders rows', async ({ page }) => {
    // Table body rows (skip header row)
    const rows = page.locator('tbody tr, [class*="user-row"]');
    const empty = page.locator('text=/no users|empty/i');
    const hasRows  = await rows.first().isVisible({ timeout: 8_000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasRows || hasEmpty).toBeTruthy();
  });

  test('deactivate button opens custom ConfirmDialog (not native)', async ({ page }) => {
    const nativeFired = trapNativeDialog(page);

    const deactivateBtn = page.locator('button:has-text("Deactivate")').first();
    if (await deactivateBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await deactivateBtn.click();

      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 6_000 });
      expect(nativeFired()).toBeFalsy();

      // Dialog should show the title and Cancel button
      await expect(modal.locator('h2')).toBeVisible();
      await expect(modal.locator('button:has-text("Cancel")')).toBeVisible();

      // Escape closes it
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden({ timeout: 3_000 });
    } else {
      test.skip(true, 'No active users to deactivate');
    }
  });

  test('activate button shows custom ConfirmDialog for inactive users', async ({ page }) => {
    const nativeFired = trapNativeDialog(page);

    const activateBtn = page.locator('button:has-text("Activate")').first();
    if (await activateBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await activateBtn.click();

      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 6_000 });
      expect(nativeFired()).toBeFalsy();

      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).toBeHidden({ timeout: 3_000 });
    } else {
      test.skip(true, 'No inactive users visible');
    }
  });

  test('Edit Roles opens a modal', async ({ page }) => {
    // Edit button is typically an icon button in the actions column
    const editBtn = page.locator('button[title="Edit roles"], button[title="Edit"], button[aria-label*="edit" i]').first();
    if (await editBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await editBtn.click();
      await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 5_000 });
      await page.locator('button:has-text("Cancel")').first().click();
    } else {
      test.skip(true, 'No edit button visible');
    }
  });
});

test.describe('Admin Config', () => {
  test('admin config page loads', async ({ page }) => {
    await gotoPage(page, 'admin-config');
    await waitForPageReady(page);
    await assertNoCrash(page);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('sidebar tabs are clickable', async ({ page }) => {
    await gotoPage(page, 'admin-config');
    await waitForPageReady(page);

    // Left nav items like "Workflows", "Feature Flags" etc.
    const tabs = page.locator('nav li button, [class*="tab"] button, aside button').first();
    if (await tabs.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await tabs.click();
      await assertNoCrash(page);
    }
  });

  test('Seed Demo Data button shows custom confirm dialog', async ({ page }) => {
    // The Seed Demo Data button lives on admin-config page — do NOT navigate away
    await gotoPage(page, 'admin-config');
    await waitForPageReady(page);
    const nativeFired = trapNativeDialog(page);

    // Scroll down to find the Seed Demo Data button (specific text from AdminConfigPage)
    const seedBtn = page.locator('button:has-text("Seed Demo"), button:has-text("Seed Demo Data")').first();
    if (await seedBtn.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await seedBtn.scrollIntoViewIfNeeded();
      await seedBtn.click();

      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
      expect(nativeFired()).toBeFalsy();

      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).toBeHidden({ timeout: 3_000 });
    } else {
      test.skip(true, 'Seed Demo button not visible on admin-config page');
    }
  });
});
