import axios from 'axios';
import * as cheerio from 'cheerio';

function extractDualPrices(html) {
  const $ = cheerio.load(html);
  
  // 1. Look for explicit "Prix normal" / "السعر العادي" / "Prix régulier"
  let normalPrice = null;
  const normalMatch = html.match(/Prix\s*(?:normal|régulier|initial|standard)\s*[:：]?\s*([0-9]+[.,][0-9]{2})\s*DT/i) ||
                      html.match(/السعر\s*(?:العادي|الأصلي|الأساسي)\s*[:：]?\s*([0-9]+[.,][0-9]{2})\s*DT/i);
  if (normalMatch) {
    normalPrice = parseFloat(normalMatch[1].replace(',', '.'));
  }

  // 2. Look for primary selling price in h4 / price classes
  let sellingPrice = null;
  const priceHeadings = $('h4, h3, [class*="Typography-h4"], [class*="product-price"], [class*="currentPrice"]').map((i, el) => $(el).text().trim()).get();
  for (const t of priceHeadings) {
    const m = t.match(/^([0-9]+[.,][0-9]{2})\s*DT$/i);
    if (m) {
      sellingPrice = parseFloat(m[1].replace(',', '.'));
      break;
    }
  }

  // 3. Fallback to all DT occurrences
  const allPrices = Array.from(html.matchAll(/([0-9]+[.,][0-9]{2})\s*DT/gi))
    .map(m => parseFloat(m[1].replace(',', '.')))
    .filter(p => p > 5 && p < 1000); // Filter out shipping numbers (e.g. 6.40 DT)

  if (!sellingPrice && allPrices.length > 0) {
    sellingPrice = allPrices[0];
  }

  if (!normalPrice && allPrices.length > 1) {
    const maxP = Math.max(...allPrices);
    if (sellingPrice && maxP > sellingPrice) {
      normalPrice = maxP;
    }
  }

  // If normalPrice is found but sellingPrice not found or equal
  if (normalPrice && (!sellingPrice || sellingPrice === normalPrice)) {
    const lowerPrices = allPrices.filter(p => p < normalPrice);
    if (lowerPrices.length > 0) {
      sellingPrice = lowerPrices[0];
    }
  }

  return {
    sellingPrice: sellingPrice || (allPrices[0] || 39.9),
    originalPrice: normalPrice || (sellingPrice ? sellingPrice : null)
  };
}

async function testCodes() {
  const codes = ['23378', '48667', '42106', '43122', '12760', '35742', '35759'];
  for (const c of codes) {
    try {
      const url = `https://tn.oriflame.com/products/product?code=${c}&store=TN-oriflame_1`;
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
      const p = extractDualPrices(res.data);
      console.log(`Code ${c} => Selling (Stock/Catalog): ${p.sellingPrice.toFixed(3)} DT | Normal (Deals/Original): ${p.originalPrice.toFixed(3)} DT`);
    } catch (e) {
      console.log(`Code ${c} => Error: ${e.message}`);
    }
  }
}

testCodes().then(() => process.exit(0));
