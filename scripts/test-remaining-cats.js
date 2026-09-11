import { chromium } from 'playwright';

async function testRemaining() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.product-card', { timeout: 10000 });

  const cats = [
    { selector: '.category-pill[data-category="Bundles"]', name: '🎁 Packs & Duos' },
    { selector: '.category-pill[data-category="Wellness"]', name: 'Bien-être' },
    { selector: '.category-pill[data-category="Haircare"]', name: 'Soins capillaires' }
  ];

  for (const cat of cats) {
    console.log(`\n================ Testing Category: ${cat.name} ================`);
    await page.click(cat.selector);
    await page.waitForTimeout(600);

    const products = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#product-grid .product-card'));
      return cards.map(c => {
        const title = c.querySelector('.product-title')?.textContent.trim();
        const promoBadge = c.querySelector('.promo-badge')?.textContent.trim();
        let discountNum = 0;
        if (promoBadge) {
          const match = promoBadge.match(/-(\d+)%/);
          if (match) discountNum = parseInt(match[1], 10);
        }
        return { title, discountNum, badge: promoBadge || '0%' };
      });
    });

    console.log(`Total items displayed: ${products.length}`);
    products.slice(0, 3).forEach((p, idx) => {
      console.log(`  ${idx + 1}. [${p.badge}] - ${p.title}`);
    });

    let isDescending = true;
    for (let i = 0; i < products.length - 1; i++) {
      if (products[i].discountNum < products[i + 1].discountNum) {
        isDescending = false;
        break;
      }
    }
    console.log(`  => Strictly Descending Discount Order: ${isDescending ? '✅ YES' : '❌ NO'}`);
  }

  await browser.close();
}

testRemaining().catch(console.error);
