import { chromium } from 'playwright';

async function testImages() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const viewports = [
    { name: 'Desktop 1440x900', width: 1440, height: 900 },
    { name: 'Mobile 390x844', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.product-card', { state: 'attached', timeout: 15000 });

    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.product-card')).slice(0, 10);
      return cards.map(c => {
        const title = c.querySelector('.product-title')?.textContent.trim();
        const img = c.querySelector('.product-image');
        const wrap = c.querySelector('.product-image-wrap');
        const style = window.getComputedStyle(img);
        const imgRect = img.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        return {
          title,
          objectFit: style.objectFit,
          wrapW: Math.round(wrapRect.width),
          wrapH: Math.round(wrapRect.height),
          imgW: Math.round(imgRect.width),
          imgH: Math.round(imgRect.height),
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          complete: img.complete
        };
      });
    });

    console.log(`[${vp.name}] : Verified ${results.length} product images :`);
    results.slice(0, 3).forEach(r => {
      console.log(`  - "${r.title.slice(0, 30)}..." : wrap ${r.wrapW}x${r.wrapH}px, img ${r.imgW}x${r.imgH}px, object-fit: ${r.objectFit} (natural: ${r.naturalW}x${r.naturalH}px)`);
    });
    console.log(`  => All items object-fit: contain = ${results.every(r => r.objectFit === 'contain')}\n`);
    await page.close();
  }

  await browser.close();
}

testImages().catch(console.error);
