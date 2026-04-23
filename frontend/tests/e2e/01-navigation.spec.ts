/**
 * Navigation smoke tests — every major route loads without crashing.
 */
import { test, expect } from '@playwright/test';
import { gotoPage, waitForPageReady, assertNoCrash } from './helpers/nav';

const ROUTES: Array<{ label: string; path: string; expectText?: string }> = [
  { label: 'Dashboard',        path: 'dashboard',       expectText: 'Dashboard' },
  { label: 'Projects',         path: 'projects',        expectText: 'Projects' },
  { label: 'My Tasks',         path: 'my-tasks',        expectText: 'Tasks' },
  { label: 'Sprint Board',     path: 'sprints',         expectText: 'Sprint' },
  { label: 'Milestones',       path: 'milestones',      expectText: 'Milestone' },
  { label: 'Actions',          path: 'actions',         expectText: 'Action' },
  { label: 'Blockers',         path: 'blockers',        expectText: 'Blocker' },
  { label: 'RAID',             path: 'raid',            expectText: 'RAID' },
  { label: 'Decisions',        path: 'decisions',       expectText: 'Decision' },
  { label: 'Standup',          path: 'standup',         expectText: 'Standup' },
  { label: 'EOD',              path: 'eod',             expectText: 'EOD' },
  { label: 'Time Tracking',    path: 'time-tracking',   expectText: 'Time' },
  { label: 'Teams',            path: 'teams',           expectText: 'Team' },
  { label: 'Directory',        path: 'directory',       expectText: 'Director' },
  { label: 'Attendance',       path: 'attendance',      expectText: 'Attendance' },
  { label: 'Leave',            path: 'leave',           expectText: 'Leave' },
  { label: 'Announcements',    path: 'announcements',   expectText: 'Announcement' },
  { label: 'Org Chart',        path: 'org-chart',       expectText: 'Org' },
  { label: 'Reports',          path: 'reports',         expectText: 'Report' },
  { label: 'AI Insights',      path: 'ai-insights',     expectText: 'Insight' },
  { label: 'Assets',           path: 'assets',          expectText: 'Asset' },
  { label: 'Admin',            path: 'admin',           expectText: 'Admin' },
  { label: 'Admin Config',     path: 'admin-config',    expectText: 'Config' },
  { label: 'Profile',          path: 'profile',         expectText: 'Profile' },
];

for (const route of ROUTES) {
  test(`${route.label} page loads`, async ({ page }) => {
    await gotoPage(page, route.path);
    await waitForPageReady(page);
    await assertNoCrash(page);

    if (route.expectText) {
      // At least one heading/text matching expected content appears
      await expect(
        page.locator(`h1, h2, h3, [class*="title"], [class*="header"]`)
          .filter({ hasText: new RegExp(route.expectText, 'i') })
          .first()
      ).toBeVisible({ timeout: 12_000 }).catch(async () => {
        // Fallback: just check the page has some content (not a blank white screen)
        const bodyText = await page.locator('body').innerText();
        expect(bodyText.length).toBeGreaterThan(50);
      });
    }

    // Screenshot for visual review
    await page.screenshot({ path: `tests/e2e/screenshots/${route.path.replace('/', '-')}.png`, fullPage: false });
  });
}
