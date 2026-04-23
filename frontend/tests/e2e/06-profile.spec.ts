/**
 * Profile page tests — org role badge visible, system role badge gone, avatar present.
 */
import { test, expect } from '@playwright/test';
import { gotoPage, waitForPageReady, assertNoCrash } from './helpers/nav';

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPage(page, 'profile');
    await waitForPageReady(page);
  });

  test('profile page loads without crash', async ({ page }) => {
    await assertNoCrash(page);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('user name is visible', async ({ page }) => {
    // Name appears as a heading or large text near the top
    const name = page.locator('h1, h2, h3').first();
    await expect(name).toBeVisible({ timeout: 8_000 });
    const text = await name.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('org role badge is visible (e.g. Frontend Engineer)', async ({ page }) => {
    // Org role badge — rendered as a coloured pill/badge near the user's name
    // It could be text like "Frontend Engineer", "Software Engineer", etc.
    const badge = page.locator('[class*="badge"], [class*="Badge"], [class*="pill"], [class*="rounded-full"]').first();
    await expect(badge).toBeVisible({ timeout: 8_000 });
  });

  test('no gradient system role badge (Catalyst auth role removed)', async ({ page }) => {
    // The removed badge used a bg-gradient-to-r class with a Catalyst system role string
    // It should NOT be present any more
    const gradientSystemBadge = page.locator('[class*="bg-gradient"][class*="text-white"]').first();
    // It's acceptable if this element doesn't exist at all
    const exists = await gradientSystemBadge.count();
    if (exists > 0) {
      // If it does exist, it should not contain a system role like "DELIVERY LEAD", "TEAM MEMBER" etc.
      const text = await gradientSystemBadge.innerText().catch(() => '');
      const systemRoles = ['TEAM MEMBER', 'DELIVERY LEAD', 'TENANT ADMIN', 'TEAM_MEMBER', 'TENANT_ADMIN'];
      for (const role of systemRoles) {
        expect(text).not.toContain(role);
      }
    }
  });

  test('profile photo or avatar is visible', async ({ page }) => {
    // Profile photo renders as an <img> element near the top of the page
    const avatar = page.locator('img').first();
    await expect(avatar).toBeVisible({ timeout: 8_000 });
  });

  test('profile has editable Full Name field', async ({ page }) => {
    const nameInput = page.locator('input[value], input[placeholder*="name" i], input[placeholder*="Name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 8_000 });
  });
});
