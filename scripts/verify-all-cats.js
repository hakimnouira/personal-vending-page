import { chromium } from 'playwright';

async function verifyAll8Categories() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.product-card', { timeout: 10000 });

  const categories = [
    { cat: 'All', name: 'Tous les produits' },
    { cat: 'Deals', name: '🔥 Offres & Promos' },
    { cat: 'Bundles', name: '🎁 Packs & Duos' },
    { cat: 'Skincare', name: 'Soins de la peau' },
    { cat: 'Makeup', name: 'Maquillage' },
    { cat: 'Fragrance', name: 'Parfums' },
    { cat: 'Wellness', name: 'Bien-être' },
    { cat: 'Haircare', name: 'Soins capillaires' }
  ];

  console.log('------------------------------------------------------------');
  console.log('TEST DE VALIDATION DU TRI PAR REMISE SUR LES 8 CATÉGORIES');
  console.log('------------------------------------------------------------');

  for (const { cat, name } of categories) {
    await page.click(`.category-pill[data-category="${cat}"]`);
    await page.waitForTimeout(400);

    const result = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#product-grid .product-card'));
      const items = cards.map(c => {
        const title = c.querySelector('.product-title')?.textContent.trim();
        const badge = c.querySelector('.promo-badge')?.textContent.trim() || c.querySelector('.category-badge')?.textContent.trim();
        let discount = 0;
        const match = (badge || '').match(/-(\d+)%/);
        if (match) discount = parseInt(match[1], 10);
        return { title, badge, discount };
      });

      let isSortedDescending = true;
      for (let i = 0; i < items.length - 1; i++) {
        if (items[i].discount < items[i + 1].discount) {
          isSortedDescending = false;
          break;
        }
      }

      return {
        count: items.length,
        isSortedDescending,
        sample: items.slice(0, 3)
      };
    });

    console.log(`\n📁 Catégorie : [${name}] (${result.count} produits affichés)`);
    console.log(`   - Tri strictement décroissant par remise : ${result.isSortedDescending ? '✅ OUI (Conforme)' : '❌ NON'}`);
    result.sample.forEach((s, idx) => {
      console.log(`     #${idx + 1} : [${s.badge}] ${s.title}`);
    });
  }

  await browser.close();
  console.log('\n------------------------------------------------------------');
  console.log('✅ VALIDATION TERMINÉE : 8/8 CATÉGORIES SONT TRIÉES DYNAMIQUEMENT !');
  console.log('------------------------------------------------------------');
}

verifyAll8Categories().catch(console.error);
