import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

async function verifyStock(prodId) {
  try {
    const url = `https://tn.oriflame.com/products/product?code=${prodId}`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 5000
    });
    const html = res.data;
    const hasBuyButton = (
      html.includes('Acheter') ||
      html.includes('Ajouter au panier') ||
      html.includes('Ajoutez au panier') ||
      html.includes('AddToBasket') ||
      html.includes('AddToBasketVisible')
    );

    let inStock = hasBuyButton && !html.includes('schema.org/OutOfStock') && !html.includes('OutOfStock');

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const jsonLd = nextData.props?.pageProps?.productDetailData?.application?.productDetailPage?.metadata?.jsonLd;
        if (jsonLd?.offers?.availability) {
          if (jsonLd.offers.availability.includes('OutOfStock')) {
            inStock = false;
          } else if (jsonLd.offers.availability.includes('InStock') && hasBuyButton) {
            inStock = true;
          }
        }
      } catch (e) {}
    }

    if (
      html.includes('متوفر قريباً') ||
      html.includes('متوفر قريبا') ||
      html.includes('غير متوفر') ||
      html.includes('نفدت الكمية') ||
      html.toLowerCase().includes('bientôt disponible') ||
      html.toLowerCase().includes('rupture de stock')
    ) {
      inStock = false;
    }

    return { prodId, inStock, status: res.status };
  } catch (err) {
    if (err.response?.status === 404) {
      // 404 on Oriflame means discontinued or out of catalog
      return { prodId, inStock: false, status: 404 };
    }
    return { prodId, inStock: true, error: err.message };
  }
}

async function runBatch() {
  const prods = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
  console.log(`Checking stock for sample of ${prods.length} products...`);
  
  // Test first 30 products
  const sample = prods.slice(0, 30);
  const results = [];
  
  for (let i = 0; i < sample.length; i += 10) {
    const chunk = sample.slice(i, i + 10);
    const chunkRes = await Promise.all(chunk.map(p => verifyStock(p.product_id)));
    results.push(...chunkRes);
  }

  const outOfStock = results.filter(r => !r.inStock);
  console.log(`Checked ${results.length} products. Found ${outOfStock.length} OUT OF STOCK products:`);
  outOfStock.forEach(o => console.log(`- ${o.prodId} (status ${o.status})`));
}

runBatch();
