/**
 * Confirm Dialog tests — verify our custom ConfirmDialog replaced all window.confirm calls.
 * The ConfirmDialog renders with role="dialog". We also listen for native browser dialogs
 * and fail immediately if any appear.
 */
import { test, expect } from '@playwright/test';
import { gotoPage, waitForPageReady } from './helpers/nav';

const DIALOG = '[role="dialog"]';

test.describe('Custom ConfirmDialog (no native browser dialogs)', () => {
  function trapBrowserDialog(page: import('@playwright/test').Page) {
    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
      throw new Error(`Native browser dialog appeared: "${dialog.message()}". Must use custom ConfirmDialog.`);
    });
  }

  test('Admin page - deactivate user shows custom dialog', async ({ page }) => {
    trapBrowserDialog(page);
    await gotoPage(page, 'admin');
    await waitForPageReady(page);

    const deactivateBtn = page.locator('button:has-text("Deactivate")').first();
    if (await deactivateBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await deactivateBtn.click();

      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // Verify it's our custom dialog, not a native one
      await expect(modal.locator('h2')).toBeVisible();
      await expect(modal.locator('button:has-text("Cancel")')).toBeVisible();

      // Escape dismisses it
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden({ timeout: 3_000 });
    } else {
      test.skip(true, 'No active users to deactivate');
    }
  });

  test('My Tasks - delete task shows custom dialog', async ({ page }) => {
    trapBrowserDialog(page);
    await gotoPage(page, 'my-tasks');
    await waitForPageReady(page);

    // Delete button is a Trash2 icon button - look by title or svg
    const deleteBtn = page.locator('button[title="Delete"], button:has([data-lucide="trash-2"]), button:has(svg)').filter({ hasNOT: page.locator('text') }).first();

    // Fallback: look for any trash icon button
    const trashBtn = page.locator('button').filter({ has: page.locator('svg') }).last();

    const btn = await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false) ? deleteBtn : trashBtn;

    if (await btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await btn.click();
      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await expect(modal.locator('h2')).toBeVisible();
      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).toBeHidden({ timeout: 3_000 });
    } else {
      test.skip(true, 'No tasks visible');
    }
  });

  test('Admin Config - Seed Demo Data shows custom dialog', async ({ page }) => {
    trapBrowserDialog(page);
    await gotoPage(page, 'admin-config');
    await waitForPageReady(page);

    // The Seed button might be in a sub-section — scroll to find it
    const seedBtn = page.locator('button:has-text("Seed Demo"), button:has-text("Seed Data"), button:has-text("Seed")').first();

    if (await seedBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await seedBtn.scrollIntoViewIfNeeded();
      await seedBtn.click();

      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await expect(modal.locator('h2:has-text("Seed")')).toBeVisible();
      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).toBeHidden({ timeout: 3_000 });
    } else {
      test.skip(true, 'Seed button not visible');
    }
  });

  test('Confirm dialog has Cancel button and confirm action button', async ({ page }) => {
    trapBrowserDialog(page);
    await gotoPage(page, 'admin');
    await waitForPageReady(page);

    const deactivateBtn = page.locator('button:has-text("Deactivate")').first();
    if (await deactivateBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await deactivateBtn.click();

      const modal = page.locator(DIALOG).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // Must have Cancel and a colored confirm button
      await expect(modal.locator('button:has-text("Cancel")')).toBeVisible();
      await expect(modal.locator('button:has-text("Deactivate")')).toBeVisible();

      // Backdrop click dismisses
      await page.mouse.click(10, 10);
      await expect(modal).toBeHidden({ timeout: 3_000 });
    }
  });
});
