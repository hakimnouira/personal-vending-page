import { chromium } from 'playwright';

async function snap() {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const promo = await page.$('#promo-showcase-section');
  if (promo) {
    await promo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await promo.screenshot({ path: 'C:/Users/chokri/.gemini/antigravity/brain/39207a54-583a-4441-9f05-721e6aea4d12/client_deals_showcase_restored.png' });
    console.log('Client deals screenshot saved successfully');
  }
  await b.close();
}

snap().catch(console.error);
