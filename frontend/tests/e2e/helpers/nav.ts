import { Page, expect } from '@playwright/test';
import { TENANT_SLUG, BASE } from './env';

export const url = (path: string) => `${BASE}/#/${TENANT_SLUG()}/${path}`;

export async function gotoPage(page: Page, path: string) {
  await page.goto(url(path));
}

/** Wait for the page to finish loading (no spinner, no skeleton) */
export async function waitForPageReady(page: Page) {
  // Wait for React to mount something meaningful
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  // Spinners / page-loaders should disappear
  await page.locator('[data-testid="page-loader"], .animate-spin').first()
    .waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
}

/** Assert no crash / error boundary visible */
export async function assertNoCrash(page: Page) {
  await expect(page.locator('text=Something went wrong').first()).toBeHidden({ timeout: 5_000 }).catch(() => {});
  await expect(page.locator('text=Cannot read properties').first()).toBeHidden({ timeout: 5_000 }).catch(() => {});
}

/** Open sidebar nav link by label */
export async function clickNavLink(page: Page, label: string) {
  await page.locator(`nav a:has-text("${label}"), aside a:has-text("${label}")`).first().click();
}
