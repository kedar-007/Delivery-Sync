/**
 * Dashboard tests — stat cards, project list, quick links all render.
 */
import { test, expect } from '@playwright/test';
import { gotoPage, waitForPageReady, assertNoCrash } from './helpers/nav';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPage(page, 'dashboard');
    await waitForPageReady(page);
  });

  test('renders without crash', async ({ page }) => {
    await assertNoCrash(page);
    await expect(page.locator('body')).toBeVisible();
  });

  test('shows stat tiles (Active Projects, Team Attendance etc.)', async ({ page }) => {
    // Stat tiles show labels like "Active Projects", "Team Attendance", "Critical Blockers"
    const statLabel = page.locator('text=/Active Projects|Team Attendance|Critical Blockers|Pending Approvals/i').first();
    await expect(statLabel).toBeVisible({ timeout: 12_000 });
  });

  test('page has visible header', async ({ page }) => {
    const header = page.locator('h1, h2').first();
    await expect(header).toBeVisible({ timeout: 10_000 });
    const text = await header.innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  test('no loading spinner stuck', async ({ page }) => {
    await page.waitForTimeout(2000);
    const spinner = page.locator('.animate-spin').first();
    await expect(spinner).toBeHidden({ timeout: 8_000 }).catch(() => {
      test.fail(true, 'Page still showing spinner after 10 seconds');
    });
  });

  test('Quick Actions section is visible', async ({ page }) => {
    const qa = page.locator('text=/Quick Actions/i').first();
    await expect(qa).toBeVisible({ timeout: 10_000 });
  });
});
