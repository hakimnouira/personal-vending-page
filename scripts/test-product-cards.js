import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('[LOG]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.app && window.app.products && window.app.products.length > 0, { timeout: 15000 });
  await page.waitForTimeout(1000);
  const cardCount = await page.evaluate(() => document.querySelectorAll('.product-card').length);
  console.log('Final product-card count:', cardCount);
  await browser.close();
}

run().catch(console.error);
