/**
 * Projects tests — list, detail page, member management, RAG update.
 */
import { test, expect } from '@playwright/test';
import { gotoPage, waitForPageReady, assertNoCrash } from './helpers/nav';

const DIALOG = '[role="dialog"]';

test.describe('Projects', () => {
  test('project list loads', async ({ page }) => {
    await gotoPage(page, 'projects');
    await waitForPageReady(page);
    await assertNoCrash(page);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('project grid renders cards', async ({ page }) => {
    await gotoPage(page, 'projects');
    await waitForPageReady(page);

    // Projects render as grid items with links
    const projectLinks = page.locator('a[href*="/projects/"]');
    const emptyState   = page.locator('text=/no projects|empty|create your first/i').first();

    const hasItems = await projectLinks.first().isVisible({ timeout: 8_000 }).catch(() => false);
    const isEmpty  = await emptyState.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasItems || isEmpty).toBeTruthy();
  });

  test('clicking a project opens detail page', async ({ page }) => {
    await gotoPage(page, 'projects');
    await waitForPageReady(page);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await projectLink.click();
      await waitForPageReady(page);
      await assertNoCrash(page);
      expect(page.url()).toMatch(/\/projects\//);
    } else {
      test.skip(true, 'No projects in list');
    }
  });

  test('project detail shows Members and Open Actions stat tiles', async ({ page }) => {
    await gotoPage(page, 'projects');
    await waitForPageReady(page);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await projectLink.click();
      await waitForPageReady(page);

      // Stat tiles show labels like "Members", "Open Actions", "Milestones"
      await expect(page.locator('text=Members').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=/Open Actions|Open Blockers|Milestones/i').first()).toBeVisible({ timeout: 5_000 });
    } else {
      test.skip(true, 'No projects available');
    }
  });

  test('Update RAG modal opens and can be dismissed', async ({ page }) => {
    await gotoPage(page, 'projects');
    await waitForPageReady(page);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await projectLink.click();
      await waitForPageReady(page);

      const ragBtn = page.locator('button:has-text("Update RAG")').first();
      await expect(ragBtn).toBeVisible({ timeout: 8_000 });
      await ragBtn.click();

      // RAG uses the app's Modal component (not ConfirmDialog)
      const modal = page.locator('[role="dialog"], [class*="Modal"], [class*="modal"]').first();
      // Check that RAG status select and Cancel button are visible in the modal
      await expect(page.locator('select[name="rag_status"]')).toBeVisible({ timeout: 5_000 });
      await page.locator('button:has-text("Cancel")').first().click();
    } else {
      test.skip(true, 'No projects available');
    }
  });

  test('project sub-navigation links are all present', async ({ page }) => {
    await gotoPage(page, 'projects');
    await waitForPageReady(page);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await projectLink.click();
      await waitForPageReady(page);

      for (const label of ['Tasks', 'Sprint Board', 'Backlog', 'Actions', 'Blockers', 'Milestones']) {
        await expect(page.locator(`a:has-text("${label}")`).first()).toBeVisible({ timeout: 5_000 });
      }
    } else {
      test.skip(true, 'No projects available');
    }
  });

  test('Add Member modal opens', async ({ page }) => {
    await gotoPage(page, 'projects');
    await waitForPageReady(page);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await projectLink.click();
      await waitForPageReady(page);

      const addMemberBtn = page.locator('button:has-text("Add Member")').first();
      if (await addMemberBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await addMemberBtn.click();
        // The add member form should appear (Cancel button visible)
        await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 5_000 });
        await page.locator('button:has-text("Cancel")').first().click();
      }
    } else {
      test.skip(true, 'No projects available');
    }
  });
});
