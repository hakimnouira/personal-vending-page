import { scrapeOriflameTunisiaCatalog } from './services/scraper.js';
import fs from 'fs';
import path from 'path';

async function runScrapeAndSave() {
  console.log("Starting live scrape from Oriflame Tunisia...");
  const items = await scrapeOriflameTunisiaCatalog();
  console.log(`Successfully scraped ${items.length} items from tn.oriflame.com!`);
  
  const existingPath = path.join(process.cwd(), 'data', 'products.json');
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  } catch (e) {}

  let added = 0;
  items.forEach(item => {
    const idx = existing.findIndex(p => p.product_id === item.product_id);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...item };
    } else {
      existing.unshift(item);
      added++;
    }
  });

  fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2), 'utf8');
  console.log(`Saved! Total catalog products: ${existing.length} (${added} newly added).`);
  
  const promos = existing.filter(p => p.is_promo);
  console.log(`Promotional Deals count: ${promos.length}`);
  promos.slice(0, 3).forEach(p => {
    console.log(`Deal: ${p.name} - Now ${p.price} TND (Was ${p.original_price} TND, -${p.discount_percent}%)`);
  });
}

runScrapeAndSave();
