import https from 'https';
import axios from 'axios';
import * as cheerio from 'cheerio';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function classifyCategory(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('parfum') || lower.includes('eau de') || lower.includes('toilette') || lower.includes('brume') || lower.includes('déodorant') || lower.includes('deodorant') || lower.includes('roll-on') || lower.includes('glacier') || lower.includes('eclat') || lower.includes('possess') || lower.includes('amber') || lower.includes('giordani gold essenza') || lower.includes('signature') || lower.includes('lucia') || lower.includes('volare') || lower.includes('venture') || lower.includes('joyce') || lower.includes('scents')) {
    return 'Fragrance';
  }
  if (lower.includes('mascara') || lower.includes('lèvres') || lower.includes('levres') || lower.includes('blush') || lower.includes('fond de teint') || lower.includes('poudre') || lower.includes('fard') || lower.includes('vernis') || lower.includes('top coat') || lower.includes('eyeliner') || lower.includes('sourcils') || lower.includes('the one') || lower.includes('oncolour') || lower.includes('perles bronzantes') || lower.includes('crayon') || lower.includes('gloss')) {
    return 'Makeup';
  }
  if (lower.includes('shampooing') || lower.includes('après-shampooing') || lower.includes('capillaire') || lower.includes('cheveux') || lower.includes('eleo') || lower.includes('hairx') || lower.includes('duologi')) {
    return 'Haircare';
  }
  if (lower.includes('wellness') || lower.includes('astaxanthine') || lower.includes('oméga') || lower.includes('omega') || lower.includes('vitamines') || lower.includes('shake') || lower.includes('soupe') || lower.includes('calcium') || lower.includes('fibres')) {
    return 'Wellness';
  }
  return 'Skincare';
}

function parsePrice(raw) {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;
  const match = String(raw).replace(',', '.').match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

async function scrapeProductFromUrl(inputUrl) {
  let url = inputUrl.trim();
  let code = '';
  const codeMatch = url.match(/(?:code=|^)([0-9]{4,6})/i);
  if (codeMatch) code = codeMatch[1];
  if (!url.startsWith('http')) {
    url = `https://tn.oriflame.com/products/product?code=${code || url}`;
  }

  const response = await axios.get(url, {
    httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
    },
    timeout: 15000
  });

  const $ = cheerio.load(response.data);
  let title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'Produit Oriflame';
  title = title.split('|')[0].trim();

  let price = 45.00;
  let originalPrice = null;
  let inStock = true;
  let foundImages = [];
  let description = '';
  let ingredients = '';

  const nextDataStr = $('#__NEXT_DATA__').html();
  if (nextDataStr) {
    try {
      const nextData = JSON.parse(nextDataStr);
      const pdp = nextData.props?.pageProps?.productDetailData;
      const product = pdp?.product;
      const jsonLd = pdp?.application?.productDetailPage?.metadata?.jsonLd;

      if (jsonLd?.name) title = jsonLd.name;
      else if (product?.concept?.name) title = product.concept.name;

      if (jsonLd?.image) {
        foundImages = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
      }

      const cp = product?.concept?.products?.find(item => String(item.productCode || item.code) === String(code)) || product?.concept?.products?.[0];
      if (cp?.formattedPrice?.price) {
        const curr = parsePrice(cp.formattedPrice.price.currentPrice);
        const basic = parsePrice(cp.formattedPrice.price.basicCataloguePrice);
        if (curr > 0) price = curr;
        if (basic > curr) originalPrice = basic;
      } else if (jsonLd?.offers?.price) {
        price = parsePrice(jsonLd.offers.price);
      }

      // Stock
      if (jsonLd?.offers?.availability) {
        if (jsonLd.offers.availability.includes('OutOfStock')) inStock = false;
        else if (jsonLd.offers.availability.includes('InStock')) inStock = true;
      }
      if (cp?.labels) {
        if (cp.labels.some(l => l.labelKey === 'OutOfStock')) inStock = false;
        if (cp.labels.some(l => l.labelKey === 'AddToBasketVisible')) inStock = true;
      }
      if (cp?.isOffStock === true) inStock = false;

      // Description
      description = product?.concept?.description || product?.concept?.brand?.description || jsonLd?.description || $('meta[name="description"]').attr('content') || '';

      // Ingredients
      const ingSection = pdp?.application?.productDetailPage?.sections?.ingredients;
      if (Array.isArray(ingSection) && ingSection.length > 0) {
        ingredients = ingSection.map(i => i.text).filter(Boolean).join(' ');
      }
    } catch (e) {
      console.warn('NextData parse note:', e.message);
    }
  }

  const mainImg = foundImages[0] || $('meta[property="og:image"]').attr('content') || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${code}%2f${code}_1.png&MediaId=20989035&Version=1`;
  if (!foundImages.includes(mainImg)) foundImages.unshift(mainImg);

  const isPromo = Boolean(originalPrice && originalPrice > price);
  const discountPercent = isPromo ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

  return {
    product_id: code,
    name: title,
    name_fr: title,
    category: classifyCategory(title),
    price: price,
    original_price: originalPrice,
    original_catalog_price: price,
    company_discount_applied: false,
    company_discount_percent: 0,
    is_promo: isPromo,
    discount_percent: discountPercent,
    size: 'Format Standard',
    suitable_for: 'Tous types de peaux • Certifié Oriflame Suède',
    image_url: mainImg,
    images: foundImages,
    description: description || `Produit officiel Oriflame Tunisie (${code}) : ${title}.`,
    benefits: [
      "100% Produit original certifié par Mouna Nouira",
      discountPercent > 0 ? `Offre promotionnelle catalogue : -${discountPercent}%` : "Formule scandinave haute qualité"
    ],
    how_to_use: "Appliquer délicatement selon les recommandations officielles Oriflame.",
    ingredients: ingredients || "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
    in_stock: inStock
  };
}

async function test() {
  for (const c of ['47724', 'https://tn.oriflame.com/products/product?code=47844']) {
    console.log(`\nTesting: "${c}"`);
    const p = await scrapeProductFromUrl(c);
    console.log('Result:');
    console.log('  Nom:', p.name);
    console.log('  Référence:', p.product_id);
    console.log('  Prix:', p.price, 'DT (Original:', p.original_price, 'DT, Promo:', p.is_promo, ')');
    console.log('  Image:', p.image_url);
    console.log('  Total Images:', p.images.length);
    console.log('  Catégorie:', p.category);
    console.log('  Stock:', p.in_stock);
    console.log('  Description:', p.description.substring(0, 120) + '...');
  }
}
test();