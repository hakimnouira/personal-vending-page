import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  page.on('response', res => {
    if (!res.ok()) {
      console.log('HTTP', res.status(), res.url());
    }
  });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const spreadHtml = await page.evaluate(() => {
    const el = document.getElementById('catalogue-spread-wrap');
    return el ? el.innerHTML : 'NULL';
  });
  console.log('Content is:', spreadHtml);
  await browser.close();
}

run().catch(console.error);
