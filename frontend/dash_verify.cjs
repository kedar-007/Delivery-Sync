const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('http://localhost:3000/app/index.html#/dsv-corp/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  await page.screenshot({ path: '/tmp/dash_s1.png' });
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/dash_s2.png' });
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/dash_s3.png' });
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/dash_s4.png' });

  const bodyText = await page.locator('body').innerText();
  console.log('=== VISIBLE TEXT (first 4000 chars) ===\n' + bodyText.substring(0,4000));
  console.log('\n=== ERRORS ===\n' + (errors.length ? errors.slice(0,10).join('\n') : 'none'));

  await browser.close();
}
run().catch(e => { console.error(e.message); process.exit(1); });
