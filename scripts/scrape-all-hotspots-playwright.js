import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const HOTSPOTS_OUTPUT = path.join(DATA_DIR, 'scraped-live-hotspots.json');

async function scrapeHotspotsFromLiveSite() {
  console.log("Launching Chromium browser with Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Intercept all API and JSON requests to detect any enrichment responses
  const interceptedData = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('ipaper') || url.includes('catalogue') || url.includes('enrichment') || url.includes('products')) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('application/json')) {
          const json = await res.json();
          interceptedData.push({ url, json });
          console.log(`[Intercepted JSON] ${url}`);
        }
      } catch (e) {}
    }
  });

  const targetUrl = 'https://tn.oriflame.com/catalogue?cataloguecode=2026008&PageNumber=1&store=TN-oriflame_1';
  console.log(`Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });

  console.log("Page loaded. Waiting for iPaper container...");
  await page.waitForTimeout(5000);

  // Extract all enrichment elements currently in DOM
  const pageHotspots = await page.evaluate(() => {
    const items = [];
    const elements = document.querySelectorAll('.book-pageelement--shopitem, [data-enrichment_type="shopitem"], [aria-label*="Add product"]');
    elements.forEach((el, index) => {
      const aria = el.getAttribute('aria-label') || '';
      const style = el.getAttribute('style') || '';
      const id = el.getAttribute('data-pageelement-id') || el.id || `hotspot_${index}`;
      
      // Parse coordinates from inline style
      const leftMatch = style.match(/left:\s*([0-9.]+%?)/);
      const topMatch = style.match(/top:\s*([0-9.]+%?)/);
      const widthMatch = style.match(/width:\s*([0-9.]+%?)/);
      const heightMatch = style.match(/height:\s*([0-9.]+%?)/);

      // Parse product ID and Name from aria-label (e.g. "Add product 46980-Crème de Corps Parfumée Giordani Gold Essenza Supreme to Caddie")
      const prodMatch = aria.match(/Add product\s+([0-9]+)-([^\-]+?)\s+to/i) || aria.match(/([0-9]{4,6})[\s-]+(.+)/);

      items.push({
        id: prodMatch ? prodMatch[1] : id,
        name: prodMatch ? prodMatch[2].trim() : aria,
        rawAria: aria,
        left: leftMatch ? leftMatch[1] : '50%',
        top: topMatch ? topMatch[1] : '50%',
        width: widthMatch ? widthMatch[1] : '4%',
        height: heightMatch ? heightMatch[1] : '5%',
        style
      });
    });
    return items;
  });

  console.log(`Found ${pageHotspots.length} hotspots on initial page.`);

  // Save intercepted network JSON & extracted hotspots
  fs.writeFileSync(HOTSPOTS_OUTPUT, JSON.stringify({ pageHotspots, interceptedDataCount: interceptedData.length, interceptedData }, null, 2), 'utf8');
  console.log(`Saved hotspot data to ${HOTSPOTS_OUTPUT}`);

  await browser.close();
}

scrapeHotspotsFromLiveSite().catch(err => {
  console.error("Scrape error:", err);
});
