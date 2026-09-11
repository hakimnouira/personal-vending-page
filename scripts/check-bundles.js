import { chromium } from 'playwright';

async function check() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  for (const w of [360, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(1000);
    // Click on Bundles pill to show bundles section
    await page.click('.category-pill[data-category="Bundles"]');
    await page.waitForTimeout(500);

    const data = await page.evaluate(() => {
      const section = document.getElementById('bundles-showcase-section');
      const cards = Array.from(document.querySelectorAll('.bundle-showcase-card'));
      return {
        sectionDisplay: section ? window.getComputedStyle(section).display : 'none',
        cardsCount: cards.length,
        cards: cards.map(c => {
          const stage = c.querySelector('.bundle-img-stage');
          const thumbs = Array.from(c.querySelectorAll('.bundle-prod-thumb'));
          const pluses = Array.from(c.querySelectorAll('.bundle-plus-circle'));
          return {
            stageW: stage ? Math.round(stage.getBoundingClientRect().width) : 0,
            stageH: stage ? Math.round(stage.getBoundingClientRect().height) : 0,
            thumbsCount: thumbs.length,
            plusesCount: pluses.length,
            thumbs: thumbs.map(t => {
              const img = t.querySelector('img');
              const r = t.getBoundingClientRect();
              const ir = img ? img.getBoundingClientRect() : null;
              return {
                thumbW: Math.round(r.width),
                thumbH: Math.round(r.height),
                imgW: ir ? Math.round(ir.width) : 0,
                imgH: ir ? Math.round(ir.height) : 0,
                imgFit: img ? window.getComputedStyle(img).objectFit : null
              };
            })
          };
        })
      };
    });
    console.log('=== Width:', w, '===');
    console.log(JSON.stringify(data, null, 2));
    await page.close();
  }
  await browser.close();
}

check().catch(console.error);
