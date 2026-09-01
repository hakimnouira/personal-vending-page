import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { getProducts, saveProducts } from '../dataAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const ENRICHMENTS_FILE = path.join(DATA_DIR, 'all-official-enrichments.json');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchDualPricesFromWeb(productId) {
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
    const $ = cheerio.load(html);

    let normalPrice = null;
    const normalMatch = html.match(/Prix\s*(?:normal|régulier|initial|standard)\s*[:：]?\s*([0-9]+[.,][0-9]{2})\s*DT/i) ||
                        html.match(/السعر\s*(?:العادي|الأصلي|الأساسي)\s*[:：]?\s*([0-9]+[.,][0-9]{2})\s*DT/i);
    if (normalMatch) {
      normalPrice = parseFloat(normalMatch[1].replace(',', '.'));
    }

    let sellingPrice = null;
    const priceHeadings = $('h4, h3, [class*="Typography-h4"], [class*="product-price"], [class*="currentPrice"]').map((i, el) => $(el).text().trim()).get();
    for (const t of priceHeadings) {
      const m = t.match(/^([0-9]+[.,][0-9]{2})\s*DT$/i);
      if (m) {
        sellingPrice = parseFloat(m[1].replace(',', '.'));
        break;
      }
    }

    const allPrices = Array.from(html.matchAll(/([0-9]+[.,][0-9]{2})\s*DT/gi))
      .map(m => parseFloat(m[1].replace(',', '.')))
      .filter(p => p > 5 && p < 1000);

    if (!sellingPrice && allPrices.length > 0) {
      sellingPrice = allPrices[0];
    }

    if (!normalPrice && allPrices.length > 1) {
      const maxP = Math.max(...allPrices);
      if (sellingPrice && maxP > sellingPrice) {
        normalPrice = maxP;
      }
    }

    if (normalPrice && (!sellingPrice || sellingPrice === normalPrice)) {
      const lowerPrices = allPrices.filter(p => p < normalPrice);
      if (lowerPrices.length > 0) {
        sellingPrice = lowerPrices[0];
      }
    }

    return {
      sellingPrice: sellingPrice || (allPrices[0] || null),
      originalPrice: normalPrice || (sellingPrice ? sellingPrice : null)
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log("Starting dual price enrichment (Stock Selling Price vs Deals Original Price)...");
  const products = await getProducts();
  console.log(`Loaded ${products.length} products from database.`);

  // Load Flipbook and enrichments cache for promo catalogue prices
  const promoCatalogPriceMap = new Map();
  if (fs.existsSync(ENRICHMENTS_FILE)) {
    try {
      const enr = JSON.parse(fs.readFileSync(ENRICHMENTS_FILE, 'utf8'));
      enr.forEach(chunk => {
        (chunk.data?.enrichments || []).forEach(e => {
          if (e.type === 13 && e.price) {
            let pid = String(e.productId || '').trim().replace(/\+.*$/, '');
            const match = (e.name || e.desc || '').match(/^([0-9]{4,6})/);
            if (match) pid = match[1];
            if (pid) promoCatalogPriceMap.set(pid, Number(e.price));
          }
        });
      });
    } catch (e) {}
  }

  const BATCH_SIZE = 10;
  let updatedCount = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (p) => {
      const pid = String(p.product_id);
      const webResult = await fetchDualPricesFromWeb(pid);
      
      const enrPrice = promoCatalogPriceMap.get(pid);
      
      // Determine the true catalog selling promo price (e.g. 54.90 for 23378, 12.90 for 12760, 23.90 for 48667)
      let catalogSellingPrice = enrPrice || webResult?.sellingPrice || Number(p.original_catalog_price || p.price);
      if (webResult?.sellingPrice && webResult.sellingPrice < catalogSellingPrice) {
        catalogSellingPrice = webResult.sellingPrice;
      }
      
      // Determine the authentic un-discounted regular price (e.g. 89.90 for 23378, 19.90 for 12760, 29.90 for 48667)
      let initialRegularPrice = webResult?.originalPrice || Number(p.original_price || 0);
      if (!initialRegularPrice || initialRegularPrice < catalogSellingPrice) {
        initialRegularPrice = catalogSellingPrice;
      }

      p.original_price = initialRegularPrice;
      p.original_catalog_price = catalogSellingPrice;
      
      // Keep active company discount ratio if enabled
      if (p.company_discount_applied && p.company_discount_percent > 0) {
        p.price = parseFloat((catalogSellingPrice * (1 - p.company_discount_percent / 100)).toFixed(2));
      } else {
        p.price = catalogSellingPrice;
      }

      p.is_promo = Boolean(initialRegularPrice > catalogSellingPrice);
      p.discount_percent = p.is_promo ? Math.round(((initialRegularPrice - catalogSellingPrice) / initialRegularPrice) * 100) : 0;
      updatedCount++;
    });

    await Promise.all(promises);
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, products.length)}/${products.length} processed...`);
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
            const matchedProd = products.find(pr => pr.product_id === pid);
            if (matchedProd) {
              if (matchedProd.original_price) e.original_price = matchedProd.original_price;
              if (matchedProd.original_catalog_price) e.price = matchedProd.original_catalog_price;
              enrichCount++;
            }
          }
        });
      });
      fs.writeFileSync(ENRICHMENTS_FILE, JSON.stringify(enrichmentsData, null, 2), 'utf8');
      console.log(`Updated ${enrichCount} items in all-official-enrichments.json with synchronized prices.`);
    } catch (err) {
      console.warn("Enrichments update error:", err.message);
    }
  }

  console.log("Dual price enrichment completed successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
