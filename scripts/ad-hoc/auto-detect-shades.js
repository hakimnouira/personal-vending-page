import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { parsePrice } from '../../services/scraper.js';

const PRODUCTS_FILE = 'data/products.json';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchVariantsForCode(code) {
  try {
    const url = `https://tn.oriflame.com/products/product?code=${code}&store=TN-oriflame_1`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7' },
      timeout: 6000
    });
    const $ = cheerio.load(res.data);
    const raw = $('#__NEXT_DATA__').html();
    if (!raw) return null;
    const nextData = JSON.parse(raw);
    const concept = nextData?.props?.pageProps?.productDetailData?.product?.concept;
    if (!concept || !Array.isArray(concept.products) || concept.products.length <= 1) return null;

    const conceptCode = String(concept.conceptCode || concept.products[0]?.productCode || code);
    const conceptName = concept.name || 'Produit Oriflame';

    const variants = concept.products.map(cp => {
      const vCode = String(cp.productCode || cp.code || '');
      const sName = cp.shadeName || '';
      const hex = (Array.isArray(cp.hexColors) && cp.hexColors[0]) || cp.colorImageUrl || '#DE7B90';
      const vImg = cp.mainImage?.url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${vCode}%2f${vCode}_1.png&MediaId=20989035&Version=1`;
      const currentP = parsePrice(cp.formattedPrice?.price?.currentPrice) || 39.90;
      const basicP = parsePrice(cp.formattedPrice?.price?.basicCataloguePrice) || currentP;
      const inStock = cp.backInStockAvailability?.showBackInStockNotification !== true && !cp.isOffStock;

      return {
        product_id: vCode,
        name: `${conceptName} - ${sName || vCode}`,
        shade_name: sName,
        hex_color: hex,
        image_url: vImg,
        price: currentP,
        original_price: basicP > currentP ? basicP : null,
        in_stock: inStock
      };
    }).filter(v => v.product_id);

    // Sort variants by product_id numerically in right ascending order
    variants.sort((a, b) => Number(a.product_id || 0) - Number(b.product_id || 0));

    return {
      conceptCode,
      conceptName,
      variants
    };
  } catch (e) {
    return null;
  }
}

async function autoDetectAndOrderAllVariants() {
  console.log('--- Starting Comprehensive Auto-Detection of Multi-Shade Products ---');
  const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  console.log(`Loaded ${products.length} products from data/products.json.`);

  // Find candidate products that might have shades (Makeup, Vernis, Rouge, Lèvres, Fard, Teint, Mascara, etc.)
  const candidateKeywords = [
    'lèvres', 'levres', 'rouge', 'vernis', 'ongles', 'teint', 'fond de teint', 
    'fard', 'ombre', 'illuminateur', 'highlighter', 'sourcils', 'crayon', 'gloss', 
    'poudre', 'blush', 'the one', 'oncolour', 'giordani'
  ];

  const candidateCodes = new Set();
  products.forEach(p => {
    const nameLower = (p.name || '').toLowerCase();
    const isCandidate = candidateKeywords.some(k => nameLower.includes(k)) || p.category === 'Makeup';
    if (isCandidate && p.product_id && !isNaN(Number(p.product_id))) {
      candidateCodes.add(String(p.product_id));
    }
  });

  console.log(`Found ${candidateCodes.size} candidate beauty/makeup products to check for shades.`);

  const conceptMap = new Map(); // conceptCode -> { conceptName, variants, bestProductObj }
  const variantToConceptMap = new Map(); // variantId -> conceptCode

  // Check candidates in parallel batches of 5
  const codeList = Array.from(candidateCodes);
  const BATCH_SIZE = 5;

  for (let i = 0; i < codeList.length; i += BATCH_SIZE) {
    const batch = codeList.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(code => fetchVariantsForCode(code)));

    results.forEach((res, idx) => {
      const code = batch[idx];
      if (res && res.variants && res.variants.length > 1) {
        const cCode = res.conceptCode || res.variants[0].product_id;
        if (!conceptMap.has(cCode)) {
          console.log(`  ✨ Detected multi-shade concept [${cCode}] "${res.conceptName}" with ${res.variants.length} shades:`, res.variants.map(v => `${v.shade_name} (${v.product_id})`).join(', '));
          conceptMap.set(cCode, res);
        }
        res.variants.forEach(v => {
          variantToConceptMap.set(String(v.product_id), cCode);
        });
      }
    });
  }

  console.log(`\nDetected ${conceptMap.size} unique multi-shade concepts in total.`);

  // Now, merge and clean data/products.json:
  // 1. Remove all standalone variant duplicates
  // 2. Unify each concept into one single product with its sorted variants
  const cleanedProducts = [];
  const processedConcepts = new Set();

  products.forEach(p => {
    const pId = String(p.product_id);
    const conceptCode = variantToConceptMap.get(pId);

    if (conceptCode) {
      if (!processedConcepts.has(conceptCode)) {
        processedConcepts.add(conceptCode);
        const conceptData = conceptMap.get(conceptCode);
        const sortedVariants = conceptData.variants;
        const baseVariant = sortedVariants[0];

        // Create unified master product
        const masterProduct = {
          ...p,
          product_id: conceptCode,
          name: conceptData.conceptName || p.name,
          name_fr: conceptData.conceptName || p.name_fr || p.name,
          price: baseVariant.price || p.price,
          original_price: baseVariant.original_price || p.original_price,
          is_promo: Boolean(baseVariant.original_price && baseVariant.original_price > baseVariant.price),
          image_url: baseVariant.image_url || p.image_url,
          variants: sortedVariants
        };

        cleanedProducts.push(masterProduct);
      }
      // If already processed, skip standalone duplicate
    } else {
      // If product already has variants locally, ensure variants are sorted
      if (Array.isArray(p.variants) && p.variants.length > 1) {
        p.variants.sort((a, b) => Number(a.product_id || 0) - Number(b.product_id || 0));
      }
      cleanedProducts.push(p);
    }
  });

  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(cleanedProducts, null, 2), 'utf8');
  console.log(`\nSuccessfully unified catalog! Total products now: ${cleanedProducts.length} (clean, no duplicate standalone variants, all variants sorted).`);
}

autoDetectAndOrderAllVariants().catch(e => console.error(e));
