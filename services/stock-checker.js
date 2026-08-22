import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

export async function checkProductLiveStock(prodId) {
  try {
    const url = `https://tn.oriflame.com/products/product?code=${prodId}`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7'
      },
      timeout: 6000
    });

    const html = res.data || '';

    // 1. Buy Button check (If there is no 'Acheter' or 'Ajouter au panier' button, it is out of stock)
    const hasBuyButton = (
      html.includes('Acheter') ||
      html.includes('Ajouter au panier') ||
      html.includes('Ajoutez au panier') ||
      html.includes('AddToBasket') ||
      html.includes('AddToBasketVisible')
    );

    // 2. Schema.org / JSON-LD / HTML flags
    let isOutOfStock = !hasBuyButton || html.includes('schema.org/OutOfStock') || html.includes('OutOfStock');

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const jsonLd = nextData.props?.pageProps?.productDetailData?.application?.productDetailPage?.metadata?.jsonLd;
        if (jsonLd?.offers?.availability) {
          if (jsonLd.offers.availability.includes('OutOfStock')) {
            isOutOfStock = true;
          } else if (jsonLd.offers.availability.includes('InStock') && hasBuyButton) {
            isOutOfStock = false;
          }
        }
      } catch (e) {}
    }

    // 3. Arabic & French "Coming soon" / "Out of stock" text detection
    if (
      html.includes('متوفر قريباً') ||
      html.includes('متوفر قريبا') ||
      html.includes('قريباً') ||
      html.includes('قريبا') ||
      html.includes('غير متوفر') ||
      html.includes('نفدت الكمية') ||
      html.includes('نفذت الكمية') ||
      html.includes('غير متوفر حالياً') ||
      html.includes('غير متوفر حاليا') ||
      html.toLowerCase().includes('bientôt disponible') ||
      html.toLowerCase().includes('bientot disponible') ||
      html.toLowerCase().includes('rupture de stock') ||
      html.toLowerCase().includes('épuisé') ||
      html.toLowerCase().includes('epuise') ||
      html.toLowerCase().includes('out of stock')
    ) {
      isOutOfStock = true;
    }

    return { prodId, inStock: !isOutOfStock, found: true };
  } catch (err) {
    if (err.response?.status === 404) {
      return { prodId, inStock: false, found: false, reason: '404_not_found' };
    }
    // Network or timeout: fallback to false if strictly checking or keep current
    return { prodId, inStock: null, error: err.message };
  }
}

export async function syncAllProductsStockLive() {
  if (!fs.existsSync(PRODUCTS_FILE)) return { success: false, message: 'Products file not found' };

  const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  console.log(`Starting live stock check for ${products.length} products...`);

  let checkedCount = 0;
  let inStockCount = 0;
  let outOfStockCount = 0;
  const outOfStockIds = [];

  const BATCH_SIZE = 12;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(p => checkProductLiveStock(p.product_id)));

    results.forEach(res => {
      checkedCount++;
      const prod = products.find(p => String(p.product_id) === String(res.prodId));
      if (prod) {
        if (res.inStock === false) {
          prod.in_stock = false;
          outOfStockCount++;
          outOfStockIds.push(res.prodId);
        } else if (res.inStock === true) {
          prod.in_stock = true;
          inStockCount++;
        }
      }
    });

    console.log(`Progress: ${checkedCount}/${products.length} checked (${outOfStockCount} out of stock so far)...`);
  }

  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');

  return {
    success: true,
    total: products.length,
    in_stock_count: inStockCount,
    out_of_stock_count: outOfStockCount,
    out_of_stock_ids: outOfStockIds
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncAllProductsStockLive().then(r => console.log('Sync finished:', r));
}
