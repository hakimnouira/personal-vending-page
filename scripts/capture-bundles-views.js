import { chromium } from 'playwright';

async function capture() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--ignore-certificate-errors', '--allow-insecure-localhost']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  
  // 1. Client Section
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const bundlesSec = await page.$('#bundles-showcase-section');
  if (bundlesSec) {
    await bundlesSec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await bundlesSec.screenshot({ path: 'assets/screenshots/client_bundles_section.png' });
    console.log('Client section screenshot saved: assets/screenshots/client_bundles_section.png');
  }

  // 2. Admin Section
  await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
  const pwd = await page.$('#admin-pwd-input');
  if (pwd && await pwd.isVisible()) {
    await page.fill('#admin-pwd-input', 'mouna2024');
    await page.click('#admin-login-form button[type="submit"]');
    await page.waitForSelector('#admin-dashboard-view', { state: 'visible', timeout: 10000 });
  }
  await page.click('.nav-item[data-target="section-bundles"]');
  await page.waitForSelector('#section-bundles.active', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(500);
  
  const grid = await page.$('#admin-bundles-grid');
  if (grid) {
    await grid.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await grid.screenshot({ path: 'assets/screenshots/admin_bundles_grid.png' });
    console.log('Admin grid screenshot saved: assets/screenshots/admin_bundles_grid.png');
  }

  await browser.close();
}

capture().catch(console.error);
