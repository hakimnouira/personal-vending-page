import { chromium } from 'playwright';

async function testCategorySorting() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.product-card', { timeout: 10000 });

  const categoriesToTest = [
    { selector: '.category-pill[data-category="All"]', name: 'Tous les produits' },
    { selector: '.category-pill[data-category="Fragrance"]', name: 'Parfums' },
    { selector: '.category-pill[data-category="Skincare"]', name: 'Soins de la peau' },
    { selector: '.category-pill[data-category="Makeup"]', name: 'Maquillage' },
    { selector: '.category-pill[data-category="Deals"]', name: '🔥 Offres & Promos' }
  ];

  for (const cat of categoriesToTest) {
    console.log(`\n================ Testing Category: ${cat.name} ================`);
    await page.click(cat.selector);
    await page.waitForTimeout(600);

    const products = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#product-grid .product-card'));
      return cards.map(c => {
        const title = c.querySelector('.product-title')?.textContent.trim();
        const promoBadge = c.querySelector('.promo-badge')?.textContent.trim();
        const catBadge = c.querySelector('.category-badge')?.textContent.trim();
        const currentPrice = c.querySelector('.price-current')?.textContent.trim();
        const origPrice = c.querySelector('.price-original')?.textContent.trim();
        
        let discountNum = 0;
        if (promoBadge) {
          const match = promoBadge.match(/-(\d+)%/);
          if (match) discountNum = parseInt(match[1], 10);
        }

        return {
          title,
          badge: promoBadge || catBadge || 'Sans badge',
          discountNum,
          currentPrice,
          origPrice
        };
      });
    });

    console.log(`Total items displayed: ${products.length}`);
    console.log(`First 5 items discounts:`);
    products.slice(0, 5).forEach((p, idx) => {
      console.log(`  ${idx + 1}. [${p.badge}] (${p.discountNum}%) - ${p.title} (${p.currentPrice})`);
    });

    // Verify descending order
    let isDescending = true;
    for (let i = 0; i < products.length - 1; i++) {
      if (products[i].discountNum < products[i + 1].discountNum) {
        isDescending = false;
        console.error(`  ❌ Order violation at index ${i}: ${products[i].discountNum}% < ${products[i+1].discountNum}%`);
        break;
      }
    }
    console.log(`  => Strictly Descending Discount Order: ${isDescending ? '✅ YES' : '❌ NO'}`);
  }

  await browser.close();
}

testCategorySorting().catch(console.error);
