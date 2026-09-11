import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.app && Array.isArray(window.app.products) && window.app.products.length > 0, { timeout: 20000 });
  await page.waitForTimeout(500);
  const cardsCount = await page.$$eval('.product-card', els => els.length);
  console.log('Cards count on 390x844 after products ready:', cardsCount);
  await browser.close();
}

run().catch(console.error);
