import { chromium } from 'playwright';

async function testEcat() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  const failedImages = [];
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/api/flipbook/image') && !response.ok()) {
      failedImages.push({ url, status: response.status() });
    }
  });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ecat-page-img', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Check Page 1 (Cover)
  let indicator = await page.$eval('#catalogue-page-indicator', el => el.textContent.trim());
  let spreadImg = await page.$eval('.ecat-page-img', el => ({
    src: el.getAttribute('src'),
    complete: el.complete,
    naturalWidth: el.naturalWidth,
    naturalHeight: el.naturalHeight
  }));
  console.log('Cover spread:', indicator);
  console.log('Cover image loaded:', spreadImg.complete && spreadImg.naturalWidth > 0 ? `YES (${spreadImg.naturalWidth}x${spreadImg.naturalHeight}px)` : 'NO');

  // Navigate next 3 spreads
  for (let i = 1; i <= 3; i++) {
    await page.click('#catalogue-nav-next');
    await page.waitForTimeout(1000);
    indicator = await page.$eval('#catalogue-page-indicator', el => el.textContent.trim());
    const dualImgs = await page.$$eval('.ecat-dual-spread-wrap .ecat-page-img', imgs => imgs.map(img => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight
    })));
    console.log(`Spread ${i} (${indicator}): dual images loaded = ${dualImgs.every(d => d.complete && d.naturalWidth > 0)}`);
  }

  // Jump to Skincare (spread index 31: p. 62-95)
  await page.selectOption('#catalogue-toc-select', '31');
  await page.waitForTimeout(1200);
  indicator = await page.$eval('#catalogue-page-indicator', el => el.textContent.trim());
  console.log('TOC jump to Skincare:', indicator);

  // Jump to last spread (Page 148, back cover)
  await page.click('#catalogue-nav-last');
  await page.waitForTimeout(1200);
  indicator = await page.$eval('#catalogue-page-indicator', el => el.textContent.trim());
  const isSinglePage = await page.$eval('.ecat-single-page-wrap', () => true).catch(() => false);
  const backCoverImg = await page.$eval('.ecat-single-page-wrap .ecat-page-img', el => ({
    complete: el.complete,
    naturalWidth: el.naturalWidth,
    naturalHeight: el.naturalHeight
  }));
  console.log(`Last spread (${indicator}): rendered as single-page = ${isSinglePage}, image loaded = ${backCoverImg.complete && backCoverImg.naturalWidth > 0} (${backCoverImg.naturalWidth}x${backCoverImg.naturalHeight}px)`);

  console.log('Total failed flipbook images during navigation:', failedImages.length);
  await browser.close();
}

testEcat().catch(console.error);
