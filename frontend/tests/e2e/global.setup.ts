import { test as setup } from '@playwright/test';
import path from 'path';
import { TEST_EMAIL, TEST_PASS, TENANT_SLUG, BASE } from './helpers/env';

const AUTH_FILE = path.join(__dirname, '.auth/session.json');

setup('authenticate', async ({ page }) => {
  const email    = TEST_EMAIL();
  const password = TEST_PASS();
  const tenant   = TENANT_SLUG();

  await page.goto(`${BASE}/#/login`);
  await page.locator('#loginDivElementId').waitFor({ state: 'visible', timeout: 20_000 });

  // Give Catalyst SDK time to fully render the iframe content
  await page.waitForTimeout(3000);

  const frame = page.frameLocator('#loginDivElementId iframe').first();

  // ── Step 1: Fill email and submit with Enter ──────────────────────────────
  const emailInput = frame.locator(
    '#emailcheck, input[name="EMAILCHECK"], input[placeholder*="email" i], input[type="text"]'
  ).first();

  await emailInput.waitFor({ state: 'attached', timeout: 12_000 });
  await emailInput.click({ force: true });
  await emailInput.fill(email, { force: true } as any);
  console.log(`Filled email: ${email}`);

  // Press Enter to go to step 2 (more reliable than clicking NEXT button)
  await emailInput.press('Enter');
  console.log('Pressed Enter on email field');

  // Wait for transition to password step
  await page.waitForTimeout(2000);

  // ── Step 2: Fill password and submit with Enter ───────────────────────────
  const passwordInput = frame.locator('input[type="password"]').first();
  await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
  await passwordInput.fill(password, { force: true } as any);
  console.log('Filled password');

  await passwordInput.press('Enter');
  console.log('Pressed Enter to submit login');

  // ── Wait for redirect to dashboard ───────────────────────────────────────
  await page.waitForURL(new RegExp(`/${tenant}/dashboard`), { timeout: 30_000 });
  console.log(`✅ Landed on: ${page.url()}`);

  await page.context().storageState({ path: AUTH_FILE });
  console.log(`✅ Auth saved to ${AUTH_FILE}`);
});
