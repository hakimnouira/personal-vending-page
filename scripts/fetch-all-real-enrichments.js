import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const ENRICHMENTS_OUTPUT = path.join(DATA_DIR, 'all-official-enrichments.json');

async function fetchAllRealEnrichments() {
  console.log("Launching Chromium to capture ALL enrichment chunks from Oriflame...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const enrichmentFiles = [];

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/Enrichments/') && url.includes('.json')) {
      try {
        const json = await res.json();
        console.log(`[Captured Enrichment File] ${url}`);
        enrichmentFiles.push({ url, data: json });
      } catch (e) {}
    }
  });

  // Navigate to Page 1, Page 36, Page 71, Page 106, Page 140
  const pagesToVisit = [1, 36, 71, 106, 140, 148];
  for (const p of pagesToVisit) {
    const url = `https://tn.oriflame.com/catalogue?cataloguecode=2026008&PageNumber=${p}&store=TN-oriflame_1`;
    console.log(`Navigating to Page ${p}: ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
    } catch (e) {
      console.warn(`Timeout/error on page ${p}:`, e.message);
    }
  }

  console.log(`Total enrichment files captured: ${enrichmentFiles.length}`);
  fs.writeFileSync(ENRICHMENTS_OUTPUT, JSON.stringify(enrichmentFiles, null, 2), 'utf8');

  await browser.close();
}

fetchAllRealEnrichments().catch(err => console.error("Error:", err));
