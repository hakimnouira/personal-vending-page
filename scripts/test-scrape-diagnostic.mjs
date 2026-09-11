import https from 'https';
import axios from 'axios';
import * as cheerio from 'cheerio';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function classifyCategory(name = '') {
  const lower = name.toLowerCase();

  // 1. NON-FRAGRANCE OVERRIDES FIRST
  if (lower.includes('déodorant') || lower.includes('deodorant') || lower.includes('anti-transpirant') || lower.includes('roll-on')) {
    return 'Skincare';
  }

  if (lower.includes('crème parfumée') || lower.includes('creme parfumee') || lower.includes('crème pour le corps') || 
      lower.includes('lait pour le corps') || lower.includes('gel douche') || lower.includes('savon') || 
      lower.includes('body cream') || lower.includes('body lotion') || lower.includes('shower gel')) {
    return 'Skincare';
  }

  if ((lower.includes('contour des yeux') || lower.includes('contour yeux')) && !lower.includes('waunt 8 hour sleep')) {
    return 'Skincare';
  }

  if (lower.includes('micro essence') || lower.includes('brume visage') || lower.includes('brume multi usages') || lower.includes('proceuticals')) {
    return 'Skincare';
  }

  if (lower.includes('pinceau') || lower.includes('recourbe-cils') || lower.includes('taille-crayon') || lower.includes('éponge')) {
    return 'Makeup';
  }

  if (lower.includes('poudre') || lower.includes('palette') || lower.includes('teinte bronzante') || 
      lower.includes('perles') || lower.includes('bronzer') || lower.includes('cc crème') || 
      lower.includes('cc creme') || lower.includes('bb crème') || lower.includes('bb creme') || 
      lower.includes('fond de teint') || lower.includes('anti-cernes') || lower.includes('anticernes') ||
      lower.includes('correcteur') || lower.includes('cache-cernes') || lower.includes('waunt 8 hour sleep') ||
      lower.includes('mascara') || lower.includes('rouge à lèvres') || lower.includes('rouge a levres') || 
      lower.includes('super pout') || lower.includes('fard') || lower.includes('ombre à paupières') || 
      lower.includes('ombre a paupieres') || lower.includes('highlighter') || lower.includes('illuminateur') ||
      lower.includes('blush') || lower.includes('vernis') || lower.includes('top coat') || 
      lower.includes('eyeliner') || lower.includes('eye-liner') || lower.includes('sourcils') || 
      lower.includes('gloss') || lower.includes('crayon') || lower.includes('oncolour') || 
      lower.includes('the one colour') || lower.includes('the one') || lower.includes('lip spa') || 
      lower.includes('illuminate') || lower.includes('lèvres') || lower.includes('levres')) {
    return 'Makeup';
  }

  // 2. HAIRCARE
  if (lower.includes('shampooing') || lower.includes('après-shampooing') || lower.includes('apres-shampooing') || 
      lower.includes('capillaire') || (lower.includes('cheveux') && !lower.includes('brume')) || 
      lower.includes('coiffant') || lower.includes('eleo') || lower.includes('hairx') || 
      lower.includes('duolog')) {
    return 'Haircare';
  }

  // 3. WELLNESS
  if (lower.includes('astaxanthine') || lower.includes('oméga 3') || lower.includes('omega 3') || 
      lower.includes('complément alimentaire') || lower.includes('shake wellness') || lower.includes('soupe wellness') ||
      lower.includes('calcium marin')) {
    return 'Wellness';
  }

  // 4. FRAGRANCE
  const isFragranceFormulation = 
    lower.includes('eau de toilette') || 
    lower.includes('eau de parfum') || 
    lower.includes('extrait de parfum') || 
    lower.includes('brume parfumée') || 
    lower.includes('brume parfumee') || 
    lower.includes('parfum brume') || 
    lower.includes('body mist') || 
    lower.includes('cologne');

  if (isFragranceFormulation) {
    return 'Fragrance';
  }

  if (/\bparfum\b/i.test(lower) && !lower.includes('crème') && !lower.includes('savon') && !lower.includes('déodorant')) {
    return 'Fragrance';
  }

  if (lower.includes('all or nothing') || lower.includes('be the legend') || lower.includes('joyce rose') ||
      lower.includes('ascendant') || lower.includes('glacier') || lower.includes('elvie') || 
      lower.includes('lucia') || lower.includes('whispers of me') || lower.includes('top scents') ||
      lower.includes('so fever') || lower.includes('venture power') || lower.includes('agave power') ||
      lower.includes('scope earth') || lower.includes('sweetheart rose') || lower.includes('drama queen')) {
    return 'Fragrance';
  }

  // 5. MAKEUP FALLBACKS
  if (lower.includes('the one') || lower.includes('giordani gold')) {
    if (lower.includes('lèvres') || lower.includes('levres') || lower.includes('yeux') || lower.includes('teint')) {
      return 'Makeup';
    }
  }

  // 6. DEFAULT FALLBACK
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