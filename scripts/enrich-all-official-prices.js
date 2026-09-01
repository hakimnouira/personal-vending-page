import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProducts, saveProducts } from '../dataAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const ENRICHMENTS_FILE = path.join(DATA_DIR, 'all-official-enrichments.json');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchRegularPriceFromWeb(productId) {
  const cleanId = String(productId).trim();
  const url = `https://tn.oriflame.com/products/product?code=${cleanId}&store=TN-oriflame_1`;
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      timeout: 8000
    });
    const html = res.data;
    const allPrices = Array.from(html.matchAll(/([0-9]+[.,][0-9]{2})\s*DT/gi))
      .map(m => parseFloat(m[1].replace(',', '.')))
      .filter(p => p > 5 && p < 1000); // Filter realistic product prices (exclude small shipping/handling numbers)

    if (allPrices.length > 0) {
      return Math.max(...allPrices);
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log("Starting full official regular price enrichment from Oriflame...");
  const products = await getProducts();
  console.log(`Loaded ${products.length} products from database.`);

  const priceLookup = new Map();
  const BATCH_SIZE = 10;
  let updatedCount = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (p) => {
      const pid = String(p.product_id);
      const webPrice = await fetchRegularPriceFromWeb(pid);
      if (webPrice && webPrice >= Number(p.price || 0)) {
        priceLookup.set(pid, webPrice);
        p.original_price = webPrice;
        if (!p.original_catalog_price) {
          p.original_catalog_price = p.price;
        }
        if (webPrice > Number(p.price)) {
          p.is_promo = true;
          p.discount_percent = Math.round(((webPrice - Number(p.price)) / webPrice) * 100);
        }
        updatedCount++;
      }
    });

    await Promise.all(promises);
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, products.length)}/${products.length} checked (${updatedCount} official regular prices resolved)...`);
  }

  // Save to Neon Postgres & data/products.json
  await saveProducts(products);
  fs.writeFileSync(path.join(DATA_DIR, 'products.json'), JSON.stringify(products, null, 2), 'utf8');
  console.log(`Successfully saved ${products.length} products to Neon & data/products.json.`);

  // Synchronize with all-official-enrichments.json
  if (fs.existsSync(ENRICHMENTS_FILE)) {
    try {
      const enrichmentsData = JSON.parse(fs.readFileSync(ENRICHMENTS_FILE, 'utf8'));
      let enrichCount = 0;
      enrichmentsData.forEach(chunk => {
        const list = chunk.data?.enrichments || [];
        list.forEach(e => {
          if (e.type === 13) {
            let rawProdId = String(e.productId || '').trim().replace(/\+.*$/, '');
            const match = (e.name || e.desc || '').match(/^([0-9]{4,6})/);
            const pid = match ? match[1] : rawProdId;
            const regPrice = priceLookup.get(pid);
            if (regPrice) {
              e.original_price = regPrice;
              enrichCount++;
            }
          }
        });
      });
      fs.writeFileSync(ENRICHMENTS_FILE, JSON.stringify(enrichmentsData, null, 2), 'utf8');
      console.log(`Updated ${enrichCount} items in all-official-enrichments.json with official original_price.`);
    } catch (err) {
      console.warn("Enrichments update error:", err.message);
    }
  }

  console.log("Full price enrichment completed successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
