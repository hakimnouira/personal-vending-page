import { chromium } from 'playwright';

async function testImg() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(1000);
  await page.click('.category-pill[data-category="Bundles"]');
  await page.waitForTimeout(2000);

  const imgStatus = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.bundle-prod-thumb img'));
    return imgs.map(img => ({
      src: img.src.slice(0, 70),
      complete: img.complete,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      offsetW: img.offsetWidth,
      offsetH: img.offsetHeight,
      style: window.getComputedStyle(img).objectFit
    }));
  });
  console.log(JSON.stringify(imgStatus, null, 2));
  await browser.close();
}

testImg().catch(console.error);
