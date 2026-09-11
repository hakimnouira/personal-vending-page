import { chromium } from 'playwright';

async function verifyOrder() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#catalogue-section', { timeout: 10000 });

  const order = await page.evaluate(() => {
    const promo = document.getElementById('promo-showcase-section');
    const bundles = document.getElementById('bundles-showcase-section');
    const catalogue = document.getElementById('catalogue-section');
    const controls = document.querySelector('.controls-section');

    const sections = [
      { id: 'promo-showcase-section', top: promo ? promo.getBoundingClientRect().top + window.scrollY : null },
      { id: 'bundles-showcase-section', top: bundles ? bundles.getBoundingClientRect().top + window.scrollY : null },
      { id: 'catalogue-section', top: catalogue ? catalogue.getBoundingClientRect().top + window.scrollY : null },
      { id: 'controls-section', top: controls ? controls.getBoundingClientRect().top + window.scrollY : null }
    ];

    return sections;
  });

  console.log('Section positions (top in px):');
  order.forEach(s => console.log(`  ${s.id}: ${Math.round(s.top)}px`));
  
  const isCorrect = order[0].top < order[2].top && order[2].top < order[3].top;
  console.log('Order correct (Promo -> Bundles -> Catalogue -> Controls):', isCorrect);

  await browser.close();
}

verifyOrder().catch(console.error);
