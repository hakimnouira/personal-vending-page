import { chromium } from 'playwright';

async function debugPage() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  const cardCount = await page.$$eval('.product-card', els => els.length);
  console.log('Product cards found:', cardCount);
  await browser.close();
}

debugPage().catch(console.error);
